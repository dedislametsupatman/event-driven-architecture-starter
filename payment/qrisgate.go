package payment

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"encore.app/auth"
	"encore.dev/beta/errs"
	"encore.dev/rlog"
	"encore.dev/storage/sqldb"
)

const defaultQRISGateBaseURL = "https://qrisgate.web.id"

type QRISGateSettings struct {
	BaseURL          string `json:"base_url"`
	ApiKey           string `json:"api_key,omitempty"`
	HasApiKey        bool   `json:"has_api_key"`
	WebhookSecret    string `json:"webhook_secret,omitempty"`
	HasWebhookSecret bool   `json:"has_webhook_secret"`
	Enabled          bool   `json:"enabled"`
}

// getQRISGateConfig resolves QRISGate credentials with database settings (Admin CMS)
// taking highest priority, and environment variables acting as fallback.
func getQRISGateConfig(ctx context.Context) (baseURL, apiKey, webhookSecret string, isEnabled bool) {
	baseURL = defaultQRISGateBaseURL
	isEnabled = true

	// 1. Fallback to server environment variables if available
	if envURL := strings.TrimSpace(os.Getenv("QRISGATE_BASE_URL")); envURL != "" {
		baseURL = strings.TrimRight(envURL, "/")
	}
	if envKey := strings.TrimSpace(os.Getenv("QRISGATE_API_KEY")); envKey != "" {
		apiKey = envKey
	}
	if envSecret := strings.TrimSpace(os.Getenv("QRISGATE_WEBHOOK_SECRET")); envSecret != "" {
		webhookSecret = envSecret
	}
	if envEn := strings.TrimSpace(os.Getenv("QRISGATE_ENABLED")); envEn != "" {
		isEnabled = envEn == "true"
	}

	// 2. Settings saved via Admin CMS in database take precedence (user preference in UI)
	if db != nil {
		var dbURL, dbKey, dbSecret, dbEnabled string
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'qrisgate_base_url'`).Scan(&dbURL)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'qrisgate_api_key'`).Scan(&dbKey)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'qrisgate_webhook_secret'`).Scan(&dbSecret)
		_ = db.QueryRow(ctx, `SELECT value FROM payment_settings WHERE key = 'qrisgate_enabled'`).Scan(&dbEnabled)

		if strings.TrimSpace(dbURL) != "" {
			baseURL = strings.TrimRight(strings.TrimSpace(dbURL), "/")
		}
		if strings.TrimSpace(dbKey) != "" {
			apiKey = strings.TrimSpace(dbKey)
		}
		if strings.TrimSpace(dbSecret) != "" {
			webhookSecret = strings.TrimSpace(dbSecret)
		}
		if dbEnabled != "" {
			isEnabled = dbEnabled == "true"
		}
	}

	return
}

// GetQRISGateSettings retrieves QRISGate configuration for Admin CMS (never exposes raw keys).
//
//encore:api auth method=GET path=/payment/qrisgate/settings
func GetQRISGateSettings(ctx context.Context) (*QRISGateSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	baseURL, apiKey, webhookSecret, isEnabled := getQRISGateConfig(ctx)
	return &QRISGateSettings{
		BaseURL:          baseURL,
		HasApiKey:        apiKey != "",
		HasWebhookSecret: webhookSecret != "",
		Enabled:          isEnabled,
	}, nil
}

// UpdateQRISGateSettings updates QRISGate configuration from Admin CMS.
//
//encore:api auth method=POST path=/payment/qrisgate/settings
func UpdateQRISGateSettings(ctx context.Context, p *QRISGateSettings) (*QRISGateSettings, error) {
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

	cleanURL := strings.TrimRight(strings.TrimSpace(p.BaseURL), "/")
	if cleanURL == "" {
		cleanURL = defaultQRISGateBaseURL
	}
	if err := upsert("qrisgate_base_url", cleanURL); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan base URL: %v", err)}
	}

	if strings.TrimSpace(p.ApiKey) != "" {
		if err := upsert("qrisgate_api_key", strings.TrimSpace(p.ApiKey)); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan API key: %v", err)}
		}
	}

	if strings.TrimSpace(p.WebhookSecret) != "" {
		if err := upsert("qrisgate_webhook_secret", strings.TrimSpace(p.WebhookSecret)); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan webhook secret: %v", err)}
		}
	}

	enabledStr := "false"
	if p.Enabled {
		enabledStr = "true"
	}
	if err := upsert("qrisgate_enabled", enabledStr); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan status enabled: %v", err)}
	}

	baseURL, apiKey, webhookSecret, isEnabled := getQRISGateConfig(ctx)
	return &QRISGateSettings{
		BaseURL:          baseURL,
		HasApiKey:        apiKey != "",
		HasWebhookSecret: webhookSecret != "",
		Enabled:          isEnabled,
	}, nil
}

type CreateQRISGateParams = CreateQRISGateTxParams

type CreateQRISGateTxParams struct {
	OrderID         int64  `json:"order_id"`
	ExternalOrderID string `json:"external_order_id"`
	Amount          int64  `json:"amount"`
	CustomerName    string `json:"customer_name"`
	CustomerEmail   string `json:"customer_email,omitempty"`
	CustomerPhone   string `json:"customer_phone,omitempty"`
	PaymentMethod   string `json:"payment_method,omitempty"` // "QRIS" or "BANK_TRANSFER"
	BankCode        string `json:"bank_code,omitempty"`      // e.g. "BCA"
	ReturnURL       string `json:"return_url,omitempty"`
}

type QRISGateTxData struct {
	TransactionID   string     `json:"transaction_id"`
	ExternalOrderID string     `json:"external_order_id"`
	PaymentMethod   string     `json:"payment_method"`
	BaseAmount      int64      `json:"base_amount"`
	UniqueCode      int64      `json:"unique_code"`
	TotalAmount     int64      `json:"total_amount"`
	Status          string     `json:"status"`
	QRString        string     `json:"qr_string"`
	CheckoutURL     string     `json:"checkout_url"`
	ExpiresAt       string     `json:"expires_at"`
	PaidAt          *time.Time `json:"paid_at,omitempty"`
}

// CreateQRISGateTransaction calls POST /api/v1/transactions on QRISGate and persists the transaction.
//
//encore:api public method=POST path=/payment/qrisgate/create
func CreateQRISGateTransaction(ctx context.Context, p *CreateQRISGateTxParams) (*QRISGateTxData, error) {
	if p.Amount < 1 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Nominal pembayaran minimal Rp 1 (integer IDR tanpa desimal)"}
	}
	if p.ExternalOrderID == "" {
		if p.OrderID > 0 {
			p.ExternalOrderID = fmt.Sprintf("ORD-%d", p.OrderID)
		} else {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "external_order_id wajib diisi"}
		}
	}
	if strings.TrimSpace(p.CustomerName) == "" {
		p.CustomerName = "Pelanggan"
	}

	paymentMethod := strings.ToUpper(strings.TrimSpace(p.PaymentMethod))
	if paymentMethod != "BANK_TRANSFER" {
		paymentMethod = "QRIS"
	}

	// If an active pending transaction already exists for this external_order_id, return it idempotently
	if db != nil {
		var existing QRISGateTxData
		var expiresAt time.Time
		err := db.QueryRow(ctx, `
			SELECT transaction_id, external_order_id, payment_method, base_amount, unique_code,
			       total_amount, status, qr_string, checkout_url, expires_at
			FROM qrisgate_transactions
			WHERE external_order_id = $1
		`, p.ExternalOrderID).Scan(
			&existing.TransactionID, &existing.ExternalOrderID, &existing.PaymentMethod,
			&existing.BaseAmount, &existing.UniqueCode, &existing.TotalAmount,
			&existing.Status, &existing.QRString, &existing.CheckoutURL, &expiresAt,
		)
		if err == nil && existing.CheckoutURL != "" && (existing.Status == "PENDING" || existing.Status == "PAID") {
			existing.ExpiresAt = expiresAt.Format(time.RFC3339)
			return &existing, nil
		}
	}

	baseURL, apiKey, _, isEnabled := getQRISGateConfig(ctx)
	if !isEnabled {
		return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "Pembayaran QRISGate sedang dinonaktifkan"}
	}
	if apiKey == "" {
		return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "QRISGATE_API_KEY belum dikonfigurasi di server"}
	}

	reqBodyMap := map[string]any{
		"external_order_id": p.ExternalOrderID,
		"amount":            p.Amount, // Exact integer IDR
		"customer_name":     p.CustomerName,
		"payment_method":    paymentMethod,
	}
	if p.ReturnURL != "" {
		reqBodyMap["return_url"] = p.ReturnURL
	}
	if paymentMethod == "BANK_TRANSFER" && strings.TrimSpace(p.BankCode) != "" {
		reqBodyMap["bank_code"] = strings.ToUpper(strings.TrimSpace(p.BankCode))
	}

	reqBytes, err := json.Marshal(reqBodyMap)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	endpoint := baseURL + "/api/v1/transactions"
	client := &http.Client{Timeout: 15 * time.Second}

	var resp *http.Response
	var respBytes []byte

	// Retry loop with exponential backoff for 429 Rate Limit
	maxAttempts := 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		httpReq, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBytes))
		if reqErr != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: reqErr.Error()}
		}
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err = client.Do(httpReq)
		if err != nil {
			if attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*500) * time.Millisecond)
				continue
			}
			return nil, &errs.Error{Code: errs.Unavailable, Message: fmt.Sprintf("Gagal menghubungi QRISGate: %v", err)}
		}

		respBytes, _ = io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests && attempt < maxAttempts {
			backoff := time.Duration(1<<uint(attempt-1)) * 500 * time.Millisecond
			rlog.Warn("QRISGate rate limited (429), retrying with backoff", "attempt", attempt, "backoff", backoff)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff):
				continue
			}
		}
		break
	}

	// Explicit handling of QRISGate error codes per specification
	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated:
		// Success
	case http.StatusPaymentRequired: // 402
		return nil, &errs.Error{
			Code:    errs.FailedPrecondition,
			Message: "Saldo kredit merchant QRISGate habis (402 Payment Required). Silakan top up saldo atau aktifkan langganan di dashboard QRISGate.",
		}
	case http.StatusBadRequest, http.StatusUnprocessableEntity: // 400 / 422
		var errResp struct {
			Error   string `json:"error"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(respBytes, &errResp)
		msg := errResp.Error
		if msg == "" {
			msg = errResp.Message
		}
		if msg == "" {
			msg = string(respBytes)
		}
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: fmt.Sprintf("Validasi transaksi QRISGate gagal (400): %s", msg),
		}
	case http.StatusTooManyRequests: // 429
		return nil, &errs.Error{
			Code:    errs.ResourceExhausted,
			Message: "Terlalu banyak permintaan ke QRISGate (429 Rate Limit). Silakan coba beberapa saat lagi.",
		}
	case http.StatusUnauthorized, http.StatusForbidden: // 401 / 403
		return nil, &errs.Error{
			Code:    errs.Unauthenticated,
			Message: "Autentikasi QRISGate gagal: periksa QRISGATE_API_KEY di server.",
		}
	default:
		return nil, &errs.Error{
			Code:    errs.Unavailable,
			Message: fmt.Sprintf("QRISGate mengembalikan HTTP %d: %s", resp.StatusCode, string(respBytes)),
		}
	}

	var apiResp struct {
		Success bool           `json:"success"`
		Error   string         `json:"error"`
		Data    QRISGateTxData `json:"data"`
	}
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return nil, &errs.Error{
			Code:    errs.Internal,
			Message: fmt.Sprintf("Gagal membaca respons JSON dari QRISGate: %v", err),
		}
	}
	if !apiResp.Success && apiResp.Data.TransactionID == "" {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: fmt.Sprintf("QRISGate menolak pembuatan transaksi: %s", apiResp.Error),
		}
	}

	txData := apiResp.Data
	if txData.ExternalOrderID == "" {
		txData.ExternalOrderID = p.ExternalOrderID
	}
	if txData.BaseAmount == 0 {
		txData.BaseAmount = p.Amount
	}
	if txData.TotalAmount == 0 {
		txData.TotalAmount = txData.BaseAmount + txData.UniqueCode
	}
	if txData.Status == "" {
		txData.Status = "PENDING"
	}
	if txData.PaymentMethod == "" {
		txData.PaymentMethod = paymentMethod
	}

	expiresAt := time.Now().Add(15 * time.Minute)
	if txData.ExpiresAt != "" {
		if parsed, parseErr := time.Parse(time.RFC3339, txData.ExpiresAt); parseErr == nil {
			expiresAt = parsed
		}
	} else {
		txData.ExpiresAt = expiresAt.Format(time.RFC3339)
	}

	// Persist transaction in database with PENDING status
	if db != nil {
		_, dbErr := db.Exec(ctx, `
			INSERT INTO qrisgate_transactions (
				order_id, external_order_id, transaction_id, payment_method, bank_code,
				base_amount, unique_code, total_amount, checkout_url, qr_string,
				status, expires_at, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11, NOW(), NOW())
			ON CONFLICT (external_order_id) DO UPDATE SET
				transaction_id = EXCLUDED.transaction_id,
				base_amount = EXCLUDED.base_amount,
				unique_code = EXCLUDED.unique_code,
				total_amount = EXCLUDED.total_amount,
				checkout_url = EXCLUDED.checkout_url,
				qr_string = EXCLUDED.qr_string,
				status = EXCLUDED.status,
				expires_at = EXCLUDED.expires_at,
				updated_at = NOW()
		`, p.OrderID, txData.ExternalOrderID, txData.TransactionID, txData.PaymentMethod, p.BankCode,
			txData.BaseAmount, txData.UniqueCode, txData.TotalAmount, txData.CheckoutURL, txData.QRString,
			expiresAt)
		if dbErr != nil {
			rlog.Error("failed to save qrisgate transaction to db", "external_order_id", txData.ExternalOrderID, "err", dbErr)
		}
	}

	return &txData, nil
}

