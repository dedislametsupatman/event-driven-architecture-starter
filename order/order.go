package order

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"encore.app/auth"
	"encore.app/payment"
	"encore.app/product"

	"encore.dev/beta/errs"
	"encore.dev/cron"
	"encore.dev/pubsub"
	"encore.dev/rlog"
	"encore.dev/storage/objects"
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("orders", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

var PaymentProofs = objects.NewBucket("payment-proofs", objects.BucketConfig{
	Public: true,
})

type OrderItem struct {
	ID             int64  `json:"id"`
	OrderID        int64  `json:"order_id"`
	ProductID      int64  `json:"product_id"`
	ProductName    string `json:"product_name"`
	Price          int64  `json:"price"`
	Quantity       int    `json:"quantity"`
	IsDigital      bool   `json:"is_digital"`
	DigitalFileURL string `json:"digital_file_url,omitempty"`
}

type Order struct {
	ID                    int64        `json:"id"`
	UserID                *int64       `json:"user_id,omitempty"`
	ExternalOrderID       string       `json:"external_order_id,omitempty"`
	QRISGateTransactionID string       `json:"qrisgate_transaction_id,omitempty"`
	CustomerName          string       `json:"customer_name"`
	CustomerEmail         string       `json:"customer_email"`
	CustomerPhone         string       `json:"customer_phone"`
	ShippingAddress       string       `json:"shipping_address"`
	City                  string       `json:"city"`
	PostalCode            string       `json:"postal_code"`
	TotalAmount           int64        `json:"total_amount"`
	ShippingCost          int64        `json:"shipping_cost"`
	CourierName           string       `json:"courier_name,omitempty"`
	CourierService        string       `json:"courier_service,omitempty"`
	CourierETD            string       `json:"courier_etd,omitempty"`
	UniqueCode            int64        `json:"unique_code,omitempty"`
	GrandTotal            int64        `json:"grand_total"`
	Status                string       `json:"status"` // pending, paid, processing, shipped, completed, cancelled
	PaymentMethod         string       `json:"payment_method"`
	CheckoutURL           string       `json:"checkout_url,omitempty"`
	PaymentProofURL       string       `json:"payment_proof_url,omitempty"`
	TrackingNumber        string       `json:"tracking_number,omitempty"`
	IsDigitalOnly         bool         `json:"is_digital_only"`
	PaidAt                *time.Time   `json:"paid_at,omitempty"`
	CreatedAt             time.Time    `json:"created_at"`
	UpdatedAt             time.Time    `json:"updated_at"`
	Items                 []*OrderItem `json:"items,omitempty"`
}

type CheckoutItem struct {
	ProductID int64 `json:"product_id"`
	Quantity  int   `json:"quantity"`
}

type CreateOrderParams struct {
	CustomerName    string          `json:"customer_name"`
	CustomerEmail   string          `json:"customer_email"`
	CustomerPhone   string          `json:"customer_phone"`
	ShippingAddress string          `json:"shipping_address"`
	City            string          `json:"city"`
	PostalCode      string          `json:"postal_code"`
	PaymentMethod   string          `json:"payment_method"`
	CourierName     string          `json:"courier_name,omitempty"`
	CourierService  string          `json:"courier_service,omitempty"`
	CourierETD      string          `json:"courier_etd,omitempty"`
	ShippingCost    int64           `json:"shipping_cost,omitempty"`
	Items           []*CheckoutItem `json:"items"`
}

type OrderCreatedEvent struct {
	Order *Order `json:"order"`
}

var OrderCreatedTopic = pubsub.NewTopic[*OrderCreatedEvent]("order-created", pubsub.TopicConfig{
	DeliveryGuarantee: pubsub.AtLeastOnce,
})

type OrderStatusChangedEvent struct {
	OrderID        int64     `json:"order_id"`
	CustomerName   string    `json:"customer_name"`
	CustomerEmail  string    `json:"customer_email"`
	CustomerPhone  string    `json:"customer_phone"`
	OldStatus      string    `json:"old_status"`
	NewStatus      string    `json:"new_status"`
	TrackingNumber string    `json:"tracking_number,omitempty"`
	GrandTotal     int64     `json:"grand_total"`
	ChangedAt      time.Time `json:"changed_at"`
}

var OrderStatusChangedTopic = pubsub.NewTopic[*OrderStatusChangedEvent]("order-status-changed", pubsub.TopicConfig{
	DeliveryGuarantee: pubsub.AtLeastOnce,
})

// Create processes checkout, reserves product stock, and creates an order.
//
//encore:api public method=POST path=/orders
func Create(ctx context.Context, p *CreateOrderParams) (*Order, error) {
	if len(p.Items) == 0 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Cart is empty"}
	}
	p.CustomerName = strings.TrimSpace(p.CustomerName)
	p.CustomerEmail = strings.TrimSpace(p.CustomerEmail)
	p.CustomerPhone = strings.TrimSpace(p.CustomerPhone)

	if p.CustomerName == "" || p.CustomerEmail == "" || p.CustomerPhone == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Customer contact details are required"}
	}

	var optionalUserID *int64
	if usr, err := auth.Me(ctx); err == nil && usr != nil {
		optionalUserID = &usr.ID
	}

	isDigitalOnly := true
	var totalAmount int64
	var orderItems []*OrderItem

	for _, item := range p.Items {
		if item.Quantity <= 0 {
			item.Quantity = 1
		}

		pr, err := product.Get(ctx, strconv.FormatInt(item.ProductID, 10))
		if err != nil {
			return nil, &errs.Error{Code: errs.NotFound, Message: fmt.Sprintf("Product %d not found", item.ProductID)}
		}

		if len(pr.AffiliateLinks) > 0 {
			return nil, &errs.Error{
				Code:    errs.InvalidArgument,
				Message: fmt.Sprintf("Produk \"%s\" merupakan produk afiliasi dan hanya dapat dibeli melalui tautan mitra", pr.Name),
			}
		}

		if !pr.IsDigital {
			isDigitalOnly = false
			if pr.Stock < item.Quantity {
				return nil, &errs.Error{
					Code:    errs.FailedPrecondition,
					Message: fmt.Sprintf("Stok %s tidak mencukupi (tersedia: %d)", pr.Name, pr.Stock),
				}
			}
		}

		totalAmount += pr.Price * int64(item.Quantity)
		orderItems = append(orderItems, &OrderItem{
			ProductID:      pr.ID,
			ProductName:    pr.Name,
			Price:          pr.Price,
			Quantity:       item.Quantity,
			IsDigital:      pr.IsDigital,
			DigitalFileURL: pr.DigitalFileURL,
		})
	}

	var shippingCost int64 = 0
	courierName := strings.TrimSpace(p.CourierName)
	courierService := strings.TrimSpace(p.CourierService)
	courierETD := strings.TrimSpace(p.CourierETD)

	if !isDigitalOnly {
		if strings.TrimSpace(p.ShippingAddress) == "" {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Shipping address is required for physical goods"}
		}
		if p.ShippingCost > 0 {
			shippingCost = p.ShippingCost
		} else {
			s := loadBiteshipSettings(ctx)
			shippingCost = s.DefaultFlatCost
			if courierName == "" {
				courierName = "Kurir Standar Toko"
				courierService = "Reguler"
				courierETD = "2-3 Hari"
			}
		}
	} else {
		shippingCost = 0
		courierName = ""
		courierService = ""
		courierETD = ""
	}

	grandTotal := totalAmount + shippingCost

	var ord Order
	err := db.QueryRow(ctx, `
		INSERT INTO orders (
			user_id, customer_name, customer_email, customer_phone,
			shipping_address, city, postal_code, total_amount, shipping_cost,
			grand_total, status, payment_method, is_digital_only,
			courier_name, courier_service, courier_etd, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13, $14, $15, NOW(), NOW())
		RETURNING id, user_id, customer_name, customer_email, customer_phone,
		          shipping_address, city, postal_code, total_amount, shipping_cost,
		          grand_total, status, payment_method, is_digital_only,
		          COALESCE(courier_name, ''), COALESCE(courier_service, ''), COALESCE(courier_etd, ''),
		          created_at, updated_at
	`, optionalUserID, p.CustomerName, p.CustomerEmail, p.CustomerPhone,
		p.ShippingAddress, p.City, p.PostalCode, totalAmount, shippingCost,
		grandTotal, p.PaymentMethod, isDigitalOnly,
		courierName, courierService, courierETD).Scan(
		&ord.ID, &ord.UserID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
		&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost,
		&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.IsDigitalOnly,
		&ord.CourierName, &ord.CourierService, &ord.CourierETD,
		&ord.CreatedAt, &ord.UpdatedAt,
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	for _, oi := range orderItems {
		oi.OrderID = ord.ID
		err := db.QueryRow(ctx, `
			INSERT INTO order_items (order_id, product_id, product_name, price, quantity, is_digital, digital_file_url)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`, ord.ID, oi.ProductID, oi.ProductName, oi.Price, oi.Quantity, oi.IsDigital, oi.DigitalFileURL).Scan(&oi.ID)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}

		// Deduct stock for physical items
		if !oi.IsDigital {
			_ = product.AdjustStock(ctx, oi.ProductID, -oi.Quantity)
		}
	}
	ord.Items = orderItems

	// Emit event to notify and start asynchronous processing
	_, _ = OrderCreatedTopic.Publish(ctx, &OrderCreatedEvent{Order: &ord})

	return &ord, nil
}

