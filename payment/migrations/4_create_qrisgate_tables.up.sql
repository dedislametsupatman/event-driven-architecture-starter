CREATE TABLE IF NOT EXISTS qrisgate_transactions (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    external_order_id VARCHAR(120) NOT NULL UNIQUE,
    transaction_id VARCHAR(120) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'QRIS',
    bank_code VARCHAR(50) NOT NULL DEFAULT '',
    base_amount BIGINT NOT NULL,
    unique_code BIGINT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL,
    checkout_url TEXT NOT NULL DEFAULT '',
    qr_string TEXT NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qrisgate_tx_order_id ON qrisgate_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_qrisgate_tx_transaction_id ON qrisgate_transactions(transaction_id);

CREATE TABLE IF NOT EXISTS qrisgate_webhook_events (
    event_id VARCHAR(150) PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    external_order_id VARCHAR(120) NOT NULL,
    transaction_id VARCHAR(120) NOT NULL,
    raw_payload TEXT NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO payment_settings (key, value)
VALUES
    ('qrisgate_base_url', 'https://qrisgate.web.id'),
    ('qrisgate_api_key', ''),
    ('qrisgate_webhook_secret', ''),
    ('qrisgate_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

GRANT ALL PRIVILEGES ON TABLE qrisgate_transactions TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE qrisgate_webhook_events TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;