// VerifyQRISGateSignature validates the webhook HMAC-SHA256 signature and anti-replay timestamp window (5 minutes).
// Supports both HMAC_SHA256(timestamp + "." + rawBody, secret) and HMAC_SHA256(rawBody, secret) in constant time.
func VerifyQRISGateSignature(rawBody []byte, signatureHeader, timestampHeader, secret string, now time.Time) error {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return errors.New("webhook secret is not configured")
	}

	signatureHeader = strings.TrimSpace(signatureHeader)
	if signatureHeader == "" {
		return errors.New("missing x-qrisgate-signature header")
	}

	timestampHeader = strings.TrimSpace(timestampHeader)
	if timestampHeader == "" {
		return errors.New("missing x-qrisgate-timestamp header")
	}

	tsInt, err := strconv.ParseInt(timestampHeader, 10, 64)
	if err != nil {
		return errors.New("invalid x-qrisgate-timestamp format")
	}
	// If timestamp is in milliseconds (> 1e11), convert to seconds
	if tsInt > 100000000000 {
		tsInt = tsInt / 1000
	}

	diffSeconds := math.Abs(float64(now.Unix() - tsInt))
	if diffSeconds > 300 {
		return fmt.Errorf("stale webhook timestamp: %.0f seconds old (max 300s)", diffSeconds)
	}

	cleanSigHex := strings.TrimPrefix(strings.ToLower(signatureHeader), "sha256=")
	providedSig, err := hex.DecodeString(cleanSigHex)
	if err != nil || len(providedSig) == 0 {
		return errors.New("invalid hex in x-qrisgate-signature")
	}

	// 1. Standard QRISGate docs format: HMAC-SHA256(timestamp + "." + rawBody, secret)
	macWithTs := hmac.New(sha256.New, []byte(secret))
	macWithTs.Write([]byte(timestampHeader))
	macWithTs.Write([]byte("."))
	macWithTs.Write(rawBody)
	expectedWithTs := macWithTs.Sum(nil)

	// 2. Direct rawBody format: HMAC-SHA256(rawBody, secret)
	macRaw := hmac.New(sha256.New, []byte(secret))
	macRaw.Write(rawBody)
	expectedRaw := macRaw.Sum(nil)

	// Constant-time comparison using crypto/hmac.Equal
	if !hmac.Equal(providedSig, expectedWithTs) && !hmac.Equal(providedSig, expectedRaw) {
		return errors.New("signature mismatch")
	}

	return nil
}

