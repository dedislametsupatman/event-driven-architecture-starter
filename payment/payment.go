package payment

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"encore.app/auth"
	"encore.dev/beta/errs"
	"encore.dev/pubsub"
	"encore.dev/rlog"
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("payment", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

type PaymentSuccessEvent struct {
	OrderID         int64     `json:"order_id"`
	ExternalOrderID string    `json:"external_order_id,omitempty"`
	PaymentMethod   string    `json:"payment_method"`
	Amount          int64     `json:"amount"`
	TransactionID   string    `json:"transaction_id"`
	PaidAt          time.Time `json:"paid_at"`
}

type PaymentFailedEvent struct {
	OrderID         int64  `json:"order_id"`
	ExternalOrderID string `json:"external_order_id,omitempty"`
	TransactionID   string `json:"transaction_id,omitempty"`
	Status          string `json:"status"` // "expired" or "cancelled"
	Reason          string `json:"reason,omitempty"`
}

// PaymentSuccessTopic is published when a payment is verified (via QRISGate, Duitku or manual approval).
var PaymentSuccessTopic = pubsub.NewTopic[*PaymentSuccessEvent]("payment-success", pubsub.TopicConfig{
	DeliveryGuarantee: pubsub.AtLeastOnce,
})

// PaymentFailedTopic is published when a payment expires or is cancelled.
var PaymentFailedTopic = pubsub.NewTopic[*PaymentFailedEvent]("payment-failed", pubsub.TopicConfig{
	DeliveryGuarantee: pubsub.AtLeastOnce,
})

type BankAccount struct {
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
}

type PaymentMethodsResponse struct {
	ManualBanks        []BankAccount `json:"manual_banks"`
	QRISImageUrl       string        `json:"qris_image_url"`
	QRISGateActive     bool          `json:"qrisgate_active"`
	DuitkuActive       bool          `json:"duitku_active"`
	DuitkuSandbox      bool          `json:"duitku_sandbox"`
	DuitkuMerchantCode string        `json:"duitku_merchant_code,omitempty"`
	// Backward compatibility field
	MidtransActive bool `json:"midtrans_active"`
}

type DuitkuSettings struct {
	MerchantCode string `json:"merchant_code"`
	ApiKey       string `json:"api_key,omitempty"`
	HasApiKey    bool   `json:"has_api_key"`
	Sandbox      bool   `json:"sandbox"`
	Enabled      bool   `json:"enabled"`
	ExpiryPeriod int    `json:"expiry_period"`
	CallbackURL  string `json:"callback_url,omitempty"`
}

func getDuitkuConfig(ctx context.Context) (merchantCode, apiKey string, isSandbox, isEnabled bool, expiryPeriod int) {
	isSandbox = true
	isEnabled = false
	expiryPeriod = 1440 // 24 hours

	if db != nil {
		var mc, ak, sb, en, exp string
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'duitku_merchant_code'`).Scan(&mc)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'duitku_api_key'`).Scan(&ak)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'duitku_sandbox'`).Scan(&sb)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'duitku_enabled'`).Scan(&en)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'duitku_expiry_period'`).Scan(&exp)

		merchantCode = strings.TrimSpace(mc)
		apiKey = strings.TrimSpace(ak)
		if sb != "" {
			isSandbox = sb == "true"
		}
		if en != "" {
			isEnabled = en == "true"
		}
		if exp != "" {
			if parsed, err := strconv.Atoi(exp); err == nil && parsed > 0 {
				expiryPeriod = parsed
			}
		}
	}

	// Environment variable fallback
	if merchantCode == "" {
		merchantCode = strings.TrimSpace(os.Getenv("DUITKU_MERCHANT_CODE"))
	}
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("DUITKU_API_KEY"))
	}
	if os.Getenv("DUITKU_SANDBOX") != "" {
		isSandbox = os.Getenv("DUITKU_SANDBOX") == "true"
	}
	if os.Getenv("DUITKU_ENABLED") != "" {
		isEnabled = os.Getenv("DUITKU_ENABLED") == "true"
	}

	return
}

// Methods returns available payment options (Manual Transfer, QRIS, QRISGate, Duitku).
//
//encore:api public method=GET path=/payment/methods
func Methods(ctx context.Context) (*PaymentMethodsResponse, error) {
	merchantCode, _, isSandbox, isEnabled, _ := getDuitkuConfig(ctx)
	_, _, _, qrisGateEnabled := getQRISGateConfig(ctx)

	return &PaymentMethodsResponse{
		ManualBanks: []BankAccount{
			{
				BankName:      "BCA (Bank Central Asia)",
				AccountNumber: "8001234567",
				AccountHolder: "Dedi Supatman",
			},
			{
				BankName:      "Bank Mandiri",
				AccountNumber: "1370019876543",
				AccountHolder: "Dedi Supatman",
			},
		},
		QRISImageUrl:       "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=00020101021226610016ID.CO.QRIS.WWW0118936009990000000001021000000000005204581253033605802ID5913MYSTORE6007BANDUNG61054011562070703A016304E8A5",
		QRISGateActive:     qrisGateEnabled,
		DuitkuActive:       isEnabled && merchantCode != "",
		DuitkuSandbox:      isSandbox,
		DuitkuMerchantCode: merchantCode,
		MidtransActive:     false,
	}, nil
}

// GetSettings retrieves current Duitku payment gateway configuration (admin only).
//
//encore:api auth method=GET path=/payment/settings
func GetSettings(ctx context.Context) (*DuitkuSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	merchantCode, apiKey, isSandbox, isEnabled, expiryPeriod := getDuitkuConfig(ctx)

	return &DuitkuSettings{
		MerchantCode: merchantCode,
		HasApiKey:    apiKey != "",
		Sandbox:      isSandbox,
		Enabled:      isEnabled,
		ExpiryPeriod: expiryPeriod,
	}, nil
}

// UpdateSettings saves Duitku payment gateway configuration (admin only).
//
//encore:api auth method=POST path=/payment/settings
func UpdateSettings(ctx context.Context, p *DuitkuSettings) (*DuitkuSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	upsert := func(key, val string) error {
		_, err := db.Exec(ctx, `
			INSERT INTO payment_settings (key, value, updated_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
		`, key, val)
		return err
	}

	if err := upsert("duitku_merchant_code", strings.TrimSpace(p.MerchantCode)); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan merchant code: %v", err)}
	}

	if strings.TrimSpace(p.ApiKey) != "" {
		if err := upsert("duitku_api_key", strings.TrimSpace(p.ApiKey)); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan api key: %v", err)}
		}
	}

	sandboxStr := "false"
	if p.Sandbox {
		sandboxStr = "true"
	}
	if err := upsert("duitku_sandbox", sandboxStr); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan mode sandbox: %v", err)}
	}

	enabledStr := "false"
	if p.Enabled {
		enabledStr = "true"
	}
	if err := upsert("duitku_enabled", enabledStr); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan status enabled: %v", err)}
	}

	if p.ExpiryPeriod <= 0 {
		p.ExpiryPeriod = 1440
	}
	if err := upsert("duitku_expiry_period", fmt.Sprintf("%d", p.ExpiryPeriod)); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan expiry period: %v", err)}
	}

	savedMerchantCode, savedApiKey, isSandbox, isEnabled, expiryPeriod := getDuitkuConfig(ctx)
	return &DuitkuSettings{
		MerchantCode: savedMerchantCode,
		HasApiKey:    savedApiKey != "",
		Sandbox:      isSandbox,
		Enabled:      isEnabled,
		ExpiryPeriod: expiryPeriod,
	}, nil
}

type CreateDuitkuInvoiceParams struct {
	OrderID        int64  `json:"order_id"`
	PaymentAmount  int64  `json:"payment_amount"`
	ProductDetails string `json:"product_details"`
	CustomerName   string `json:"customer_name"`
	CustomerEmail  string `json:"customer_email"`
	CustomerPhone  string `json:"customer_phone"`
	ReturnURL      string `json:"return_url,omitempty"`
	CallbackURL    string `json:"callback_url,omitempty"`
}

type DuitkuInvoiceResponse struct {
	Reference     string `json:"reference"`
	PaymentURL    string `json:"payment_url"`
	StatusCode    string `json:"status_code"`
	StatusMessage string `json:"status_message"`
	Sandbox       bool   `json:"sandbox"`
}

// CreateDuitkuInvoice generates a Duitku POP transaction reference and URL.
//
//encore:api public method=POST path=/payment/duitku/create
func CreateDuitkuInvoice(ctx context.Context, p *CreateDuitkuInvoiceParams) (*DuitkuInvoiceResponse, error) {
	merchantCode, apiKey, isSandbox, isEnabled, expiryPeriod := getDuitkuConfig(ctx)

	if !isEnabled {
		return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "Metode pembayaran Duitku sedang tidak aktif"}
	}

	if p.ProductDetails == "" {
		p.ProductDetails = fmt.Sprintf("Pesanan #%d Supatman Store", p.OrderID)
	}
	if p.CustomerName == "" {
		p.CustomerName = "Pelanggan"
	}

	// Mock mode for local testing if API key or Merchant Code is not yet set
	if merchantCode == "" || apiKey == "" {
		mockRef := fmt.Sprintf("MOCK-DUITKU-ORDER-%d", p.OrderID)
		return &DuitkuInvoiceResponse{
			Reference:     mockRef,
			PaymentURL:    "",
			StatusCode:    "00",
			StatusMessage: "SUCCESS (Mode Pengujian Lokal)",
			Sandbox:       true,
		}, nil
	}

	baseURL := "https://api-sandbox.duitku.com"
	if !isSandbox {
		baseURL = "https://api-prod.duitku.com"
	}

	timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())

	// Signature formula: sha256(merchantCode + timestamp + apiKey)
	hashInput := merchantCode + timestamp + apiKey
	hasher := sha256.New()
	hasher.Write([]byte(hashInput))
	signature := hex.EncodeToString(hasher.Sum(nil))

	merchantOrderID := fmt.Sprintf("ORDER-%d-%d", p.OrderID, time.Now().Unix())

	callbackURL := p.CallbackURL
	if callbackURL == "" {
		callbackURL = "http://localhost:4000/payment/duitku/callback"
	}

	returnURL := p.ReturnURL
	if returnURL == "" {
		returnURL = "http://localhost:4000/orders"
	}

	reqPayload := map[string]any{
		"paymentAmount":   p.PaymentAmount,
		"merchantOrderId": merchantOrderID,
		"productDetails":  p.ProductDetails,
		"email":           p.CustomerEmail,
		"phoneNumber":     p.CustomerPhone,
		"customerVaName":  p.CustomerName,
		"callbackUrl":     callbackURL,
		"returnUrl":       returnURL,
		"expiryPeriod":    expiryPeriod,
	}

	reqBody, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	endpointURL := baseURL + "/api/merchant/createInvoice"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpointURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-duitku-signature", signature)
	httpReq.Header.Set("x-duitku-timestamp", timestamp)
	httpReq.Header.Set("x-duitku-merchantcode", merchantCode)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, &errs.Error{Code: errs.Unavailable, Message: fmt.Sprintf("Gagal menghubungi server Duitku: %v", err)}
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "Gagal membaca respons dari Duitku"}
	}

	var result struct {
		StatusCode    string `json:"statusCode"`
		StatusMessage string `json:"statusMessage"`
		Reference     string `json:"reference"`
		PaymentURL    string `json:"paymentUrl"`
	}

	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, &errs.Error{
			Code:    errs.Internal,
			Message: fmt.Sprintf("Format respons Duitku tidak valid: %s", string(respBytes)),
		}
	}

	if result.StatusCode != "00" && result.StatusCode != "" {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: fmt.Sprintf("Duitku Error [%s]: %s", result.StatusCode, result.StatusMessage),
		}
	}

	return &DuitkuInvoiceResponse{
		Reference:     result.Reference,
		PaymentURL:    result.PaymentURL,
		StatusCode:    result.StatusCode,
		StatusMessage: result.StatusMessage,
		Sandbox:       isSandbox,
	}, nil
}

// DuitkuCallback handles asynchronous HTTP POST notifications (webhooks) from Duitku POP.
//
//encore:api public raw path=/payment/duitku/callback
func DuitkuCallback(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()

	bodyBytes, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "bad request body", http.StatusBadRequest)
		return
	}

	var merchantCode, amount, merchantOrderId, signature, resultCode, reference string

	// Attempt 1: Parse as JSON
	var jsonPayload struct {
		MerchantCode    string `json:"merchantCode"`
		Amount          string `json:"amount"`
		MerchantOrderID string `json:"merchantOrderId"`
		Signature       string `json:"signature"`
		ResultCode      string `json:"resultCode"`
		Reference       string `json:"reference"`
	}
	if err := json.Unmarshal(bodyBytes, &jsonPayload); err == nil && jsonPayload.MerchantCode != "" {
		merchantCode = jsonPayload.MerchantCode
		amount = jsonPayload.Amount
		merchantOrderId = jsonPayload.MerchantOrderID
		signature = jsonPayload.Signature
		resultCode = jsonPayload.ResultCode
		reference = jsonPayload.Reference
	} else {
		// Attempt 2: Parse as form urlencoded
		req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		_ = req.ParseForm()
		merchantCode = req.FormValue("merchantCode")
		amount = req.FormValue("amount")
		merchantOrderId = req.FormValue("merchantOrderId")
		signature = req.FormValue("signature")
		resultCode = req.FormValue("resultCode")
		reference = req.FormValue("reference")
	}

	if merchantCode == "" || merchantOrderId == "" || signature == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	_, apiKey, _, _, _ := getDuitkuConfig(ctx)

	// Validate signature: md5(merchantCode + amount + merchantOrderId + apiKey)
	if apiKey != "" {
		hashInput := merchantCode + amount + merchantOrderId + apiKey
		hasher := md5.New()
		hasher.Write([]byte(hashInput))
		expectedSignature := hex.EncodeToString(hasher.Sum(nil))

		if !strings.EqualFold(signature, expectedSignature) {
			rlog.Warn("duitku callback invalid signature", "order_id", merchantOrderId, "received", signature, "expected", expectedSignature)
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
	}

	// ResultCode "00" indicates successful payment
	if resultCode == "00" {
		var orderID int64
		// Supports ORDER-123 or ORDER-123-timestamp or 123
		if strings.HasPrefix(merchantOrderId, "ORDER-") {
			parts := strings.Split(merchantOrderId, "-")
			if len(parts) >= 2 {
				parsed, err := strconv.ParseInt(parts[1], 10, 64)
				if err == nil {
					orderID = parsed
				}
			}
		} else {
			parsed, err := strconv.ParseInt(merchantOrderId, 10, 64)
			if err == nil {
				orderID = parsed
			}
		}

		if orderID > 0 {
			var amountInt int64
			if parsed, err := strconv.ParseInt(amount, 10, 64); err == nil {
				amountInt = parsed
			}

			_, err = PaymentSuccessTopic.Publish(ctx, &PaymentSuccessEvent{
				OrderID:       orderID,
				PaymentMethod: "duitku",
				Amount:        amountInt,
				TransactionID: reference,
				PaidAt:        time.Now(),
			})
			if err != nil {
				rlog.Error("failed to publish payment success event", "order_id", orderID, "err", err)
			}
		}
	}

	// Duitku requires HTTP 200 with "OK"
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

type ManualConfirmParams struct {
	OrderID       int64  `json:"order_id"`
	TransactionID string `json:"transaction_id"`
	Amount        int64  `json:"amount"`
}

// ConfirmManualPayment approves a manual bank transfer or QRIS payment (admin only).
//
//encore:api auth method=POST path=/payment/manual/confirm
func ConfirmManualPayment(ctx context.Context, p *ManualConfirmParams) error {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	_, err = PaymentSuccessTopic.Publish(ctx, &PaymentSuccessEvent{
		OrderID:       p.OrderID,
		PaymentMethod: "manual_transfer",
		Amount:        p.Amount,
		TransactionID: p.TransactionID,
		PaidAt:        time.Now(),
	})
	return err
}

// Backward compatibility: CreateSnapToken redirects to Duitku creation or returns mock
//
//encore:api public method=POST path=/payment/midtrans/token
func CreateSnapToken(ctx context.Context, p *CreateDuitkuInvoiceParams) (*DuitkuInvoiceResponse, error) {
	return CreateDuitkuInvoice(ctx, p)
}
