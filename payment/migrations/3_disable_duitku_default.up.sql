-- Nonaktifkan sementara Duitku secara default
UPDATE payment_settings SET value = 'false' WHERE key = 'duitku_enabled';
