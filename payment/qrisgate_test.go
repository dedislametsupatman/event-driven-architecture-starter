package payment

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func computeHMAC(data, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyQRISGateSignature(t *testing.T) {
	secret := "whsec_test_secret_key_123456"
	rawBody := []byte(`{"event":"payment.paid","transaction_id":"tx_abc123","external_order_id":"ORD-101","base_amount":150000,"unique_code":7,"total_amount":150007,"customer_name":"Budi Santoso","paid_at":"2026-11-09T09:00:00Z"}`)
	now := time.Unix(1794200000, 0)
	validTimestamp := fmt.Sprintf("%d", now.Unix())

	t.Run("Valid signature with timestamp.rawBody format (Official Docs)", func(t *testing.T) {
		sig := computeHMAC(validTimestamp+"."+string(rawBody), secret)
		err := VerifyQRISGateSignature(rawBody, sig, validTimestamp, secret, now)
		if err != nil {
			t.Fatalf("expected valid signature to pass, got error: %v", err)
		}
	})

	t.Run("Valid signature with rawBody only format", func(t *testing.T) {
		sig := computeHMAC(string(rawBody), secret)
		err := VerifyQRISGateSignature(rawBody, sig, validTimestamp, secret, now)
		if err != nil {
			t.Fatalf("expected valid rawBody signature to pass, got error: %v", err)
		}
	})

	t.Run("Valid signature with sha256= prefix", func(t *testing.T) {
		sig := "sha256=" + computeHMAC(string(rawBody), secret)
		err := VerifyQRISGateSignature(rawBody, sig, validTimestamp, secret, now)
		if err != nil {
			t.Fatalf("expected sha256= prefixed signature to pass, got error: %v", err)
		}
	})

	t.Run("Rejects invalid signature", func(t *testing.T) {
		sig := computeHMAC("wrong_payload", secret)
		err := VerifyQRISGateSignature(rawBody, sig, validTimestamp, secret, now)
		if err == nil {
			t.Fatal("expected invalid signature to be rejected, but got nil")
		}
	})

	t.Run("Rejects tampered body (even 1 byte changed)", func(t *testing.T) {
		sig := computeHMAC(validTimestamp+"."+string(rawBody), secret)
		tamperedBody := bytes.Replace(rawBody, []byte("150007"), []byte("150008"), 1)
		err := VerifyQRISGateSignature(tamperedBody, sig, validTimestamp, secret, now)
		if err == nil {
			t.Fatal("expected tampered body to fail signature verification, but got nil")
		}
	})

	t.Run("Rejects expired timestamp (> 5 minutes old / anti-replay)", func(t *testing.T) {
		expiredTime := now.Add(-6 * time.Minute)
		expiredTS := fmt.Sprintf("%d", expiredTime.Unix())
		sig := computeHMAC(expiredTS+"."+string(rawBody), secret)
		err := VerifyQRISGateSignature(rawBody, sig, expiredTS, secret, now)
		if err == nil {
			t.Fatal("expected timestamp older than 5 minutes to be rejected, but got nil")
		}
	})

	t.Run("Rejects future timestamp (> 5 minutes ahead)", func(t *testing.T) {
		futureTime := now.Add(6 * time.Minute)
		futureTS := fmt.Sprintf("%d", futureTime.Unix())
		sig := computeHMAC(futureTS+"."+string(rawBody), secret)
		err := VerifyQRISGateSignature(rawBody, sig, futureTS, secret, now)
		if err == nil {
			t.Fatal("expected timestamp more than 5 minutes in the future to be rejected, but got nil")
		}
	})

	t.Run("Rejects missing signature header", func(t *testing.T) {
		err := VerifyQRISGateSignature(rawBody, "", validTimestamp, secret, now)
		if err == nil {
			t.Fatal("expected empty signature to be rejected, but got nil")
		}
	})
}

func TestQRISGateWebhookHTTPHandler_SignatureRejection(t *testing.T) {
	t.Setenv("QRISGATE_WEBHOOK_SECRET", "whsec_live_unit_test_secret")

	rawBody := []byte(`{"event":"payment.paid","transaction_id":"tx_999","external_order_id":"ORD-99","total_amount":50003}`)
	ts := fmt.Sprintf("%d", time.Now().Unix())

	t.Run("Returns 401 when signature is wrong", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/webhooks/qrisgate", bytes.NewReader(rawBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-qrisgate-signature", "deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd")
		req.Header.Set("x-qrisgate-timestamp", ts)

		rr := httptest.NewRecorder()
		handleQRISGateWebhook(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected HTTP 401 Unauthorized, got %d (%s)", rr.Code, rr.Body.String())
		}
	})

	t.Run("Returns 401 when timestamp is older than 5 minutes", func(t *testing.T) {
		oldTS := fmt.Sprintf("%d", time.Now().Add(-10*time.Minute).Unix())
		validSigForOldTS := computeHMAC(oldTS+"."+string(rawBody), "whsec_live_unit_test_secret")

		req := httptest.NewRequest(http.MethodPost, "/api/webhooks/qrisgate", bytes.NewReader(rawBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-qrisgate-signature", validSigForOldTS)
		req.Header.Set("x-qrisgate-timestamp", oldTS)

		rr := httptest.NewRecorder()
		handleQRISGateWebhook(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected HTTP 401 Unauthorized for replay attack, got %d (%s)", rr.Code, rr.Body.String())
		}
	})

	t.Run("Returns 200 OK and enforces idempotency when signature and timestamp are valid", func(t *testing.T) {
		validSig := computeHMAC(ts+"."+string(rawBody), "whsec_live_unit_test_secret")

		req1 := httptest.NewRequest(http.MethodPost, "/api/webhooks/qrisgate", bytes.NewReader(rawBody))
		req1.Header.Set("Content-Type", "application/json")
		req1.Header.Set("x-qrisgate-signature", validSig)
		req1.Header.Set("x-qrisgate-timestamp", ts)
		req1.Header.Set("x-qrisgate-delivery-id", "evt_idempotent_test_001")

		rr1 := httptest.NewRecorder()
		handleQRISGateWebhook(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200 OK on first delivery, got %d (%s)", rr1.Code, rr1.Body.String())
		}

		// Replay exact same delivery ID -> must return 200 OK idempotently without reprocessing
		req2 := httptest.NewRequest(http.MethodPost, "/api/webhooks/qrisgate", bytes.NewReader(rawBody))
		req2.Header.Set("Content-Type", "application/json")
		req2.Header.Set("x-qrisgate-signature", validSig)
		req2.Header.Set("x-qrisgate-timestamp", ts)
		req2.Header.Set("x-qrisgate-delivery-id", "evt_idempotent_test_001")

		rr2 := httptest.NewRecorder()
		handleQRISGateWebhook(rr2, req2)
		if rr2.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200 OK on duplicate delivery, got %d (%s)", rr2.Code, rr2.Body.String())
		}
		if !bytes.Contains(rr2.Body.Bytes(), []byte("already_processed")) && !bytes.Contains(rr2.Body.Bytes(), []byte("idempotent")) {
			t.Fatalf("expected duplicate delivery response to contain already_processed or idempotent, got %s", rr2.Body.String())
		}
	})
}
