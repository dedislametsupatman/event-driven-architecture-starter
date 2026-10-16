CREATE TABLE IF NOT EXISTS store_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO store_settings (key, value)
VALUES 
    ('store_name', 'SUPATMAN STORE'),
    ('store_tagline', 'Hardware Setup & Digital Atelier'),
    ('store_logo_url', ''),
    ('store_badge', 'OFFICIAL'),
    ('store_phone', '08123456789'),
    ('store_address', 'Jl. Merdeka No. 45, Bandung, Jawa Barat'),
    ('store_announcement', 'Pengiriman Kilat Pulau Jawa & Akses Unduhan Instan Seluruh Aset Digital')
ON CONFLICT (key) DO NOTHING;
