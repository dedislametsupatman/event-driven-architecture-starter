package order

import (
	"context"
	"errors"
	"fmt"
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
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("orders", sqldb.DatabaseConfig{
	Migrations: "./migrations",
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
	ID              int64        `json:"id"`
	UserID          *int64       `json:"user_id,omitempty"`
	CustomerName    string       `json:"customer_name"`
	CustomerEmail   string       `json:"customer_email"`
	CustomerPhone   string       `json:"customer_phone"`
	ShippingAddress string       `json:"shipping_address"`
	City            string       `json:"city"`
	PostalCode      string       `json:"postal_code"`
	TotalAmount     int64        `json:"total_amount"`
	ShippingCost    int64        `json:"shipping_cost"`
	GrandTotal      int64        `json:"grand_total"`
	Status          string       `json:"status"` // pending, paid, processing, shipped, completed, cancelled
	PaymentMethod   string       `json:"payment_method"`
	PaymentProofURL string       `json:"payment_proof_url,omitempty"`
	TrackingNumber  string       `json:"tracking_number,omitempty"`
	IsDigitalOnly   bool         `json:"is_digital_only"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
	Items           []*OrderItem `json:"items,omitempty"`
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
	Items           []*CheckoutItem `json:"items"`
}

type OrderCreatedEvent struct {
	Order *Order `json:"order"`
}

var OrderCreatedTopic = pubsub.NewTopic[*OrderCreatedEvent]("order-created", pubsub.TopicConfig{
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
	if !isDigitalOnly {
		shippingCost = 15000 // Tarif flat default IDR 15.000 untuk barang fisik
		if p.ShippingAddress == "" {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Shipping address is required for physical goods"}
		}
	}

	grandTotal := totalAmount + shippingCost

	var ord Order
	err := db.QueryRow(ctx, `
		INSERT INTO orders (
			user_id, customer_name, customer_email, customer_phone,
			shipping_address, city, postal_code, total_amount, shipping_cost,
			grand_total, status, payment_method, is_digital_only, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, NOW(), NOW())
		RETURNING id, user_id, customer_name, customer_email, customer_phone,
		          shipping_address, city, postal_code, total_amount, shipping_cost,
		          grand_total, status, payment_method, is_digital_only, created_at, updated_at
	`, optionalUserID, p.CustomerName, p.CustomerEmail, p.CustomerPhone,
		p.ShippingAddress, p.City, p.PostalCode, totalAmount, shippingCost,
		grandTotal, p.PaymentMethod, isDigitalOnly).Scan(
		&ord.ID, &ord.UserID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
		&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost,
		&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.IsDigitalOnly,
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

// Get returns order details by ID.
//
//encore:api public method=GET path=/orders/:id
func Get(ctx context.Context, id int64) (*Order, error) {
	var ord Order
	err := db.QueryRow(ctx, `
		SELECT id, user_id, customer_name, customer_email, customer_phone,
		       shipping_address, city, postal_code, total_amount, shipping_cost,
		       grand_total, status, payment_method, payment_proof_url, tracking_number,
		       is_digital_only, created_at, updated_at
		FROM orders
		WHERE id = $1
	`, id).Scan(
		&ord.ID, &ord.UserID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
		&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost,
		&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.PaymentProofURL, &ord.TrackingNumber,
		&ord.IsDigitalOnly, &ord.CreatedAt, &ord.UpdatedAt,
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
			SELECT id, user_id, customer_name, customer_email, customer_phone,
			       shipping_address, city, postal_code, total_amount, shipping_cost,
			       grand_total, status, payment_method, payment_proof_url, tracking_number,
			       is_digital_only, created_at, updated_at
			FROM orders
			ORDER BY id DESC LIMIT 100
		`)
	} else {
		rows, err = db.Query(ctx, `
			SELECT id, user_id, customer_name, customer_email, customer_phone,
			       shipping_address, city, postal_code, total_amount, shipping_cost,
			       grand_total, status, payment_method, payment_proof_url, tracking_number,
			       is_digital_only, created_at, updated_at
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
			&ord.ID, &ord.UserID, &ord.CustomerName, &ord.CustomerEmail, &ord.CustomerPhone,
			&ord.ShippingAddress, &ord.City, &ord.PostalCode, &ord.TotalAmount, &ord.ShippingCost,
			&ord.GrandTotal, &ord.Status, &ord.PaymentMethod, &ord.PaymentProofURL, &ord.TrackingNumber,
			&ord.IsDigitalOnly, &ord.CreatedAt, &ord.UpdatedAt,
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

	_, err = db.Exec(ctx, `
		UPDATE orders
		SET status = $1, tracking_number = COALESCE(NULLIF($2, ''), tracking_number), updated_at = NOW()
		WHERE id = $3
	`, p.Status, p.TrackingNumber, id)
	return err
}

// MarkPaid marks an order as paid and completes digital delivery.
func MarkPaid(ctx context.Context, orderID int64) error {
	_, err := db.Exec(ctx, `
		UPDATE orders
		SET status = 'paid', updated_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, orderID)
	rlog.Info("order marked as paid", "order_id", orderID)
	return err
}

// CancelExpiredOrders automatically cancels unpaid pending orders older than 24 hours and restores stock.
//
//encore:api private
func CancelExpiredOrders(ctx context.Context) error {
	rows, err := db.Query(ctx, `
		SELECT id FROM orders 
		WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var orderID int64
		if err := rows.Scan(&orderID); err == nil {
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
			rlog.Info("expired order cancelled", "order_id", orderID)
		}
	}
	return nil
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
		return MarkPaid(ctx, e.OrderID)
	},
})
