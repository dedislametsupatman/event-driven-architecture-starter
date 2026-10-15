package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"encore.app/order"
	"encore.app/payment"
	"encore.dev/pubsub"
	"encore.dev/rlog"
)

// Subscribe to order created events
var _ = pubsub.NewSubscription(order.OrderCreatedTopic, "notify-order-created", pubsub.SubscriptionConfig[*order.OrderCreatedEvent]{
	Handler: func(ctx context.Context, e *order.OrderCreatedEvent) error {
		ord := e.Order
		msg := fmt.Sprintf(
			"🛍️ *Pesanan Baru Diterima!*\n\nID: #%d\nNama: %s (%s)\nTotal: Rp %s\nMetode: %s\nItem count: %d\nStatus: Menunggu Pembayaran",
			ord.ID, ord.CustomerName, ord.CustomerPhone, formatRupiah(ord.GrandTotal), ord.PaymentMethod, len(ord.Items),
		)
		rlog.Info("notification sent: order created", "order_id", ord.ID, "customer", ord.CustomerName)
		return dispatchNotification(ctx, msg)
	},
})

// Subscribe to payment success events
var _ = pubsub.NewSubscription(payment.PaymentSuccessTopic, "notify-payment-success", pubsub.SubscriptionConfig[*payment.PaymentSuccessEvent]{
	Handler: func(ctx context.Context, e *payment.PaymentSuccessEvent) error {
		msg := fmt.Sprintf(
			"✅ *Pembayaran Terverifikasi!*\n\nOrder #%d telah lunas via %s (Rp %s).\nHarap segera proses pengiriman atau kirimkan file produk digital.",
			e.OrderID, e.PaymentMethod, formatRupiah(e.Amount),
		)
		rlog.Info("notification sent: payment verified", "order_id", e.OrderID, "amount", e.Amount)
		return dispatchNotification(ctx, msg)
	},
})

func dispatchNotification(ctx context.Context, message string) error {
	telegramBotToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	telegramChatID := os.Getenv("TELEGRAM_CHAT_ID")
	whatsAppWebhook := os.Getenv("WHATSAPP_WEBHOOK")

	// If Telegram bot credentials are configured, dispatch directly to Telegram
	if telegramBotToken != "" && telegramChatID != "" {
		url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", telegramBotToken)
		payload := map[string]string{
			"chat_id":    telegramChatID,
			"text":       message,
			"parse_mode": "Markdown",
		}
		b, _ := json.Marshal(payload)
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(b))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			_, _ = http.DefaultClient.Do(req)
		}
	}

	// If WhatsApp Webhook is configured, forward message
	if whatsAppWebhook != "" {
		payload := map[string]string{"message": message}
		b, _ := json.Marshal(payload)
		req, err := http.NewRequestWithContext(ctx, "POST", whatsAppWebhook, bytes.NewReader(b))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			_, _ = http.DefaultClient.Do(req)
		}
	}

	return nil
}

func formatRupiah(amount int64) string {
	s := strconv.FormatInt(amount, 10)
	n := len(s)
	if n <= 3 {
		return s
	}
	var res []byte
	rem := n % 3
	if rem > 0 {
		res = append(res, s[:rem]...)
	}
	for i := rem; i < n; i += 3 {
		if len(res) > 0 {
			res = append(res, '.')
		}
		res = append(res, s[i:i+3]...)
	}
	return string(res)
}
