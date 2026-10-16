package notification

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"encore.app/auth"
	"encore.app/order"
	"encore.app/payment"

	"encore.dev/beta/errs"
	"encore.dev/pubsub"
	"encore.dev/rlog"
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("notifications", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

type InAppNotification struct {
	ID             int64     `json:"id"`
	OrderID        int64     `json:"order_id"`
	CustomerEmail  string    `json:"customer_email"`
	Title          string    `json:"title"`
	Message        string    `json:"message"`
	Status         string    `json:"status"`
	TrackingNumber string    `json:"tracking_number,omitempty"`
	IsRead         bool      `json:"is_read"`
	CreatedAt      time.Time `json:"created_at"`
}

type EmailSettings struct {
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     string `json:"smtp_port"`
	SMTPUser     string `json:"smtp_user"`
	SMTPPass     string `json:"smtp_pass,omitempty"`
	SenderName   string `json:"sender_name"`
	SenderEmail  string `json:"sender_email"`
	EmailEnabled bool   `json:"email_enabled"`
	HasPassword  bool   `json:"has_password"`
}

// Subscribe to order created events
var _ = pubsub.NewSubscription(order.OrderCreatedTopic, "notify-order-created", pubsub.SubscriptionConfig[*order.OrderCreatedEvent]{
	Handler: func(ctx context.Context, e *order.OrderCreatedEvent) error {
		ord := e.Order
		title := fmt.Sprintf("Pesanan #ORDER-%d Berhasil Dibuat", ord.ID)
		msg := fmt.Sprintf("Pesanan #ORDER-%d sebesar Rp %s menunggu pembayaran via %s.", ord.ID, formatRupiah(ord.GrandTotal), strings.ReplaceAll(ord.PaymentMethod, "_", " "))

		// 1. Create in-app notification
		_ = createInAppNotification(ctx, ord.ID, ord.CustomerEmail, title, msg, "pending", "")

		// 2. Send email notification
		emailSubject := fmt.Sprintf("[Supatman Store] Konfirmasi Pesanan #ORDER-%d (Menunggu Pembayaran)", ord.ID)
		emailBody := fmt.Sprintf(`
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 16px;">
				<div style="background-color: #2563eb; padding: 16px; border-radius: 12px; text-align: center; color: #ffffff; margin-bottom: 20px;">
					<h2 style="margin: 0; font-size: 20px;">SUPATMAN STORE OFFICIAL</h2>
				</div>
				<h3 style="color: #0f172a; margin-top: 0;">Halo, %s!</h3>
				<p style="color: #475569; font-size: 14px; line-height: 1.6;">
					Terima kasih telah berbelanja di Supatman Store. Pesanan Anda <strong>#ORDER-%d</strong> telah berhasil dicatat dan sedang menunggu pembayaran.
				</p>
				<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
					<p style="margin: 4px 0; font-size: 14px;"><strong>Total Tagihan:</strong> Rp %s</p>
					<p style="margin: 4px 0; font-size: 14px;"><strong>Metode Pembayaran:</strong> %s</p>
					<p style="margin: 4px 0; font-size: 14px;"><strong>Status:</strong> Menunggu Pembayaran</p>
				</div>
				<p style="color: #475569; font-size: 13px;">
					Silakan lakukan pembayaran dan unggah bukti transfer melalui halaman pelacakan pesanan Anda:
				</p>
				<div style="text-align: center; margin: 24px 0;">
					<a href="http://127.0.0.1:4000/orders?id=%d" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
						Buka Detail &amp; Lacak Pesanan #ORDER-%d
					</a>
				</div>
				<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
				<p style="color: #94a3b8; font-size: 11px; text-align: center;">
					Email otomatis dari sistem Supatman Store. Harap tidak membalas langsung ke email ini.
				</p>
			</div>
		`, ord.CustomerName, ord.ID, formatRupiah(ord.GrandTotal), strings.ReplaceAll(ord.PaymentMethod, "_", " "), ord.ID, ord.ID)

		go func() {
			_ = sendEmail(context.Background(), ord.CustomerEmail, emailSubject, emailBody)
		}()

		// 3. Dispatch to admin webhook/telegram
		adminMsg := fmt.Sprintf("🛍️ *Pesanan Baru Diterima!*\n\nID: #%d\nNama: %s (%s)\nTotal: Rp %s\nStatus: Menunggu Pembayaran",
			ord.ID, ord.CustomerName, ord.CustomerPhone, formatRupiah(ord.GrandTotal),
		)
		return dispatchTelegramWhatsApp(ctx, adminMsg)
	},
})

// Subscribe to order status changed events (paid, processing, shipped, completed, cancelled)
var _ = pubsub.NewSubscription(order.OrderStatusChangedTopic, "notify-order-status-changed", pubsub.SubscriptionConfig[*order.OrderStatusChangedEvent]{
	Handler: func(ctx context.Context, e *order.OrderStatusChangedEvent) error {
		var title string
		var message string
		var emailStatusText string

		switch e.NewStatus {
		case "paid":
			title = fmt.Sprintf("Pembayaran Pesanan #ORDER-%d Berhasil", e.OrderID)
			message = fmt.Sprintf("Pembayaran sebesar Rp %s telah diverifikasi. Pesanan Anda segera dipersiapkan.", formatRupiah(e.GrandTotal))
			emailStatusText = "Pembayaran Terverifikasi &amp; Lunas"
		case "processing":
			title = fmt.Sprintf("Pesanan #ORDER-%d Sedang Diproses", e.OrderID)
			message = "Penjual sedang mengemas dan mempersiapkan barang/file digital pesanan Anda."
			emailStatusText = "Pesanan Sedang Diproses"
		case "shipped":
			title = fmt.Sprintf("Pesanan #ORDER-%d Telah Dikirim!", e.OrderID)
			if e.TrackingNumber != "" {
				message = fmt.Sprintf("Pesanan Anda telah dikirim via ekspedisi. Nomor Resi: %s.", e.TrackingNumber)
			} else {
				message = "Pesanan Anda telah diserahkan ke jasa pengiriman."
			}
			emailStatusText = "Barang Sedang Dalam Pengiriman"
		case "completed":
			title = fmt.Sprintf("Pesanan #ORDER-%d Selesai", e.OrderID)
			message = "Pesanan telah selesai. Terima kasih telah mempercayai Supatman Store!"
			emailStatusText = "Pesanan Telah Selesai"
		case "cancelled":
			title = fmt.Sprintf("Pesanan #ORDER-%d Dibatalkan", e.OrderID)
			message = "Pesanan Anda telah dibatalkan oleh sistem atau admin toko."
			emailStatusText = "Pesanan Dibatalkan"
		default:
			title = fmt.Sprintf("Status Pesanan #ORDER-%d Berubah", e.OrderID)
			message = fmt.Sprintf("Status pesanan Anda kini menjadi: %s", strings.ToUpper(e.NewStatus))
			emailStatusText = strings.ToUpper(e.NewStatus)
		}

		// 1. Create in-app notification in DB
		_ = createInAppNotification(ctx, e.OrderID, e.CustomerEmail, title, message, e.NewStatus, e.TrackingNumber)

		// 2. Dispatch Email notification to customer
		emailSubject := fmt.Sprintf("[Supatman Store] Update Pesanan #ORDER-%d: %s", e.OrderID, title)
		resiHtml := ""
		if e.TrackingNumber != "" {
			resiHtml = fmt.Sprintf(`
				<div style="background-color: #e0f2fe; border: 1px solid #7dd3fc; border-radius: 8px; padding: 12px; margin: 12px 0;">
					<strong style="color: #0369a1; font-size: 13px;">Nomor Resi Pengiriman:</strong>
					<p style="margin: 4px 0; font-size: 18px; font-weight: bold; color: #0c4a6e;">%s</p>
				</div>
			`, e.TrackingNumber)
		}

		emailBody := fmt.Sprintf(`
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
				<div style="background-color: #2563eb; padding: 16px; border-radius: 12px; text-align: center; color: #ffffff; margin-bottom: 20px;">
					<h2 style="margin: 0; font-size: 20px;">SUPATMAN STORE OFFICIAL</h2>
				</div>
				<h3 style="color: #0f172a; margin-top: 0;">Halo, %s!</h3>
				<p style="color: #475569; font-size: 14px; line-height: 1.6;">
					Ada kabar terbaru mengenai pesanan Anda <strong>#ORDER-%d</strong>.
				</p>
				<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
					<p style="margin: 4px 0; font-size: 14px;"><strong>Status Terkini:</strong> <span style="color: #2563eb; font-weight: bold;">%s</span></p>
					<p style="margin: 4px 0; font-size: 14px;"><strong>Keterangan:</strong> %s</p>
					%s
				</div>
				<div style="text-align: center; margin: 24px 0;">
					<a href="http://127.0.0.1:4000/orders?id=%d" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
						Lihat Status &amp; Detail Pesanan
					</a>
				</div>
				<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
				<p style="color: #94a3b8; font-size: 11px; text-align: center;">
					Email otomatis dari sistem Supatman Store. Harap tidak membalas langsung ke email ini.
				</p>
			</div>
		`, e.CustomerName, e.OrderID, emailStatusText, message, resiHtml, e.OrderID)

		go func() {
			_ = sendEmail(context.Background(), e.CustomerEmail, emailSubject, emailBody)
		}()

		// 3. Dispatch to admin webhook/telegram
		adminMsg := fmt.Sprintf("🔔 *Update Status Pesanan #%d*\n\nPelanggan: %s\nStatus Baru: %s\nResi: %s",
			e.OrderID, e.CustomerName, strings.ToUpper(e.NewStatus), e.TrackingNumber,
		)
		return dispatchTelegramWhatsApp(ctx, adminMsg)
	},
})

// Subscribe to payment success events (auto-mark paid)
var _ = pubsub.NewSubscription(payment.PaymentSuccessTopic, "notify-payment-success", pubsub.SubscriptionConfig[*payment.PaymentSuccessEvent]{
	Handler: func(ctx context.Context, e *payment.PaymentSuccessEvent) error {
		_ = order.MarkPaid(ctx, e.OrderID)
		return nil
	},
})

func createInAppNotification(ctx context.Context, orderID int64, email, title, message, status, tracking string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO in_app_notifications (order_id, customer_email, title, message, status, tracking_number, is_read, created_at)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), FALSE, NOW())
	`, orderID, strings.ToLower(strings.TrimSpace(email)), title, message, status, tracking)
	return err
}

type GetNotificationsParams struct {
	CustomerEmail string `query:"email"`
	OrderID       int64  `query:"order_id"`
}

type GetNotificationsResponse struct {
	Notifications []*InAppNotification `json:"notifications"`
	UnreadCount   int                  `json:"unread_count"`
}

// GetNotifications returns in-app notifications for the current customer.
//
//encore:api public method=GET path=/notifications
func GetNotifications(ctx context.Context, p *GetNotificationsParams) (*GetNotificationsResponse, error) {
	var targetEmail string

	// Check if authenticated
	if usr, err := auth.Me(ctx); err == nil && usr != nil {
		targetEmail = usr.Email
	} else if p.CustomerEmail != "" {
		targetEmail = strings.TrimSpace(p.CustomerEmail)
	}

	var rows *sqldb.Rows
	var err error

	if targetEmail != "" {
		rows, err = db.Query(ctx, `
			SELECT id, order_id, customer_email, title, message, status, COALESCE(tracking_number, ''), is_read, created_at
			FROM in_app_notifications
			WHERE customer_email = $1
			ORDER BY created_at DESC
			LIMIT 30
		`, strings.ToLower(targetEmail))
	} else if p.OrderID > 0 {
		rows, err = db.Query(ctx, `
			SELECT id, order_id, customer_email, title, message, status, COALESCE(tracking_number, ''), is_read, created_at
			FROM in_app_notifications
			WHERE order_id = $1
			ORDER BY created_at DESC
			LIMIT 30
		`, p.OrderID)
	} else {
		return &GetNotificationsResponse{Notifications: []*InAppNotification{}, UnreadCount: 0}, nil
	}

	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	defer rows.Close()

	var list []*InAppNotification
	unread := 0
	for rows.Next() {
		var n InAppNotification
		if err := rows.Scan(
			&n.ID, &n.OrderID, &n.CustomerEmail, &n.Title, &n.Message, &n.Status, &n.TrackingNumber, &n.IsRead, &n.CreatedAt,
		); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
		if !n.IsRead {
			unread++
		}
		list = append(list, &n)
	}

	return &GetNotificationsResponse{Notifications: list, UnreadCount: unread}, nil
}

// MarkNotificationRead marks a specific notification as read.
//
//encore:api public method=POST path=/notifications/:id/read
func MarkNotificationRead(ctx context.Context, id int64) error {
	_, err := db.Exec(ctx, `UPDATE in_app_notifications SET is_read = TRUE WHERE id = $1`, id)
	return err
}

// MarkAllNotificationsRead marks all notifications as read for an email.
//
//encore:api public method=POST path=/notifications/read-all
func MarkAllNotificationsRead(ctx context.Context, p *GetNotificationsParams) error {
	var targetEmail string
	if usr, err := auth.Me(ctx); err == nil && usr != nil {
		targetEmail = usr.Email
	} else if p.CustomerEmail != "" {
		targetEmail = strings.TrimSpace(p.CustomerEmail)
	}

	if targetEmail == "" {
		return nil
	}

	_, err := db.Exec(ctx, `UPDATE in_app_notifications SET is_read = TRUE WHERE customer_email = $1`, strings.ToLower(targetEmail))
	return err
}

// GetEmailSettings returns current SMTP settings (admin only).
//
//encore:api auth method=GET path=/notification/email-settings
func GetEmailSettings(ctx context.Context) (*EmailSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	s := loadEmailSettings(ctx)
	// Mask password for security
	s.HasPassword = s.SMTPPass != ""
	s.SMTPPass = ""
	return s, nil
}

// UpdateEmailSettings saves SMTP email settings (admin only).
//
//encore:api auth method=POST path=/notification/email-settings
func UpdateEmailSettings(ctx context.Context, p *EmailSettings) (*EmailSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	enabledStr := "false"
	if p.EmailEnabled {
		enabledStr = "true"
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	defer tx.Rollback()

	upsert := func(k, v string) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO email_settings (key, value, updated_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
		`, k, v)
		return err
	}

	_ = upsert("smtp_host", strings.TrimSpace(p.SMTPHost))
	_ = upsert("smtp_port", strings.TrimSpace(p.SMTPPort))
	_ = upsert("smtp_user", strings.TrimSpace(p.SMTPUser))
	_ = upsert("sender_name", strings.TrimSpace(p.SenderName))
	_ = upsert("sender_email", strings.TrimSpace(p.SenderEmail))
	_ = upsert("email_enabled", enabledStr)

	// Only update password if provided
	if p.SMTPPass != "" {
		_ = upsert("smtp_pass", strings.TrimSpace(p.SMTPPass))
	}

	if err := tx.Commit(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	saved := loadEmailSettings(ctx)
	saved.HasPassword = saved.SMTPPass != ""
	saved.SMTPPass = ""
	return saved, nil
}