type QRISGateWebhookPayload struct {
	Event           string `json:"event"`
	EventID         string `json:"event_id"`
	TransactionID   string `json:"transaction_id"`
	ExternalOrderID string `json:"external_order_id"`
	BaseAmount      int64  `json:"base_amount"`
	UniqueCode      int64  `json:"unique_code"`
	TotalAmount     int64  `json:"total_amount"`
	CustomerName    string `json:"customer_name"`
	PaidAt          string `json:"paid_at"`
	CreatedAt       string `json:"created_at"`
}

// QRISGateWebhook receives and verifies signed payment webhooks from QRISGate.
//
//encore:api public raw method=POST path=/api/webhooks/qrisgate
func QRISGateWebhook(w http.ResponseWriter, req *http.Request) {
	handleQRISGateWebhook(w, req)
}

func handleQRISGateWebhook(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()

	// 1. Read exact RAW body bytes before any JSON parsing
	rawBody, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}

	sigHeader := req.Header.Get("X-QRISGate-Signature")
	tsHeader := req.Header.Get("X-QRISGate-Timestamp")
	deliveryID := strings.TrimSpace(req.Header.Get("X-QRISGate-Delivery-Id"))
	eventHeader := strings.TrimSpace(req.Header.Get("X-QRISGate-Event"))

	_, _, webhookSecret, _ := getQRISGateConfig(ctx)

	// 2 & 3. Verify HMAC-SHA256 signature (timing-safe) and 5-minute replay window
	if err := VerifyQRISGateSignature(rawBody, sigHeader, tsHeader, webhookSecret, time.Now()); err != nil {
		rlog.Warn("QRISGate webhook rejected", "reason", err.Error())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized","message":"` + err.Error() + `"}`))
		return
	}

	// Parse flat JSON payload after signature verification succeeds
	var payload QRISGateWebhookPayload
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		http.Error(w, "invalid json payload", http.StatusBadRequest)
		return
	}

	if payload.Event == "" && eventHeader != "" {
		payload.Event = eventHeader
	}

	// 4. Idempotency check using event_id / X-QRISGate-Delivery-Id
	eventID := deliveryID
	if eventID == "" {
		eventID = strings.TrimSpace(payload.EventID)
	}
	if eventID == "" {
		eventID = fmt.Sprintf("%s:%s:%s", payload.Event, payload.TransactionID, payload.ExternalOrderID)
	}

	if db != nil {
		res, dbErr := db.Exec(ctx, `
			INSERT INTO qrisgate_webhook_events (event_id, event_type, external_order_id, transaction_id, raw_payload, processed_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			ON CONFLICT (event_id) DO NOTHING
		`, eventID, payload.Event, payload.ExternalOrderID, payload.TransactionID, string(rawBody))
		if dbErr == nil && res.RowsAffected() == 0 {
			// Event already processed — return 200 OK idempotently
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"received":true,"idempotent":true}`))
			return
		}
	}

	// 5. Handle payment.paid (and expired/cancelled)
	switch payload.Event {
	case "payment.paid":
		paidAt := time.Now()
		if payload.PaidAt != "" {
			if parsed, pErr := time.Parse(time.RFC3339, payload.PaidAt); pErr == nil {
				paidAt = parsed
			}
		}

		var orderID int64
		if db != nil {
			_ = db.QueryRow(ctx, `
				UPDATE qrisgate_transactions
				SET status = 'PAID', paid_at = $1, updated_at = NOW()
				WHERE external_order_id = $2 OR transaction_id = $3
				RETURNING order_id
			`, paidAt, payload.ExternalOrderID, payload.TransactionID).Scan(&orderID)
		}

		if orderID == 0 {
			orderID = parseOrderIDFromExternal(payload.ExternalOrderID)
		}

		// Trigger asynchronous fulfillment via PubSub (<5s fast webhook response)
		if orderID > 0 {
			_, pubErr := PaymentSuccessTopic.Publish(ctx, &PaymentSuccessEvent{
				OrderID:         orderID,
				ExternalOrderID: payload.ExternalOrderID,
				PaymentMethod:   "qrisgate",
				Amount:          payload.TotalAmount,
				TransactionID:   payload.TransactionID,
				PaidAt:          paidAt,
			})
			if pubErr != nil {
				rlog.Error("failed to publish QRISGate payment success event", "order_id", orderID, "err", pubErr)
			}
		}

	case "payment.expired":
		if db != nil {
			_, _ = db.Exec(ctx, `
				UPDATE qrisgate_transactions
				SET status = 'EXPIRED', updated_at = NOW()
				WHERE (external_order_id = $1 OR transaction_id = $2) AND status = 'PENDING'
			`, payload.ExternalOrderID, payload.TransactionID)
		}

	case "payment.cancelled":
		if db != nil {
			_, _ = db.Exec(ctx, `
				UPDATE qrisgate_transactions
				SET status = 'CANCELLED', updated_at = NOW()
				WHERE (external_order_id = $1 OR transaction_id = $2) AND status = 'PENDING'
			`, payload.ExternalOrderID, payload.TransactionID)
		}
	}

	// 6. Always respond 200 quickly
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"received":true}`))
}

