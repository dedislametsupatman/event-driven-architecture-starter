package payment

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"encore.app/auth"
	"encore.dev/beta/errs"
	"encore.dev/pubsub"
	"encore.dev/rlog"
)

func getMidtransServerKey() string {
	return os.Getenv("MIDTRANS_SERVER_KEY")
}

func getMidtransClientKey() string {
	return os.Getenv("MIDTRANS_CLIENT_KEY")
}

type PaymentSuccessEvent struct {
	OrderID       int64     `json:"order_id"`
	PaymentMethod string    `json:"payment_method"`
	Amount        int64     `json:"amount"`
	TransactionID string    `json:"transaction_id"`
	PaidAt        time.Time `json:"paid_at"`
}

// PaymentSuccessTopic is published when a payment is verified (via Midtrans or manual admin approval).
var PaymentSuccessTopic = pubsub.NewTopic[*PaymentSuccessEvent]("payment-success", pubsub.TopicConfig{
	DeliveryGuarantee: pubsub.AtLeastOnce,
})

type BankAccount struct {
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
}

type PaymentMethodsResponse struct {
	ManualBanks    []BankAccount `json:"manual_banks"`
	QRISImageUrl   string        `json:"qris_image_url"`
	MidtransActive bool          `json:"midtrans_active"`
	MidtransClient string        `json:"midtrans_client_key,omitempty"`
}

// Methods returns available payment options (Manual Transfer, QRIS, Midtrans).
//
//encore:api public method=GET path=/payment/methods
func Methods(ctx context.Context) (*PaymentMethodsResponse, error) {
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
		QRISImageUrl:   "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=00020101021226610016ID.CO.QRIS.WWW0118936009990000000001021000000000005204581253033605802ID5913MYSTORE6007BANDUNG61054011562070703A016304E8A5",
		MidtransActive: getMidtransServerKey() != "",
		MidtransClient: getMidtransClientKey(),
	}, nil
}

type CreateSnapParams struct {
	OrderID     int64  `json:"order_id"`
	GrossAmount int64  `json:"gross_amount"`
	CustomerName string `json:"customer_name"`
	CustomerEmail string `json:"customer_email"`
}

type SnapTokenResponse struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
}

// CreateSnapToken generates a Midtrans Snap transaction token.
//
//encore:api public method=POST path=/payment/midtrans/token
func CreateSnapToken(ctx context.Context, p *CreateSnapParams) (*SnapTokenResponse, error) {
	if getMidtransServerKey() == "" {
		// Mock token for development when Midtrans API key is not yet set
		return &SnapTokenResponse{
			Token:       fmt.Sprintf("mock-snap-token-order-%d", p.OrderID),
			RedirectURL: fmt.Sprintf("https://app.sandbox.midtrans.com/snap/v2/vtweb/mock-%d", p.OrderID),
		}, nil
	}

	snapURL := "https://app.sandbox.midtrans.com/snap/v1/transactions"

	payload := map[string]any{
		"transaction_details": map[string]any{
			"order_id":     fmt.Sprintf("ORDER-%d-%d", p.OrderID, time.Now().Unix()),
			"gross_amount": p.GrossAmount,
		},
		"customer_details": map[string]any{
			"first_name": p.CustomerName,
			"email":      p.CustomerEmail,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	req, err := http.NewRequestWithContext(ctx, "POST", snapURL, bytes.NewReader(body))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	req.SetBasicAuth(getMidtransServerKey(), "")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, &errs.Error{Code: errs.Unavailable, Message: err.Error()}
	}
	defer resp.Body.Close()

	var result SnapTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to parse Midtrans response"}
	}

	return &result, nil
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

// Webhook handles asynchronous notifications from Midtrans.
//
//encore:api public raw path=/payment/midtrans/webhook
func Webhook(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()
	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	var payload struct {
		OrderID           string `json:"order_id"`
		StatusCode        string `json:"status_code"`
		GrossAmount       string `json:"gross_amount"`
		SignatureKey      string `json:"signature_key"`
		TransactionStatus string `json:"transaction_status"`
		FraudStatus       string `json:"fraud_status"`
		PaymentType       string `json:"payment_type"`
	}

	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// Signature verification if server key is set
	if sKey := getMidtransServerKey(); sKey != "" {
		hashInput := payload.OrderID + payload.StatusCode + payload.GrossAmount + sKey
		hasher := sha512.New()
		hasher.Write([]byte(hashInput))
		expectedSignature := fmt.Sprintf("%x", hasher.Sum(nil))

		if payload.SignatureKey != expectedSignature {
			rlog.Warn("midtrans webhook invalid signature", "order_id", payload.OrderID)
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
	}

	isPaid := false
	if payload.TransactionStatus == "capture" && payload.FraudStatus == "accept" {
		isPaid = true
	} else if payload.TransactionStatus == "settlement" {
		isPaid = true
	}

	if isPaid {
		var orderID int64
		fmt.Sscanf(payload.OrderID, "ORDER-%d", &orderID)
		if orderID > 0 {
			PaymentSuccessTopic.Publish(ctx, &PaymentSuccessEvent{
				OrderID:       orderID,
				PaymentMethod: payload.PaymentType,
				TransactionID: payload.OrderID,
				PaidAt:        time.Now(),
			})
		}
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}
