CREATE TABLE categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    icon VARCHAR(100) DEFAULT 'sparkles'
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    price BIGINT NOT NULL DEFAULT 0, -- price in IDR
    stock INT NOT NULL DEFAULT 0,
    is_digital BOOLEAN NOT NULL DEFAULT FALSE,
    digital_file_url TEXT DEFAULT '',
    weight_grams INT DEFAULT 500, -- for physical shipping estimation
    image_url TEXT DEFAULT '',
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_is_digital ON products(is_digital);

-- Seed initial categories
INSERT INTO categories (name, slug, icon) VALUES
('Physical Goods', 'physical', 'shopping-bag'),
('Digital Products', 'digital', 'download'),
('Electronics & Gadgets', 'gadgets', 'device-phone-mobile'),
('Templates & E-Books', 'ebooks-templates', 'document-text');

-- Seed initial sample products (both physical and digital)
INSERT INTO products (name, slug, description, price, stock, is_digital, digital_file_url, weight_grams, image_url, category_id) VALUES
(
    'Mechanical Keyboard Wireless RGB',
    'mechanical-keyboard-wireless-rgb',
    'Custom 75% wireless mechanical keyboard dengan switch linear, PBT keycaps, dan battery 4000mAh.',
    899000,
    15,
    FALSE,
    '',
    950,
    'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
    1
),
(
    'Minimalist Desk Mat Leather (90x40cm)',
    'minimalist-desk-mat-leather',
    'Alas meja kerja kulit sintetis premium tahan air dengan jahitan halus di sekelilingnya.',
    149000,
    30,
    FALSE,
    '',
    400,
    'https://images.unsplash.com/photo-1616440347437-b1c73416efc2?auto=format&fit=crop&w=800&q=80',
    1
),
(
    'E-Book: Master Event-Driven Architecture with Go',
    'ebook-eda-with-go',
    'Panduan lengkap membangun sistem backend microservices berbasis event, pub/sub, dan domain-driven design menggunakan Go & Encore.',
    99000,
    999,
    TRUE,
    'https://example.com/downloads/master-eda-go-v1.pdf',
    0,
    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
    2
),
(
    'Pro UI Design System Kit (Figma + React)',
    'pro-ui-design-system-kit',
    'Lebih dari 400+ komponen modern siap pakai untuk Figma & React dengan dark mode support penuh.',
    189000,
    999,
    TRUE,
    'https://example.com/downloads/design-system-pro-license.zip',
    0,
    'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80',
    2
);