func parseOrderIDFromExternal(externalID string) int64 {
	externalID = strings.TrimSpace(externalID)
	for _, prefix := range []string{"ORD-", "ORDER-", "INV-"} {
		if strings.HasPrefix(strings.ToUpper(externalID), prefix) {
			rest := externalID[len(prefix):]
			parts := strings.Split(rest, "-")
			if id, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
				return id
			}
		}
	}
	if id, err := strconv.ParseInt(externalID, 10, 64); err == nil {
		return id
	}
	return 0
}

// CheckQRISGateTransaction queries GET /api/v1/transactions/{id} on QRISGate with Bearer API_KEY
// as a fallback when webhooks are delayed or blocked. If PAID, it triggers fulfillment idempotently.
//
//encore:api public method=GET path=/api/v1/transactions/:id
func CheckQRISGateTransaction(ctx context.Context, id string) (*QRISGateTxData, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "transaction id is required"}
	}

	var localTx QRISGateTxData
	var orderID int64
	var expiresAt time.Time
	var paidAt sqlNullTime

	if db != nil {
		// Look up by transaction_id, external_order_id, or numeric order_id
		orderIDCandidate, _ := strconv.ParseInt(id, 10, 64)
		err := db.QueryRow(ctx, `
			SELECT order_id, transaction_id, external_order_id, payment_method,
			       base_amount, unique_code, total_amount, status, qr_string, checkout_url, expires_at, paid_at
			FROM qrisgate_transactions
			WHERE transaction_id = $1 OR external_order_id = $1 OR ($2 > 0 AND order_id = $2)
			ORDER BY id DESC LIMIT 1
		`, id, orderIDCandidate).Scan(
			&orderID, &localTx.TransactionID, &localTx.ExternalOrderID, &localTx.PaymentMethod,
			&localTx.BaseAmount, &localTx.UniqueCode, &localTx.TotalAmount,
			&localTx.Status, &localTx.QRString, &localTx.CheckoutURL, &expiresAt, &paidAt,
		)
		if err != nil && !errors.Is(err, sqldb.ErrNoRows) {
			rlog.Warn("db lookup warning in CheckQRISGateTransaction", "err", err)
		}
		if !expiresAt.IsZero() {
			localTx.ExpiresAt = expiresAt.Format(time.RFC3339)
		}
		if paidAt.Valid {
			localTx.PaidAt = &paidAt.Time
		}
	}

	// If already PAID locally, return immediately without hitting upstream API
	if strings.ToUpper(localTx.Status) == "PAID" {
		return &localTx, nil
	}

	txIDToQuery := localTx.TransactionID
	if txIDToQuery == "" {
		txIDToQuery = id
	}

	baseURL, apiKey, _, _ := getQRISGateConfig(ctx)
	if apiKey == "" {
		if localTx.TransactionID != "" {
			return &localTx, nil
		}
		return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "QRISGATE_API_KEY belum dikonfigurasi"}
	}

	endpoint := fmt.Sprintf("%s/api/v1/transactions/%s", baseURL, txIDToQuery)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		if localTx.TransactionID != "" {
			return &localTx, nil
		}
		return nil, &errs.Error{Code: errs.Unavailable, Message: fmt.Sprintf("Gagal mengecek status ke QRISGate: %v", err)}
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusOK {
		var remoteResp struct {
			Success bool           `json:"success"`
			Data    QRISGateTxData `json:"data"`
		}
		if jsonErr := json.Unmarshal(respBytes, &remoteResp); jsonErr == nil && remoteResp.Data.TransactionID != "" {
			remote := remoteResp.Data
			remoteStatus := strings.ToUpper(remote.Status)

			if remoteStatus != "" && remoteStatus != strings.ToUpper(localTx.Status) {
				localTx.Status = remoteStatus
				if remoteStatus == "PAID" {
					now := time.Now()
					localTx.PaidAt = &now
					if db != nil {
						_, _ = db.Exec(ctx, `
							UPDATE qrisgate_transactions
							SET status = 'PAID', paid_at = COALESCE(paid_at, $1), updated_at = NOW()
							WHERE transaction_id = $2
						`, now, remote.TransactionID)
					}
					if orderID == 0 {
						orderID = parseOrderIDFromExternal(remote.ExternalOrderID)
					}
					if orderID > 0 {
						_, _ = PaymentSuccessTopic.Publish(ctx, &PaymentSuccessEvent{
							OrderID:         orderID,
							ExternalOrderID: remote.ExternalOrderID,
							PaymentMethod:   "qrisgate",
							Amount:          remote.TotalAmount,
							TransactionID:   remote.TransactionID,
							PaidAt:          now,
						})
					}
				} else if db != nil {
					_, _ = db.Exec(ctx, `
						UPDATE qrisgate_transactions
						SET status = $1, updated_at = NOW()
						WHERE transaction_id = $2 AND status = 'PENDING'
					`, remoteStatus, remote.TransactionID)
				}
			}

			if localTx.TransactionID == "" {
				return &remote, nil
			}
		}
	}

	if localTx.TransactionID != "" {
		return &localTx, nil
	}
	return nil, &errs.Error{Code: errs.NotFound, Message: "Transaksi tidak ditemukan"}
}

type sqlNullTime struct {
	Time  time.Time
	Valid bool
}

func (nt *sqlNullTime) Scan(value any) error {
	if value == nil {
		nt.Time, nt.Valid = time.Time{}, false
		return nil
	}
	if t, ok := value.(time.Time); ok {
		nt.Time, nt.Valid = t, true
		return nil
	}
	return nil
}