type TestEmailParams struct {
	TargetEmail string `json:"target_email"`
}

// SendTestEmail sends a test email to verify SMTP configuration (admin only).
//
//encore:api auth method=POST path=/notification/test-email
func SendTestEmail(ctx context.Context, p *TestEmailParams) error {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	target := strings.TrimSpace(p.TargetEmail)
	if target == "" {
		target = usr.Email
	}

	subject := "[Supatman Store] Tes Konfigurasi SMTP Email Berhasil"
	body := `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
			<div style="background-color: #10b981; padding: 16px; border-radius: 12px; text-align: center; color: #ffffff; margin-bottom: 20px;">
				<h2 style="margin: 0; font-size: 20px;">✓ TES KONEKSI SMTP BERHASIL</h2>
			</div>
			<p style="color: #0f172a; font-size: 14px;">Halo Admin,</p>
			<p style="color: #475569; font-size: 14px; line-height: 1.6;">
				Konfigurasi server SMTP email Anda di <strong>Supatman Store CMS</strong> telah berhasil terhubung dan berfungsi normal!
			</p>
			<p style="color: #475569; font-size: 13px;">
				Sekarang setiap ada perubahan status pesanan, konsumen Anda akan otomatis menerima email notifikasi resmi dari toko.
			</p>
			<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
			<p style="color: #94a3b8; font-size: 11px; text-align: center;">Supatman Store Automation Engine</p>
		</div>
	`

	return sendEmailDirect(ctx, target, subject, body)
}