type CheckoutParams struct {
	CustomerName    string          `json:"customer_name"`
	CustomerEmail   string          `json:"customer_email"`
	CustomerPhone   string          `json:"customer_phone"`
	ShippingAddress string          `json:"shipping_address"`
	City            string          `json:"city"`
	PostalCode      string          `json:"postal_code"`
	PaymentMethod   string          `json:"payment_method,omitempty"` // "QRIS" (default) or "BANK_TRANSFER"
	BankCode        string          `json:"bank_code,omitempty"`      // e.g. "BCA", "MANDIRI", "BRI", "BNI"
	CourierName     string          `json:"courier_name,omitempty"`
	CourierService  string          `json:"courier_service,omitempty"`
	CourierETD      string          `json:"courier_etd,omitempty"`
	ShippingCost    int64           `json:"shipping_cost,omitempty"`
	ReturnURL       string          `json:"return_url,omitempty"`
	Items           []*CheckoutItem `json:"items"`
}

type CheckoutData struct {
	TransactionID   string `json:"transaction_id"`
	ExternalOrderID string `json:"external_order_id"`
	CheckoutURL     string `json:"checkout_url"`
	BaseAmount      int64  `json:"base_amount"`
	UniqueCode      int64  `json:"unique_code"`
	TotalAmount     int64  `json:"total_amount"`
	QRString        string `json:"qr_string,omitempty"`
	ExpiresAt       string `json:"expires_at,omitempty"`
}

type CheckoutResponse struct {
	Success         bool          `json:"success"`
	Order           *Order        `json:"order"`
	CheckoutURL     string        `json:"checkout_url"`
	TransactionID   string        `json:"transaction_id"`
	ExternalOrderID string        `json:"external_order_id"`
	BaseAmount      int64         `json:"base_amount"`
	UniqueCode      int64         `json:"unique_code"`
	TotalAmount     int64         `json:"total_amount"`
	QRString        string        `json:"qr_string,omitempty"`
	ExpiresAt       string        `json:"expires_at,omitempty"`
	Data            *CheckoutData `json:"data"`
}

