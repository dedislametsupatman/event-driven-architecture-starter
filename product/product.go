package product

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"encore.app/auth"
	"encore.dev/beta/errs"
	"encore.dev/storage/objects"
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("products", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

var ProductImages = objects.NewBucket("product-images", objects.BucketConfig{
	Public: true,
})

var ProductVideos = objects.NewBucket("product-videos", objects.BucketConfig{
	Public: true,
})

type Category struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Icon string `json:"icon"`
}

type AffiliateLink struct {
	Platform string `json:"platform"` // e.g. "shopee", "tiktok", "tokopedia", "lazada", "other"
	Title    string `json:"title"`
	URL      string `json:"url"`
}

type Product struct {
	ID             int64           `json:"id"`
	Name           string          `json:"name"`
	Slug           string          `json:"slug"`
	Description    string          `json:"description"`
	Price          int64           `json:"price"` // IDR
	Stock          int             `json:"stock"`
	IsDigital      bool            `json:"is_digital"`
	DigitalFileURL string          `json:"digital_file_url,omitempty"`
	WeightGrams    int             `json:"weight_grams"`
	ImageURL       string          `json:"image_url"`
	VideoURL       string          `json:"video_url,omitempty"`
	AffiliateLinks []AffiliateLink `json:"affiliate_links"`
	CategoryID     *int64          `json:"category_id"`
	CategoryName   string          `json:"category_name,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type ListParams struct {
	CategorySlug string `json:"category_slug,omitempty"`
	IsDigital    string `json:"is_digital,omitempty"` // "true", "false", or ""
	Search       string `json:"search,omitempty"`
	Limit        int    `json:"limit,omitempty"`
	Offset       int    `json:"offset,omitempty"`
}

type ListResponse struct {
	Products []*Product `json:"products"`
	Total    int64      `json:"total"`
}

// List returns products with optional filters.
//
//encore:api public method=GET path=/products
func List(ctx context.Context, p *ListParams) (*ListResponse, error) {
	if p.Limit <= 0 || p.Limit > 100 {
		p.Limit = 50
	}

	query := `
		SELECT p.id, p.name, p.slug, p.description, p.price, p.stock, 
		       p.is_digital, COALESCE(p.digital_file_url, ''), p.weight_grams, p.image_url, 
		       COALESCE(p.video_url, ''), COALESCE(p.affiliate_links, '[]'::jsonb),
		       p.category_id, 
		       COALESCE(c.name, '') as category_name, p.created_at, p.updated_at
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE 1=1
	`
	var args []any
	argIdx := 1

	if p.Search != "" {
		query += fmt.Sprintf(" AND (p.name ILIKE $%d OR p.description ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+p.Search+"%")
		argIdx++
	}

	if p.CategorySlug != "" {
		query += fmt.Sprintf(" AND c.slug = $%d", argIdx)
		args = append(args, p.CategorySlug)
		argIdx++
	}

	if p.IsDigital == "true" {
		query += fmt.Sprintf(" AND p.is_digital = $%d", argIdx)
		args = append(args, true)
		argIdx++
	} else if p.IsDigital == "false" {
		query += fmt.Sprintf(" AND p.is_digital = $%d", argIdx)
		args = append(args, false)
		argIdx++
	}

	query += fmt.Sprintf(" ORDER BY p.id DESC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, p.Limit, p.Offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	defer rows.Close()

	var products []*Product
	for rows.Next() {
		var pr Product
		var affiliateLinksRaw []byte
		if err := rows.Scan(
			&pr.ID, &pr.Name, &pr.Slug, &pr.Description, &pr.Price, &pr.Stock,
			&pr.IsDigital, &pr.DigitalFileURL, &pr.WeightGrams, &pr.ImageURL,
			&pr.VideoURL, &affiliateLinksRaw, &pr.CategoryID,
			&pr.CategoryName, &pr.CreatedAt, &pr.UpdatedAt,
		); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
		if len(affiliateLinksRaw) > 0 {
			_ = json.Unmarshal(affiliateLinksRaw, &pr.AffiliateLinks)
		}
		if pr.AffiliateLinks == nil {
			pr.AffiliateLinks = []AffiliateLink{}
		}
		products = append(products, &pr)
	}

	return &ListResponse{
		Products: products,
		Total:    int64(len(products)),
	}, nil
}

// Get returns a single product by numeric ID or slug.
//
//encore:api public method=GET path=/products/:identifier
func Get(ctx context.Context, identifier string) (*Product, error) {
	var pr Product
	var err error
	var affiliateLinksRaw []byte

	query := `
		SELECT p.id, p.name, p.slug, p.description, p.price, p.stock, 
		       p.is_digital, COALESCE(p.digital_file_url, ''), p.weight_grams, p.image_url, 
		       COALESCE(p.video_url, ''), COALESCE(p.affiliate_links, '[]'::jsonb),
		       p.category_id, 
		       COALESCE(c.name, '') as category_name, p.created_at, p.updated_at
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
	`

	if id, parseErr := strconv.ParseInt(identifier, 10, 64); parseErr == nil {
		err = db.QueryRow(ctx, query+` WHERE p.id = $1`, id).Scan(
			&pr.ID, &pr.Name, &pr.Slug, &pr.Description, &pr.Price, &pr.Stock,
			&pr.IsDigital, &pr.DigitalFileURL, &pr.WeightGrams, &pr.ImageURL,
			&pr.VideoURL, &affiliateLinksRaw, &pr.CategoryID,
			&pr.CategoryName, &pr.CreatedAt, &pr.UpdatedAt,
		)
	} else {
		err = db.QueryRow(ctx, query+` WHERE p.slug = $1`, identifier).Scan(
			&pr.ID, &pr.Name, &pr.Slug, &pr.Description, &pr.Price, &pr.Stock,
			&pr.IsDigital, &pr.DigitalFileURL, &pr.WeightGrams, &pr.ImageURL,
			&pr.VideoURL, &affiliateLinksRaw, &pr.CategoryID,
			&pr.CategoryName, &pr.CreatedAt, &pr.UpdatedAt,
		)
	}

	if errors.Is(err, sqldb.ErrNoRows) {
		return nil, &errs.Error{Code: errs.NotFound, Message: "Product not found"}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	if len(affiliateLinksRaw) > 0 {
		_ = json.Unmarshal(affiliateLinksRaw, &pr.AffiliateLinks)
	}
	if pr.AffiliateLinks == nil {
		pr.AffiliateLinks = []AffiliateLink{}
	}

	return &pr, nil
}

type CategoriesResponse struct {
	Categories []*Category `json:"categories"`
}

// Categories returns all available product categories.
//
//encore:api public method=GET path=/categories
func Categories(ctx context.Context) (*CategoriesResponse, error) {
	rows, err := db.Query(ctx, `SELECT id, name, slug, icon FROM categories ORDER BY id ASC`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	defer rows.Close()

	var list []*Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Icon); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
		list = append(list, &c)
	}
	return &CategoriesResponse{Categories: list}, nil
}

type CreateProductParams struct {
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Price          int64           `json:"price"`
	Stock          int             `json:"stock"`
	IsDigital      bool            `json:"is_digital"`
	DigitalFileURL string          `json:"digital_file_url,omitempty"`
	WeightGrams    int             `json:"weight_grams"`
	ImageURL       string          `json:"image_url"`
	VideoURL       string          `json:"video_url,omitempty"`
	AffiliateLinks []AffiliateLink `json:"affiliate_links,omitempty"`
	CategoryID     *int64          `json:"category_id"`
}

// Create adds a new product (admin only).
//
//encore:api auth method=POST path=/products
func Create(ctx context.Context, p *CreateProductParams) (*Product, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	slug := slugify(p.Name)
	if p.WeightGrams <= 0 && !p.IsDigital {
		p.WeightGrams = 500
	}

	linksJSON, _ := json.Marshal(p.AffiliateLinks)
	if len(p.AffiliateLinks) == 0 {
		linksJSON = []byte("[]")
	}

	var pr Product
	var affiliateLinksRaw []byte
	err = db.QueryRow(ctx, `
		INSERT INTO products (name, slug, description, price, stock, is_digital, digital_file_url, weight_grams, image_url, video_url, affiliate_links, category_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
		RETURNING id, name, slug, description, price, stock, is_digital, digital_file_url, weight_grams, image_url, video_url, affiliate_links, category_id, created_at, updated_at
	`, p.Name, slug, p.Description, p.Price, p.Stock, p.IsDigital, p.DigitalFileURL, p.WeightGrams, p.ImageURL, p.VideoURL, linksJSON, p.CategoryID).Scan(
		&pr.ID, &pr.Name, &pr.Slug, &pr.Description, &pr.Price, &pr.Stock,
		&pr.IsDigital, &pr.DigitalFileURL, &pr.WeightGrams, &pr.ImageURL,
		&pr.VideoURL, &affiliateLinksRaw, &pr.CategoryID,
		&pr.CreatedAt, &pr.UpdatedAt,
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	if len(affiliateLinksRaw) > 0 {
		_ = json.Unmarshal(affiliateLinksRaw, &pr.AffiliateLinks)
	}
	if pr.AffiliateLinks == nil {
		pr.AffiliateLinks = []AffiliateLink{}
	}

	return &pr, nil
}

// Update modifies an existing product (admin only).
//
//encore:api auth method=PUT path=/products/:id
func Update(ctx context.Context, id int64, p *CreateProductParams) (*Product, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	slug := slugify(p.Name)
	if p.WeightGrams <= 0 && !p.IsDigital {
		p.WeightGrams = 500
	}

	linksJSON, _ := json.Marshal(p.AffiliateLinks)
	if len(p.AffiliateLinks) == 0 {
		linksJSON = []byte("[]")
	}

	var pr Product
	var affiliateLinksRaw []byte
	err = db.QueryRow(ctx, `
		UPDATE products
		SET name = $1, slug = $2, description = $3, price = $4, stock = $5,
		    is_digital = $6, digital_file_url = $7, weight_grams = $8, image_url = $9,
		    video_url = $10, affiliate_links = $11, category_id = $12, updated_at = NOW()
		WHERE id = $13
		RETURNING id, name, slug, description, price, stock, is_digital, digital_file_url, weight_grams, image_url, video_url, affiliate_links, category_id, created_at, updated_at
	`, p.Name, slug, p.Description, p.Price, p.Stock, p.IsDigital, p.DigitalFileURL, p.WeightGrams, p.ImageURL, p.VideoURL, linksJSON, p.CategoryID, id).Scan(
		&pr.ID, &pr.Name, &pr.Slug, &pr.Description, &pr.Price, &pr.Stock,
		&pr.IsDigital, &pr.DigitalFileURL, &pr.WeightGrams, &pr.ImageURL,
		&pr.VideoURL, &affiliateLinksRaw, &pr.CategoryID,
		&pr.CreatedAt, &pr.UpdatedAt,
	)
	if errors.Is(err, sqldb.ErrNoRows) {
		return nil, &errs.Error{Code: errs.NotFound, Message: "Product not found"}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	if len(affiliateLinksRaw) > 0 {
		_ = json.Unmarshal(affiliateLinksRaw, &pr.AffiliateLinks)
	}
	if pr.AffiliateLinks == nil {
		pr.AffiliateLinks = []AffiliateLink{}
	}

	return &pr, nil
}

type SetStockParams struct {
	Stock int `json:"stock"`
}

// SetStock sets product stock level directly (admin only).
//
//encore:api auth method=POST path=/products/:id/stock
func SetStock(ctx context.Context, id int64, p *SetStockParams) error {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}
	if p.Stock < 0 {
		return &errs.Error{Code: errs.InvalidArgument, Message: "Stock cannot be negative"}
	}

	res, err := db.Exec(ctx, `UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2`, p.Stock, id)
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	if res.RowsAffected() == 0 {
		return &errs.Error{Code: errs.NotFound, Message: "Product not found"}
	}
	return nil
}

type ProductStatsResponse struct {
	TotalProducts   int64 `json:"total_products"`
	OutOfStockCount int64 `json:"out_of_stock_count"`
	LowStockCount   int64 `json:"low_stock_count"`
	DigitalCount    int64 `json:"digital_count"`
	PhysicalCount   int64 `json:"physical_count"`
}

// Stats returns product inventory summary stats.
//
//encore:api public method=GET path=/admin/product-stats
func Stats(ctx context.Context) (*ProductStatsResponse, error) {
	var s ProductStatsResponse
	row := db.QueryRow(ctx, `
		SELECT 
			COUNT(*),
			COUNT(*) FILTER (WHERE stock = 0 AND is_digital = FALSE),
			COUNT(*) FILTER (WHERE stock > 0 AND stock <= 5 AND is_digital = FALSE),
			COUNT(*) FILTER (WHERE is_digital = TRUE),
			COUNT(*) FILTER (WHERE is_digital = FALSE)
		FROM products
	`)
	if err := row.Scan(&s.TotalProducts, &s.OutOfStockCount, &s.LowStockCount, &s.DigitalCount, &s.PhysicalCount); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	return &s, nil
}

// Delete removes a product by ID (admin only).
//
//encore:api auth method=DELETE path=/products/:id
func Delete(ctx context.Context, id int64) error {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	_, err = db.Exec(ctx, `DELETE FROM products WHERE id = $1`, id)
	return err
}

// AdjustStock adjusts product stock level (can be negative to decrease or positive to restore).
func AdjustStock(ctx context.Context, productID int64, delta int) error {
	res, err := db.Exec(ctx, `
		UPDATE products 
		SET stock = stock + $1, updated_at = NOW()
		WHERE id = $2 AND (stock + $1 >= 0 OR is_digital = TRUE)
	`, delta, productID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return errors.New("insufficient stock or product not found")
	}
	return nil
}

func slugify(s string) string {
	s = strings.ToLower(s)
	reg := regexp.MustCompile("[^a-z0-9]+")
	s = reg.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = fmt.Sprintf("product-%d", time.Now().Unix())
	}
	return s
}

type UploadImageParams struct {
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	Data        string `json:"data"` // base64 string
}

type UploadImageResponse struct {
	URL      string `json:"url"`
	FileName string `json:"file_name"`
}

// ValidateAndSanitizeImage checks file size, magic bytes, and image decode integrity.
// Strictly whitelists JPEG, PNG, WebP, and GIF. Returns real MIME type and safe extension.
func ValidateAndSanitizeImage(decoded []byte, maxBytes int) (string, string, error) {
	if len(decoded) < 100 {
		return "", "", &errs.Error{Code: errs.InvalidArgument, Message: "Ukuran file terlalu kecil atau kosong (minimal 100 bytes)"}
	}
	if len(decoded) > maxBytes {
		return "", "", &errs.Error{
			Code:    errs.InvalidArgument,
			Message: fmt.Sprintf("Ukuran file (%d KB) melebihi batas maksimal %d MB", len(decoded)/1024, maxBytes/(1024*1024)),
		}
	}

	// Sniff magic bytes using http.DetectContentType
	detectedMime := http.DetectContentType(decoded)
	var safeExt string

	switch detectedMime {
	case "image/jpeg":
		safeExt = ".jpg"
	case "image/png":
		safeExt = ".png"
	case "image/webp":
		safeExt = ".webp"
	case "image/gif":
		safeExt = ".gif"
	default:
		return "", "", &errs.Error{
			Code:    errs.InvalidArgument,
			Message: fmt.Sprintf("Format file tidak diizinkan (%s). Hanya file gambar asli (JPEG, PNG, WebP, GIF) yang diperbolehkan demi keamanan.", detectedMime),
		}
	}

	// Deep image structure verification
	if detectedMime == "image/webp" {
		if len(decoded) < 12 || !bytes.Equal(decoded[0:4], []byte("RIFF")) || !bytes.Equal(decoded[8:12], []byte("WEBP")) {
			return "", "", &errs.Error{Code: errs.InvalidArgument, Message: "Header WebP tidak valid atau rusak"}
		}
	} else {
		// For JPEG, PNG, GIF, verify with standard image decoder
		_, _, err := image.DecodeConfig(bytes.NewReader(decoded))
		if err != nil {
			return "", "", &errs.Error{
				Code:    errs.InvalidArgument,
				Message: fmt.Sprintf("Struktur file gambar tidak valid atau rusak: %v", err),
			}
		}
	}

	return detectedMime, safeExt, nil
}

// UploadProductImage uploads an image to the product-images bucket (admin only).
//
//encore:api auth method=POST path=/upload/image
func UploadProductImage(ctx context.Context, p *UploadImageParams) (*UploadImageResponse, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	if p.Data == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Image data is required"}
	}

	// Strip data URL prefix if present (e.g. data:image/png;base64,...)
	data := p.Data
	if idx := strings.Index(data, ","); idx != -1 {
		data = data[idx+1:]
	}

	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Invalid base64 image data"}
	}

	// Strict security validation: magic bytes sniffing, decode verification, max 10MB
	realMime, safeExt, err := ValidateAndSanitizeImage(decoded, 10*1024*1024)
	if err != nil {
		return nil, err
	}

	rawBase := filepath.Base(filepath.Clean(p.FileName))
	if rawBase == "." || rawBase == "/" {
		rawBase = "product"
	}
	cleanBase := slugify(strings.TrimSuffix(rawBase, filepath.Ext(rawBase)))
	if cleanBase == "" {
		cleanBase = "product"
	}
	objectName := fmt.Sprintf("%s-%d%s", cleanBase, time.Now().UnixNano()/1e6, safeExt)

	writer := ProductImages.Upload(ctx, objectName, objects.WithUploadAttrs(objects.UploadAttrs{
		ContentType: realMime,
	}))
	if _, err := writer.Write(decoded); err != nil {
		writer.Abort(err)
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("failed to write to bucket: %v", err)}
	}
	if err := writer.Close(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("failed to finalize upload: %v", err)}
	}

	imageURL := fmt.Sprintf("/images/%s", objectName)
	if pub := ProductImages.PublicURL(objectName); pub != nil && pub.String() != "" {
		imageURL = pub.String()
	}

	return &UploadImageResponse{
		URL:      imageURL,
		FileName: objectName,
	}, nil
}

// ServeProductImage serves an image stored in the product-images bucket with strict security headers.
//
//encore:api public raw method=GET path=/images/:name
func ServeProductImage(w http.ResponseWriter, req *http.Request) {
	name := filepath.Base(filepath.Clean(req.URL.Path))
	if name == "" || name == "." || name == "/" {
		http.Error(w, "Image name required", http.StatusBadRequest)
		return
	}

	ctx := req.Context()
	reader := ProductImages.Download(ctx, name)
	defer reader.Close()

	attrs, err := ProductImages.Attrs(ctx, name)
	if err == nil && attrs.ContentType != "" {
		w.Header().Set("Content-Type", attrs.ContentType)
	} else {
		w.Header().Set("Content-Type", "image/jpeg")
	}

	// Security Headers to prevent MIME confusion, XSS, and clickjacking
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	_, _ = io.Copy(w, reader)
}

type UploadVideoParams struct {
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	Data        string `json:"data"` // base64 string
}

type UploadVideoResponse struct {
	URL      string `json:"url"`
	FileName string `json:"file_name"`
}

// UploadProductVideo uploads a video to the product-videos bucket (admin only).
//
//encore:api auth method=POST path=/upload/video
func UploadProductVideo(ctx context.Context, p *UploadVideoParams) (*UploadVideoResponse, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	if p.Data == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Video data is required"}
	}

	data := p.Data
	if idx := strings.Index(data, ","); idx != -1 {
		data = data[idx+1:]
	}

	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Invalid base64 video data"}
	}

	// Max 50MB
	if len(decoded) > 50*1024*1024 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Ukuran file video maksimal 50MB"}
	}

	detectedMime := http.DetectContentType(decoded)
	safeExt := ".mp4"
	switch {
	case strings.Contains(detectedMime, "mp4") || strings.HasSuffix(strings.ToLower(p.FileName), ".mp4"):
		safeExt = ".mp4"
		detectedMime = "video/mp4"
	case strings.Contains(detectedMime, "webm") || strings.HasSuffix(strings.ToLower(p.FileName), ".webm"):
		safeExt = ".webm"
		detectedMime = "video/webm"
	case strings.Contains(detectedMime, "ogg") || strings.HasSuffix(strings.ToLower(p.FileName), ".ogv"):
		safeExt = ".ogv"
		detectedMime = "video/ogg"
	case strings.HasSuffix(strings.ToLower(p.FileName), ".mov"):
		safeExt = ".mov"
		detectedMime = "video/quicktime"
	default:
		if strings.HasPrefix(p.ContentType, "video/") {
			detectedMime = p.ContentType
			ext := filepath.Ext(p.FileName)
			if ext != "" {
				safeExt = ext
			}
		} else {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Format video harus berupa MP4, WebM, OGG, atau MOV"}
		}
	}

	rawBase := filepath.Base(filepath.Clean(p.FileName))
	cleanBase := slugify(strings.TrimSuffix(rawBase, filepath.Ext(rawBase)))
	if cleanBase == "" {
		cleanBase = "video"
	}
	objectName := fmt.Sprintf("%s-%d%s", cleanBase, time.Now().UnixNano()/1e6, safeExt)

	writer := ProductVideos.Upload(ctx, objectName, objects.WithUploadAttrs(objects.UploadAttrs{
		ContentType: detectedMime,
	}))
	if _, err := writer.Write(decoded); err != nil {
		writer.Abort(err)
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("failed to write video to bucket: %v", err)}
	}
	if err := writer.Close(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("failed to finalize video upload: %v", err)}
	}

	videoURL := fmt.Sprintf("/videos/%s", objectName)
	if pub := ProductVideos.PublicURL(objectName); pub != nil && pub.String() != "" {
		videoURL = pub.String()
	}

	return &UploadVideoResponse{
		URL:      videoURL,
		FileName: objectName,
	}, nil
}

// ServeProductVideo serves video stored in the product-videos bucket with streaming range support.
//
//encore:api public raw method=GET path=/videos/:name
func ServeProductVideo(w http.ResponseWriter, req *http.Request) {
	name := filepath.Base(filepath.Clean(req.URL.Path))
	if name == "" || name == "." || name == "/" {
		http.Error(w, "Video name required", http.StatusBadRequest)
		return
	}

	ctx := req.Context()
	reader := ProductVideos.Download(ctx, name)
	defer reader.Close()

	attrs, err := ProductVideos.Attrs(ctx, name)
	if err == nil && attrs.ContentType != "" {
		w.Header().Set("Content-Type", attrs.ContentType)
	} else {
		w.Header().Set("Content-Type", "video/mp4")
	}

	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	_, _ = io.Copy(w, reader)
}

type StoreSettings struct {
	StoreName         string `json:"store_name"`
	StoreTagline      string `json:"store_tagline"`
	StoreLogoURL      string `json:"store_logo_url"`
	StoreBadge        string `json:"store_badge"`
	StorePhone        string `json:"store_phone"`
	StoreAddress      string `json:"store_address"`
	StoreAnnouncement string `json:"store_announcement"`
}

// GetStoreSettings returns the public store profile and branding configuration.
//
//encore:api public method=GET path=/store/settings
func GetStoreSettings(ctx context.Context) (*StoreSettings, error) {
	s := StoreSettings{
		StoreName:         "SUPATMAN STORE",
		StoreTagline:      "Hardware Setup & Digital Atelier",
		StoreBadge:        "OFFICIAL",
		StorePhone:        "08123456789",
		StoreAddress:      "Jl. Merdeka No. 45, Bandung, Jawa Barat",
		StoreAnnouncement: "Pengiriman Kilat Pulau Jawa & Akses Unduhan Instan Seluruh Aset Digital",
	}

	rows, err := db.Query(ctx, `SELECT key, value FROM store_settings`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				switch k {
				case "store_name":
					if v != "" {
						s.StoreName = v
					}
				case "store_tagline":
					s.StoreTagline = v
				case "store_logo_url":
					s.StoreLogoURL = v
				case "store_badge":
					if v != "" {
						s.StoreBadge = v
					}
				case "store_phone":
					s.StorePhone = v
				case "store_address":
					s.StoreAddress = v
				case "store_announcement":
					s.StoreAnnouncement = v
				}
			}
		}
	}

	return &s, nil
}

// UpdateStoreSettings updates store profile and branding configuration (admin only).
//
//encore:api auth method=POST path=/store/settings
func UpdateStoreSettings(ctx context.Context, p *StoreSettings) (*StoreSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	configs := map[string]string{
		"store_name":         strings.TrimSpace(p.StoreName),
		"store_tagline":      strings.TrimSpace(p.StoreTagline),
		"store_logo_url":     strings.TrimSpace(p.StoreLogoURL),
		"store_badge":        strings.TrimSpace(p.StoreBadge),
		"store_phone":        strings.TrimSpace(p.StorePhone),
		"store_address":      strings.TrimSpace(p.StoreAddress),
		"store_announcement": strings.TrimSpace(p.StoreAnnouncement),
	}

	if configs["store_name"] == "" {
		configs["store_name"] = "SUPATMAN STORE"
	}
	if configs["store_badge"] == "" {
		configs["store_badge"] = "OFFICIAL"
	}

	for k, v := range configs {
		_, err := db.Exec(ctx, `
			INSERT INTO store_settings (key, value, updated_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
		`, k, v)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
	}

	return p, nil
}