func loadEmailSettings(ctx context.Context) *EmailSettings {
	var s EmailSettings
	var enabledStr string
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'smtp_host'`).Scan(&s.SMTPHost)
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'smtp_port'`).Scan(&s.SMTPPort)
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'smtp_user'`).Scan(&s.SMTPUser)
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'smtp_pass'`).Scan(&s.SMTPPass)
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'sender_name'`).Scan(&s.SenderName)
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'sender_email'`).Scan(&s.SenderEmail)
	_ = db.QueryRow(ctx, `SELECT value FROM email_settings WHERE key = 'email_enabled'`).Scan(&enabledStr)
	s.EmailEnabled = enabledStr == "true"
	return &s
}

func sendEmail(ctx context.Context, toEmail, subject, htmlBody string) error {
	cfg := loadEmailSettings(ctx)
	if !cfg.EmailEnabled || cfg.SMTPHost == "" || cfg.SMTPUser == "" {
		rlog.Debug("email notification skipped: not configured or disabled", "to", toEmail)
		return nil
	}
	return sendEmailDirect(ctx, toEmail, subject, htmlBody)
}

func sendEmailDirect(ctx context.Context, toEmail, subject, htmlBody string) error {
	cfg := loadEmailSettings(ctx)
	if cfg.SMTPHost == "" || cfg.SMTPUser == "" {
		return &errs.Error{Code: errs.FailedPrecondition, Message: "SMTP Host dan User belum dikonfigurasi"}
	}

	fromName := cfg.SenderName
	if fromName == "" {
		fromName = "Supatman Store"
	}
	fromEmail := cfg.SenderEmail
	if fromEmail == "" {
		fromEmail = cfg.SMTPUser
	}

	headers := make(map[string]string)
	headers["From"] = fmt.Sprintf("%s <%s>", fromName, fromEmail)
	headers["To"] = toEmail
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	msg := ""
	for k, v := range headers {
		msg += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	msg += "\r\n" + htmlBody

	port := cfg.SMTPPort
	if port == "" {
		port = "587"
	}
	addr := net.JoinHostPort(cfg.SMTPHost, port)

	auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)

	// If port 465, use direct TLS
	if port == "465" {
		tlsconfig := &tls.Config{
			InsecureSkipVerify: false,
			ServerName:         cfg.SMTPHost,
		}
		conn, err := tls.Dial("tcp", addr, tlsconfig)
		if err != nil {
			return &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("TLS dial error: %v", err)}
		}
		c, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("SMTP client error: %v", err)}
		}
		defer c.Close()

		if err = c.Auth(auth); err != nil {
			return &errs.Error{Code: errs.PermissionDenied, Message: fmt.Sprintf("SMTP auth failed: %v", err)}
		}
		if err = c.Mail(fromEmail); err != nil {
			return err
		}
		if err = c.Rcpt(toEmail); err != nil {
			return err
		}
		w, err := c.Data()
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(msg))
		if err != nil {
			return err
		}
		_ = w.Close()
		return c.Quit()
	}

	// Standard STARTTLS (Port 587 or 25)
	err := smtp.SendMail(addr, auth, fromEmail, []string{toEmail}, []byte(msg))
	if err != nil {
		rlog.Error("failed to send email via SMTP", "to", toEmail, "err", err)
		return &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal mengirim email: %v", err)}
	}

	rlog.Info("email notification sent successfully", "to", toEmail, "subject", subject)
	return nil
}

func dispatchTelegramWhatsApp(ctx context.Context, message string) error {
	telegramBotToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	telegramChatID := os.Getenv("TELEGRAM_CHAT_ID")
	whatsAppWebhook := os.Getenv("WHATSAPP_WEBHOOK")

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
