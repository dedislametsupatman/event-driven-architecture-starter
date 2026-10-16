CREATE TABLE IF NOT EXISTS email_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO email_settings (key, value)
VALUES 
    ('smtp_host', 'smtp.gmail.com'),
    ('smtp_port', '587'),
    ('smtp_user', ''),
    ('smtp_pass', ''),
    ('sender_name', 'Supatman Store Official'),
    ('sender_email', ''),
    ('email_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    tracking_number VARCHAR(100),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_customer ON in_app_notifications (customer_email, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_order ON in_app_notifications (order_id);