// Checkout creates an order by calculating the exact integer IDR total from DATABASE prices,
// calls QRISGate POST /api/v1/transactions, persists PENDING state with unique_code, and returns checkout_url.
//
//encore:api public method=POST path=/api/checkout
func Checkout(ctx context.Context, p *CheckoutParams) (*CheckoutResponse, error) {
	if len(p.Items) == 0 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Keranjang belanja kosong"}
	}

	p.CustomerName = strings.TrimSpace(p.CustomerName)
	p.CustomerEmail = strings.TrimSpace(p.CustomerEmail)
	p.CustomerPhone = strings.TrimSpace(p.CustomerPhone)

	if p.CustomerName == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Nama pelanggan wajib diisi"}
	}
	if p.CustomerEmail == "" {
		p.CustomerEmail = "guest@portalbun.co.id"
	}
	if p.CustomerPhone == "" {
		p.CustomerPhone = "-"
	}

	var optionalUserID *int64
	if usr, err := auth.Me(ctx); err == nil && usr != nil {
		optionalUserID = &usr.ID
	}

	// 1 & 2. Calculate total strictly from DATABASE product prices (integer IDR, no rounding)
	isDigitalOnly := true
	var totalAmount int64
	var orderItems []*OrderItem

	for _, item := range p.Items {
		if item.Quantity <= 0 {
			item.Quantity = 1
		}

		pr, err := product.Get(ctx, strconv.FormatInt(item.ProductID, 10))
		if err != nil {
			return nil, &errs.Error{Code: errs.NotFound, Message: fmt.Sprintf("Produk #%d tidak ditemukan", item.ProductID)}
		}

		if len(pr.AffiliateLinks) > 0 {
			return nil, &errs.Error{
				Code:    errs.InvalidArgument,
				Message: fmt.Sprintf("Produk \"%s\" merupakan produk afiliasi dan hanya dapat dibeli melalui tautan mitra", pr.Name),
			}
		}

		if !pr.IsDigital {
			isDigitalOnly = false
			if pr.Stock < item.Quantity {
				return nil, &errs.Error{
					Code:    errs.FailedPrecondition,
					Message: fmt.Sprintf("Stok %s tidak mencukupi (tersedia: %d)", pr.Name, pr.Stock),
				}
			}
		}

		// Integer IDR calculation without decimals or rounding
		totalAmount += pr.Price * int64(item.Quantity)
		orderItems = append(orderItems, &OrderItem{
			ProductID:      pr.ID,
			ProductName:    pr.Name,
			Price:          pr.Price,
			Quantity:       item.Quantity,
			IsDigital:      pr.IsDigital,
			DigitalFileURL: pr.DigitalFileURL,
		})
	}

	var shippingCost int64 = 0
	courierName := strings.TrimSpace(p.CourierName)
	courierService := strings.TrimSpace(p.CourierService)
	courierETD := strings.TrimSpace(p.CourierETD)

	if !isDigitalOnly {
		if strings.TrimSpace(p.ShippingAddress) == "" {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Alamat pengiriman wajib diisi untuk produk fisik"}
		}
		if p.ShippingCost > 0 {
			shippingCost = p.ShippingCost
		} else {
			s := loadBiteshipSettings(ctx)
			shippingCost = s.DefaultFlatCost
			if courierName == "" {
				courierName = "Kurir Standar Toko"
				courierService = "Reguler"
				courierETD = "2-3 Hari"
			}
		}
	} else {
		shippingCost = 0
		courierName = ""
		courierService = ""
		courierETD = ""
	}

	baseAmount := totalAmount + shippingCost
	if baseAmount < 1 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Nominal pesanan minimal Rp 1"}
	}

	paymentMethodLabel := "qrisgate"
	qrisGateMethod := strings.ToUpper(strings.TrimSpace(p.PaymentMethod))
	if qrisGateMethod != "BANK_TRANSFER" {
		qrisGateMethod = "QRIS"
	}

	var ord Order
	err := db.QueryRow(ctx, `
		INSERT INTO orders (
			user_id, customer_name, customer_email, customer_phone,
			shipping_address, city, postal_code, total_amount, shipping_cost,
			grand_total, status, payment_method, is_digital_only,
			courier_name, courier_service, courier_etd, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13, $14, $15, NOW(), NOW())
		RETURNING id, user_id, customer_name, customer_email, customer_phone,
		          shipping_address, city, postal_code, total_amount, shipping_cost,
		          grand_total, status, payment_method, is_digital_only,
		          COALESCE(courier_name, ''), COALESCE(courier_service, ''), COALESCE(courier_etd, ''),
		          created_at, updated_at
	`, optionalUserID, p.CustomerName, p.CustomerEmail, p.CustomerPhone,
		p.ShippingAddress, p.City, p.PostalCode, totalAmount, shippingCost,
		baseAmount, paymentMethodLabel, isDigitalOnly,
		courierName, courierService, courierETD).Scan(
		&ord.ID, &ord.UserID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
		&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost,
		&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.IsDigitalOnly,
		&ord.CourierName, &ord.CourierService, &ord.CourierETD,
		&ord.CreatedAt, &ord.UpdatedAt,
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	externalOrderID := fmt.Sprintf("ORD-%d", ord.ID)

	for _, oi := range orderItems {
		oi.OrderID = ord.ID
		err := db.QueryRow(ctx, `
			INSERT INTO order_items (order_id, product_id, product_name, price, quantity, is_digital, digital_file_url)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`, ord.ID, oi.ProductID, oi.ProductName, oi.Price, oi.Quantity, oi.IsDigital, oi.DigitalFileURL).Scan(&oi.ID)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}

		if !oi.IsDigital {
			_ = product.AdjustStock(ctx, oi.ProductID, -oi.Quantity)
		}
	}
	ord.Items = orderItems

	returnURL := strings.TrimSpace(p.ReturnURL)
	if returnURL == "" {
		returnURL = fmt.Sprintf("/order/%d", ord.ID)
	} else if strings.HasSuffix(returnURL, "/order/") {
		returnURL = fmt.Sprintf("%s%d", returnURL, ord.ID)
	}

	// 3. Call QRISGate POST /api/v1/transactions via payment service
	txResp, err := payment.CreateQRISGateTransaction(ctx, &payment.CreateQRISGateParams{
		OrderID:         ord.ID,
		ExternalOrderID: externalOrderID,
		Amount:          baseAmount,
		CustomerName:    ord.CustomerName,
		CustomerEmail:   ord.CustomerEmail,
		CustomerPhone:   ord.CustomerPhone,
		PaymentMethod:   qrisGateMethod,
		BankCode:        strings.ToUpper(strings.TrimSpace(p.BankCode)),
		ReturnURL:       returnURL,
	})
	if err != nil {
		// Rollback order to cancelled & restore stock if transaction creation fails
		for _, oi := range orderItems {
			if !oi.IsDigital {
				_ = product.AdjustStock(ctx, oi.ProductID, oi.Quantity)
			}
		}
		_, _ = db.Exec(ctx, `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, ord.ID)
		return nil, err
	}

	// 4. Save external_order_id, transaction_id, unique_code, exact total_amount (including unique_code), status PENDING
	ord.ExternalOrderID = externalOrderID
	ord.QRISGateTransactionID = txResp.TransactionID
	ord.UniqueCode = txResp.UniqueCode
	ord.GrandTotal = txResp.TotalAmount
	ord.CheckoutURL = txResp.CheckoutURL

	_, err = db.Exec(ctx, `
		UPDATE orders
		SET external_order_id = $1,
		    qrisgate_transaction_id = $2,
		    unique_code = $3,
		    grand_total = $4,
		    checkout_url = $5,
		    status = 'pending',
		    updated_at = NOW()
		WHERE id = $6
	`, ord.ExternalOrderID, ord.QRISGateTransactionID, ord.UniqueCode, ord.GrandTotal, ord.CheckoutURL, ord.ID)
	if err != nil {
		rlog.Error("failed to update order with QRISGate transaction metadata", "order_id", ord.ID, "err", err)
	}

	_, _ = OrderCreatedTopic.Publish(ctx, &OrderCreatedEvent{Order: &ord})

	// 5. Return checkout_url and transaction details to frontend
	data := &CheckoutData{
		TransactionID:   txResp.TransactionID,
		ExternalOrderID: externalOrderID,
		CheckoutURL:     txResp.CheckoutURL,
		BaseAmount:      txResp.BaseAmount,
		UniqueCode:      txResp.UniqueCode,
		TotalAmount:     txResp.TotalAmount,
		QRString:        txResp.QRString,
		ExpiresAt:       txResp.ExpiresAt,
	}

	return &CheckoutResponse{
		Success:         true,
		Order:           &ord,
		CheckoutURL:     txResp.CheckoutURL,
		TransactionID:   txResp.TransactionID,
		ExternalOrderID: externalOrderID,
		BaseAmount:      txResp.BaseAmount,
		UniqueCode:      txResp.UniqueCode,
		TotalAmount:     txResp.TotalAmount,
		QRString:        txResp.QRString,
		ExpiresAt:       txResp.ExpiresAt,
		Data:            data,
	}, nil
}

// Get returns order details by ID.
//
//encore:api public method=GET path=/orders/:id
func Get(ctx context.Context, id int64) (*Order, error) {
	var ord Order
	err := db.QueryRow(ctx, `
		SELECT id, user_id, COALESCE(external_order_id, ''), COALESCE(qrisgate_transaction_id, ''),
		       customer_name, customer_email, customer_phone,
		       shipping_address, city, postal_code, total_amount, shipping_cost, COALESCE(unique_code, 0),
		       grand_total, status, payment_method, COALESCE(checkout_url, ''), payment_proof_url, tracking_number,
		       is_digital_only, paid_at,
		       COALESCE(courier_name, ''), COALESCE(courier_service, ''), COALESCE(courier_etd, ''),
		       created_at, updated_at
		FROM orders
		WHERE id = $1
	`, id).Scan(
		&ord.ID, &ord.UserID, &ord.ExternalOrderID, &ord.QRISGateTransactionID,
		&ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
		&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost, &ord.UniqueCode,
		&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.CheckoutURL, &ord.PaymentProofURL, &ord.TrackingNumber,
		&ord.IsDigitalOnly, &ord.PaidAt,
		&ord.CourierName, &ord.CourierService, &ord.CourierETD,
		&ord.CreatedAt, &ord.UpdatedAt,
	)
	if errors.Is(err, sqldb.ErrNoRows) {
		return nil, &errs.Error{Code: errs.NotFound, Message: "Order not found"}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	rows, err := db.Query(ctx, `
		SELECT id, order_id, product_id, product_name, price, quantity, is_digital, digital_file_url
		FROM order_items
		WHERE order_id = $1
	`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var oi OrderItem
			if err := rows.Scan(&oi.ID, &oi.OrderID, &oi.ProductID, &oi.ProductName, &oi.Price, &oi.Quantity, &oi.IsDigital, &oi.DigitalFileURL); err == nil {
				// Hide digital download URL if order is not paid
				if ord.Status != "paid" && ord.Status != "completed" {
					oi.DigitalFileURL = ""
				}
				ord.Items = append(ord.Items, &oi)
			}
		}
	}

	return &ord, nil
}

type ListOrdersResponse struct {
	Orders []*Order `json:"orders"`
}

// List returns orders. Customers see their own; Admins see all orders.
//
//encore:api auth method=GET path=/orders
func List(ctx context.Context) (*ListOrdersResponse, error) {
	usr, err := auth.Me(ctx)
	if err != nil {
		return nil, &errs.Error{Code: errs.Unauthenticated, Message: "Authentication required"}
	}

	var rows *sqldb.Rows
	if usr.Role == "admin" {
		rows, err = db.Query(ctx, `
			SELECT id, user_id, COALESCE(external_order_id, ''), COALESCE(qrisgate_transaction_id, ''),
			       customer_name, customer_email, customer_phone,
			       shipping_address, city, postal_code, total_amount, shipping_cost, COALESCE(unique_code, 0),
			       grand_total, status, payment_method, COALESCE(checkout_url, ''), payment_proof_url, tracking_number,
			       is_digital_only, paid_at,
			       COALESCE(courier_name, ''), COALESCE(courier_service, ''), COALESCE(courier_etd, ''),
			       created_at, updated_at
			FROM orders
			ORDER BY id DESC LIMIT 100
		`)
	} else {
		rows, err = db.Query(ctx, `
			SELECT id, user_id, COALESCE(external_order_id, ''), COALESCE(qrisgate_transaction_id, ''),
			       customer_name, customer_email, customer_phone,
			       shipping_address, city, postal_code, total_amount, shipping_cost, COALESCE(unique_code, 0),
			       grand_total, status, payment_method, COALESCE(checkout_url, ''), payment_proof_url, tracking_number,
			       is_digital_only, paid_at,
			       COALESCE(courier_name, ''), COALESCE(courier_service, ''), COALESCE(courier_etd, ''),
			       created_at, updated_at
			FROM orders
			WHERE user_id = $1 OR customer_email = $2
			ORDER BY id DESC LIMIT 50
		`, usr.ID, usr.Email)
	}

	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	defer rows.Close()

	var list []*Order
	for rows.Next() {
		var ord Order
		if err := rows.Scan(
			&ord.ID, &ord.UserID, &ord.ExternalOrderID, &ord.QRISGateTransactionID,
			&ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
			&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost, &ord.UniqueCode,
			&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.CheckoutURL, &ord.PaymentProofURL, &ord.TrackingNumber,
			&ord.IsDigitalOnly, &ord.PaidAt,
			&ord.CourierName, &ord.CourierService, &ord.CourierETD,
			&ord.CreatedAt, &ord.UpdatedAt,
		); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
		list = append(list, &ord)
	}
	return &ListOrdersResponse{Orders: list}, nil
}

type UploadProofParams struct {
	ProofURL string `json:"proof_url"`
}

// UploadProof saves customer proof of payment for manual transfer.
//
//encore:api public method=POST path=/orders/:id/proof
func UploadProof(ctx context.Context, id int64, p *UploadProofParams) error {
	_, err := db.Exec(ctx, `
		UPDATE orders
		SET payment_proof_url = $1, updated_at = NOW()
		WHERE id = $2
	`, p.ProofURL, id)
	return err
}

type UploadProofFileParams struct {
	Data     string `json:"data"` // base64 string
	FileName string `json:"file_name"`
}

type UploadProofFileResponse struct {
	ProofURL string `json:"proof_url"`
	FileName string `json:"file_name"`
}

// UploadProofFile uploads customer proof of payment file to the payment-proofs bucket with strict security.
//
//encore:api public method=POST path=/orders/:id/upload-proof
func UploadProofFile(ctx context.Context, id int64, p *UploadProofFileParams) (*UploadProofFileResponse, error) {
	// Verify order exists and is in pending status
	var status string
	err := db.QueryRow(ctx, `SELECT status FROM orders WHERE id = $1`, id).Scan(&status)
	if errors.Is(err, sqldb.ErrNoRows) {
		return nil, &errs.Error{Code: errs.NotFound, Message: "Pesanan tidak ditemukan"}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	if status != "pending" {
		return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "Pesanan ini sudah tidak dalam status menunggu pembayaran"}
	}

	if p.Data == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Data gambar bukti pembayaran diperlukan"}
	}

	// Strip data URL prefix if present (e.g. data:image/png;base64,...)
	data := p.Data
	if idx := strings.Index(data, ","); idx != -1 {
		data = data[idx+1:]
	}

	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Format base64 bukti pembayaran tidak valid"}
	}

	// Strict security validation: magic bytes sniffing, decode verification, max 5MB for payment receipts
	realMime, safeExt, err := product.ValidateAndSanitizeImage(decoded, 5*1024*1024)
	if err != nil {
		return nil, err
	}

	// Generate safe randomized storage key (prevents path traversal and collisions)
	objectName := fmt.Sprintf("order-%d-proof-%d%s", id, time.Now().UnixNano()/1e6, safeExt)

	writer := PaymentProofs.Upload(ctx, objectName, objects.WithUploadAttrs(objects.UploadAttrs{
		ContentType: realMime,
	}))
	if _, err := writer.Write(decoded); err != nil {
		writer.Abort(err)
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal menyimpan ke storage: %v", err)}
	}
	if err := writer.Close(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Gagal memfinalisasi upload: %v", err)}
	}

	proofURL := fmt.Sprintf("/proofs/%s", objectName)
	if pub := PaymentProofs.PublicURL(objectName); pub != nil && pub.String() != "" {
		proofURL = pub.String()
	}

	// Update order record
	_, err = db.Exec(ctx, `
		UPDATE orders
		SET payment_proof_url = $1, updated_at = NOW()
		WHERE id = $2
	`, proofURL, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	return &UploadProofFileResponse{
		ProofURL: proofURL,
		FileName: objectName,
	}, nil
}

// ServeProofImage serves a payment proof image stored in the payment-proofs bucket with strict security headers.
//
//encore:api public raw method=GET path=/proofs/:name
func ServeProofImage(w http.ResponseWriter, req *http.Request) {
	name := filepath.Base(filepath.Clean(req.URL.Path))
	if name == "" || name == "." || name == "/" {
		http.Error(w, "Proof image name required", http.StatusBadRequest)
		return
	}

	ctx := req.Context()
	reader := PaymentProofs.Download(ctx, name)
	defer reader.Close()

	attrs, err := PaymentProofs.Attrs(ctx, name)
	if err == nil && attrs.ContentType != "" {
		w.Header().Set("Content-Type", attrs.ContentType)
	} else {
		w.Header().Set("Content-Type", "image/jpeg")
	}

	// Security Headers to prevent MIME sniffing, XSS, and clickjacking
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	_, _ = io.Copy(w, reader)
}

type UpdateStatusParams struct {
	Status         string `json:"status"` // paid, processing, shipped, completed, cancelled
	TrackingNumber string `json:"tracking_number,omitempty"`
}

// UpdateStatus changes order status (admin only).
//
//encore:api auth method=POST path=/orders/:id/status
func UpdateStatus(ctx context.Context, id int64, p *UpdateStatusParams) error {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	var ord Order
	err = db.QueryRow(ctx, `
		SELECT id, customer_name, customer_email, customer_phone, status, grand_total, COALESCE(tracking_number, '')
		FROM orders WHERE id = $1
	`, id).Scan(&ord.ID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone, &ord.Status, &ord.GrandTotal, &ord.TrackingNumber)
	if err != nil {
		return &errs.Error{Code: errs.NotFound, Message: "Order not found"}
	}

	oldStatus := ord.Status
	newTracking := ord.TrackingNumber
	if p.TrackingNumber != "" {
		newTracking = p.TrackingNumber
	}

	_, err = db.Exec(ctx, `
		UPDATE orders
		SET status = $1, tracking_number = COALESCE(NULLIF($2, ''), tracking_number), updated_at = NOW()
		WHERE id = $3
	`, p.Status, p.TrackingNumber, id)
	if err != nil {
		return err
	}

	// Publish status changed event to trigger in-app & email notifications
	if oldStatus != p.Status || (p.TrackingNumber != "" && p.TrackingNumber != ord.TrackingNumber) {
		_, _ = OrderStatusChangedTopic.Publish(ctx, &OrderStatusChangedEvent{
			OrderID:        id,
			CustomerName:   ord.CustomerName,
			CustomerEmail:  ord.CustomerEmail,
			CustomerPhone:  ord.CustomerPhone,
			OldStatus:      oldStatus,
			NewStatus:      p.Status,
			TrackingNumber: newTracking,
			GrandTotal:     ord.GrandTotal,
			ChangedAt:      time.Now(),
		})
	}

	return nil
}

// MarkPaid marks an order as paid, records paid_at, and triggers fulfillment (digital delivery + notifications).
func MarkPaid(ctx context.Context, orderID int64) error {
	return MarkPaidWithEvent(ctx, orderID, "", time.Now())
}

// MarkPaidWithEvent finds an order by orderID or externalOrderID, sets status to paid, saves paid_at, and runs fulfillment.
func MarkPaidWithEvent(ctx context.Context, orderID int64, externalOrderID string, paidAt time.Time) error {
	if paidAt.IsZero() {
		paidAt = time.Now()
	}

	var ord Order
	var err error
	if orderID > 0 {
		err = db.QueryRow(ctx, `
			SELECT id, customer_name, customer_email, customer_phone, status, grand_total, COALESCE(tracking_number, '')
			FROM orders WHERE id = $1
		`, orderID).Scan(&ord.ID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone, &ord.Status, &ord.GrandTotal, &ord.TrackingNumber)
	} else if externalOrderID != "" {
		err = db.QueryRow(ctx, `
			SELECT id, customer_name, customer_email, customer_phone, status, grand_total, COALESCE(tracking_number, '')
			FROM orders WHERE external_order_id = $1
		`, externalOrderID).Scan(&ord.ID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone, &ord.Status, &ord.GrandTotal, &ord.TrackingNumber)
	} else {
		return &errs.Error{Code: errs.InvalidArgument, Message: "order_id or external_order_id required"}
	}
	if err != nil {
		return err
	}

	// Idempotent: if already paid/completed, do not re-trigger fulfillment
	if ord.Status == "paid" || ord.Status == "processing" || ord.Status == "shipped" || ord.Status == "completed" {
		return nil
	}

	_, err = db.Exec(ctx, `
		UPDATE orders
		SET status = 'paid', paid_at = $2, updated_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, ord.ID, paidAt)
	if err != nil {
		return err
	}
	rlog.Info("order marked as paid", "order_id", ord.ID, "external_order_id", externalOrderID, "paid_at", paidAt)

	_, _ = OrderStatusChangedTopic.Publish(ctx, &OrderStatusChangedEvent{
		OrderID:        ord.ID,
		CustomerName:   ord.CustomerName,
		CustomerEmail:  ord.CustomerEmail,
		CustomerPhone:  ord.CustomerPhone,
		OldStatus:      "pending",
		NewStatus:      "paid",
		TrackingNumber: ord.TrackingNumber,
		GrandTotal:     ord.GrandTotal,
		ChangedAt:      paidAt,
	})

	return nil
}

