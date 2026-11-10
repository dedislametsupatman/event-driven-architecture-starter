CREATE TABLE IF NOT EXISTS shipping_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO shipping_settings (key, value) VALUES
    ('biteship_api_key', ''),
    ('biteship_origin_postal_code', '40115'),
    ('biteship_origin_address', 'Jl. Merdeka No. 45, Bandung, Jawa Barat'),
    ('biteship_couriers', 'jne,sicepat,anteraja,jnt'),
    ('biteship_enabled', 'false'),
    ('default_flat_shipping_cost', '15000')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_service VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_etd VARCHAR(100) NOT NULL DEFAULT '';

GRANT ALL PRIVILEGES ON TABLE shipping_settings TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE orders TO PUBLIC;
