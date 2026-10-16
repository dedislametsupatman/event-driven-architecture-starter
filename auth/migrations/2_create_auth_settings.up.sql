CREATE TABLE IF NOT EXISTS auth_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO auth_settings (key, value)
VALUES 
    ('google_client_id', ''),
    ('google_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