// CancelExpiredOrders automatically cancels unpaid pending orders older than 24 hours (or 15 minutes for QRISGate) and restores stock.
//
//encore:api private
func CancelExpiredOrders(ctx context.Context) error {
	rows, err := db.Query(ctx, `
		SELECT id, payment_method FROM orders 
		WHERE status = 'pending' AND (
			created_at < NOW() - INTERVAL '24 hours' OR
			(payment_method = 'qrisgate' AND created_at < NOW() - INTERVAL '16 minutes')
		)
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var orderID int64
		var payMethod string
		if err := rows.Scan(&orderID, &payMethod); err == nil {
			// Restore product stocks
			itemRows, itemErr := db.Query(ctx, `SELECT product_id, quantity, is_digital FROM order_items WHERE order_id = $1`, orderID)
			if itemErr == nil {
				for itemRows.Next() {
					var pID int64
					var qty int
					var isDig bool
					if err := itemRows.Scan(&pID, &qty, &isDig); err == nil && !isDig {
						_ = product.AdjustStock(ctx, pID, qty)
					}
				}
				itemRows.Close()
			}
			_, _ = db.Exec(ctx, `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, orderID)
			rlog.Info("expired order cancelled", "order_id", orderID, "payment_method", payMethod)
		}
	}
	return nil
}

