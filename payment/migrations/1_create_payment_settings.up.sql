CREATE TABLE IF NOT EXISTS payment_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO payment_settings (key, value)
VALUES 
    ('duitku_merchant_code', ''),
    ('duitku_api_key', ''),
    ('duitku_sandbox', 'true'),
    ('duitku_enabled', 'true'),
    ('duitku_expiry_period', '1440')
ON CONFLICT (key) DO NOTHING;

