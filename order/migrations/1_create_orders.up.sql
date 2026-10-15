CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT DEFAULT NULL, -- NULL if guest checkout
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    shipping_address TEXT DEFAULT '',
    city VARCHAR(100) DEFAULT '',
    postal_code VARCHAR(20) DEFAULT '',
    total_amount BIGINT NOT NULL DEFAULT 0,
    shipping_cost BIGINT NOT NULL DEFAULT 0,
    grand_total BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, paid, processing, shipped, completed, cancelled
    payment_method VARCHAR(50) NOT NULL DEFAULT 'manual_transfer', -- manual_transfer, qris, midtrans
    payment_proof_url TEXT DEFAULT '',
    tracking_number VARCHAR(100) DEFAULT '',
    is_digital_only BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    price BIGINT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    is_digital BOOLEAN NOT NULL DEFAULT FALSE,
    digital_file_url TEXT DEFAULT ''
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