type DailyRevenuePoint struct {
	Date    string `json:"date"`
	Revenue int64  `json:"revenue"`
	Orders  int    `json:"orders"`
}

type MethodBreakdown struct {
	Method string `json:"method"`
	Total  int64  `json:"total"`
	Count  int    `json:"count"`
}

type DashboardStatsResponse struct {
	TotalRevenue     int64                `json:"total_revenue"`
	TodayRevenue     int64                `json:"today_revenue"`
	ThisMonthRevenue int64                `json:"this_month_revenue"`
	PendingRevenue   int64                `json:"pending_revenue"`
	TotalOrders      int64                `json:"total_orders"`
	PendingOrders    int64                `json:"pending_orders"`
	PaidOrders       int64                `json:"paid_orders"`
	ShippedOrders    int64                `json:"shipped_orders"`
	CompletedOrders  int64                `json:"completed_orders"`
	CancelledOrders  int64                `json:"cancelled_orders"`
	RecentOrders     []*Order             `json:"recent_orders"`
	DailyRevenue     []*DailyRevenuePoint `json:"daily_revenue"`
	PaymentBreakdown []*MethodBreakdown   `json:"payment_breakdown"`
}

// AdminDashboard returns full overview metrics for store dashboard (admin only).
//
//encore:api auth method=GET path=/admin/dashboard
func AdminDashboard(ctx context.Context) (*DashboardStatsResponse, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	var s DashboardStatsResponse

	// Overall revenue and counts
	err = db.QueryRow(ctx, `
		SELECT 
			COALESCE(SUM(grand_total) FILTER (WHERE status IN ('paid', 'processing', 'shipped', 'completed')), 0),
			COALESCE(SUM(grand_total) FILTER (WHERE status IN ('paid', 'processing', 'shipped', 'completed') AND created_at >= CURRENT_DATE), 0),
			COALESCE(SUM(grand_total) FILTER (WHERE status IN ('paid', 'processing', 'shipped', 'completed') AND created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0),
			COALESCE(SUM(grand_total) FILTER (WHERE status = 'pending'), 0),
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'pending'),
			COUNT(*) FILTER (WHERE status = 'paid'),
			COUNT(*) FILTER (WHERE status = 'shipped'),
			COUNT(*) FILTER (WHERE status = 'completed'),
			COUNT(*) FILTER (WHERE status = 'cancelled')
		FROM orders
	`).Scan(
		&s.TotalRevenue, &s.TodayRevenue, &s.ThisMonthRevenue, &s.PendingRevenue,
		&s.TotalOrders, &s.PendingOrders, &s.PaidOrders, &s.ShippedOrders,
		&s.CompletedOrders, &s.CancelledOrders,
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	// 7 days daily revenue
	dayRows, err := db.Query(ctx, `
		SELECT TO_CHAR(d.day, 'YYYY-MM-DD'), COALESCE(SUM(o.grand_total), 0), COUNT(o.id)
		FROM (
			SELECT (CURRENT_DATE - (i || ' days')::interval)::date AS day
			FROM generate_series(6, 0, -1) AS i
		) d
		LEFT JOIN orders o ON DATE(o.created_at) = d.day AND o.status IN ('paid', 'processing', 'shipped', 'completed')
		GROUP BY d.day
		ORDER BY d.day ASC
	`)
	if err == nil {
		defer dayRows.Close()
		for dayRows.Next() {
			var dp DailyRevenuePoint
			if err := dayRows.Scan(&dp.Date, &dp.Revenue, &dp.Orders); err == nil {
				s.DailyRevenue = append(s.DailyRevenue, &dp)
			}
		}
	}

	// Payment breakdown
	pbRows, err := db.Query(ctx, `
		SELECT payment_method, COALESCE(SUM(grand_total), 0), COUNT(*)
		FROM orders
		WHERE status IN ('paid', 'processing', 'shipped', 'completed')
		GROUP BY payment_method
		ORDER BY SUM(grand_total) DESC
	`)
	if err == nil {
		defer pbRows.Close()
		for pbRows.Next() {
			var mb MethodBreakdown
			if err := pbRows.Scan(&mb.Method, &mb.Total, &mb.Count); err == nil {
				s.PaymentBreakdown = append(s.PaymentBreakdown, &mb)
			}
		}
	}

	// Recent 10 orders
	recRows, err := db.Query(ctx, `
		SELECT id, user_id, COALESCE(external_order_id, ''), COALESCE(qrisgate_transaction_id, ''),
		       customer_name, customer_email, customer_phone,
		       shipping_address, city, postal_code, total_amount, shipping_cost, COALESCE(unique_code, 0),
		       grand_total, status, payment_method, COALESCE(checkout_url, ''), payment_proof_url, tracking_number,
		       is_digital_only, paid_at,
		       COALESCE(courier_name, ''), COALESCE(courier_service, ''), COALESCE(courier_etd, ''),
		       created_at, updated_at
		FROM orders
		ORDER BY id DESC LIMIT 10
	`)
	if err == nil {
		defer recRows.Close()
		for recRows.Next() {
			var ord Order
			if err := recRows.Scan(
				&ord.ID, &ord.UserID, &ord.ExternalOrderID, &ord.QRISGateTransactionID,
				&ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
				&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost, &ord.UniqueCode,
				&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.CheckoutURL, &ord.PaymentProofURL, &ord.TrackingNumber,
				&ord.IsDigitalOnly, &ord.PaidAt,
				&ord.CourierName, &ord.CourierService, &ord.CourierETD,
				&ord.CreatedAt, &ord.UpdatedAt,
			); err == nil {
				s.RecentOrders = append(s.RecentOrders, &ord)
			}
		}
	}

	return &s, nil
}

type FinanceTransaction struct {
	ID            int64     `json:"id"`
	CustomerName  string    `json:"customer_name"`
	CustomerEmail string    `json:"customer_email"`
	PaymentMethod string    `json:"payment_method"`
	Amount        int64     `json:"amount"`
	ShippingCost  int64     `json:"shipping_cost"`
	Status        string    `json:"status"`
	ProofURL      string    `json:"proof_url,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type FinanceSummaryResponse struct {
	TotalSettledRevenue int64                 `json:"total_settled_revenue"`
	TotalPendingRevenue int64                 `json:"total_pending_revenue"`
	TotalTransactions   int64                 `json:"total_transactions"`
	MethodBreakdown     []*MethodBreakdown    `json:"method_breakdown"`
	RecentTransactions  []*FinanceTransaction `json:"recent_transactions"`
}

// AdminFinance returns detailed financial accounting metrics (admin only).
//
//encore:api auth method=GET path=/admin/finance
func AdminFinance(ctx context.Context) (*FinanceSummaryResponse, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	var res FinanceSummaryResponse

	err = db.QueryRow(ctx, `
		SELECT 
			COALESCE(SUM(grand_total) FILTER (WHERE status IN ('paid', 'processing', 'shipped', 'completed')), 0),
			COALESCE(SUM(grand_total) FILTER (WHERE status = 'pending'), 0),
			COUNT(*) FILTER (WHERE status IN ('paid', 'processing', 'shipped', 'completed'))
		FROM orders
	`).Scan(&res.TotalSettledRevenue, &res.TotalPendingRevenue, &res.TotalTransactions)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	// Method breakdown
	mbRows, err := db.Query(ctx, `
		SELECT payment_method, COALESCE(SUM(grand_total), 0), COUNT(*)
		FROM orders
		GROUP BY payment_method
		ORDER BY SUM(grand_total) DESC
	`)
	if err == nil {
		defer mbRows.Close()
		for mbRows.Next() {
			var mb MethodBreakdown
			if err := mbRows.Scan(&mb.Method, &mb.Total, &mb.Count); err == nil {
				res.MethodBreakdown = append(res.MethodBreakdown, &mb)
			}
		}
	}

	// Recent 30 transactions
	tRows, err := db.Query(ctx, `
		SELECT id, customer_name, customer_email, payment_method, grand_total, shipping_cost, status, COALESCE(payment_proof_url, ''), created_at
		FROM orders
		ORDER BY id DESC LIMIT 30
	`)
	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var ft FinanceTransaction
			if err := tRows.Scan(&ft.ID, &ft.CustomerName, &ft.CustomerEmail, &ft.PaymentMethod, &ft.Amount, &ft.ShippingCost, &ft.Status, &ft.ProofURL, &ft.CreatedAt); err == nil {
				res.RecentTransactions = append(res.RecentTransactions, &ft)
			}
		}
	}

	return &res, nil
}

// Cron job to run CancelExpiredOrders every 15 minutes
var _ = cron.NewJob("cancel-unpaid-orders", cron.JobConfig{
	Title:    "Cancel Unpaid Orders",
	Endpoint: CancelExpiredOrders,
	Every:    15 * cron.Minute,
})

// Subscribe to payment success events to mark orders paid
var _ = pubsub.NewSubscription(payment.PaymentSuccessTopic, "mark-order-paid", pubsub.SubscriptionConfig[*payment.PaymentSuccessEvent]{
	Handler: func(ctx context.Context, e *payment.PaymentSuccessEvent) error {
		return MarkPaidWithEvent(ctx, e.OrderID, e.ExternalOrderID, e.PaidAt)
	},
})

// Subscribe to payment failed events to cancel expired orders and restore stock
var _ = pubsub.NewSubscription(payment.PaymentFailedTopic, "handle-payment-failed", pubsub.SubscriptionConfig[*payment.PaymentFailedEvent]{
	Handler: func(ctx context.Context, e *payment.PaymentFailedEvent) error {
		orderID := e.OrderID
		if orderID == 0 && e.ExternalOrderID != "" {
			_ = db.QueryRow(ctx, `SELECT id FROM orders WHERE external_order_id = $1`, e.ExternalOrderID).Scan(&orderID)
		}
		if orderID == 0 {
			return nil
		}

		var currentStatus string
		var customerName, customerEmail, customerPhone, trackingNumber string
		var grandTotal int64
		err := db.QueryRow(ctx, `
			SELECT status, customer_name, customer_email, customer_phone, grand_total, COALESCE(tracking_number, '')
			FROM orders WHERE id = $1
		`, orderID).Scan(&currentStatus, &customerName, &customerEmail, &customerPhone, &grandTotal, &trackingNumber)
		if err != nil || currentStatus != "pending" {
			return nil
		}

		// Kembalikan stok barang fisik
		itemRows, itemErr := db.Query(ctx, `SELECT product_id, quantity, is_digital FROM order_items WHERE order_id = $1`, orderID)
		if itemErr == nil {
			for itemRows.Next() {
				var pID int64
				var qty int
				var isDig bool
				if err := itemRows.Scan(&pID, &qty, &isDig); err == nil && !isDig {
					_ = product.AdjustStock(ctx, pID, qty)
				}
			}
			itemRows.Close()
		}

		targetStatus := "cancelled"
		_, err = db.Exec(ctx, `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND status = 'pending'`, targetStatus, orderID)
		if err != nil {
			return err
		}
		rlog.Info("order expired/cancelled and stock restored", "order_id", orderID, "reason", e.Reason)

		_, _ = OrderStatusChangedTopic.Publish(ctx, &OrderStatusChangedEvent{
			OrderID:        orderID,
			CustomerName:   customerName,
			CustomerEmail:  customerEmail,
			CustomerPhone:  customerPhone,
			OldStatus:      "pending",
			NewStatus:      targetStatus,
			TrackingNumber: trackingNumber,
			GrandTotal:     grandTotal,
			ChangedAt:      time.Now(),
		})

		return nil
	},
})
