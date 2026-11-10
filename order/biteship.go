package order

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"encore.app/auth"
	"encore.app/product"

	"encore.dev/beta/errs"
	"encore.dev/rlog"
)

type BiteshipSettings struct {
	APIKey           string `json:"biteship_api_key"`
	OriginPostalCode string `json:"biteship_origin_postal_code"`
	OriginAddress    string `json:"biteship_origin_address"`
	Couriers         string `json:"biteship_couriers"`
	Enabled          bool   `json:"biteship_enabled"`
	DefaultFlatCost  int64  `json:"default_flat_shipping_cost"`
}

type TestBiteshipResponse struct {
	Success       bool   `json:"success"`
	Message       string `json:"message"`
	CouriersCount int    `json:"couriers_count,omitempty"`
}

type RateCartItem struct {
	ProductID   int64  `json:"product_id"`
	Quantity    int    `json:"quantity"`
	WeightGrams int    `json:"weight_grams,omitempty"`
	Price       int64  `json:"price,omitempty"`
	Name        string `json:"name,omitempty"`
}

type GetRatesParams struct {
	DestinationPostalCode string          `json:"destination_postal_code"`
	Items                 []*RateCartItem `json:"items"`
}

type CourierRateOption struct {
	CourierName           string `json:"courier_name"`              // e.g. "JNE"
	CourierCode           string `json:"courier_code"`              // e.g. "jne"
	CourierServiceName    string `json:"courier_service_name"`      // e.g. "Reguler"
	CourierServiceCode    string `json:"courier_service_code"`      // e.g. "reg"
	Description           string `json:"description"`               // e.g. "Layanan reguler pengiriman"
	Duration              string `json:"duration"`                  // e.g. "1 - 2 Hari"
	ShipmentDurationRange string `json:"shipment_duration_range"`  // e.g. "1 - 2"
	ShipmentDurationUnit  string `json:"shipment_duration_unit"`   // e.g. "days"
	Price                 int64  `json:"price"`                     // Integer IDR
	IsFallback            bool   `json:"is_fallback"`
}

type GetRatesResponse struct {
	Success    bool                 `json:"success"`
	Origin     string               `json:"origin"`
	Rates      []*CourierRateOption `json:"rates"`
	IsFallback bool                 `json:"is_fallback"`
	Message    string               `json:"message,omitempty"`
}

// loadBiteshipSettings reads shipping settings from DB with robust defaults
func loadBiteshipSettings(ctx context.Context) BiteshipSettings {
	s := BiteshipSettings{
		APIKey:           "",
		OriginPostalCode: "40115",
		OriginAddress:    "Jl. Merdeka No. 45, Bandung, Jawa Barat",
		Couriers:         "jne,sicepat,anteraja,jnt",
		Enabled:          false,
		DefaultFlatCost:  15000,
	}

	rows, err := db.Query(ctx, `SELECT key, value FROM shipping_settings`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				switch k {
				case "biteship_api_key":
					s.APIKey = strings.TrimSpace(v)
				case "biteship_origin_postal_code":
					if strings.TrimSpace(v) != "" {
						s.OriginPostalCode = strings.TrimSpace(v)
					}
				case "biteship_origin_address":
					if strings.TrimSpace(v) != "" {
						s.OriginAddress = strings.TrimSpace(v)
					}
				case "biteship_couriers":
					if strings.TrimSpace(v) != "" {
						s.Couriers = strings.TrimSpace(v)
					}
				case "biteship_enabled":
					s.Enabled = strings.ToLower(strings.TrimSpace(v)) == "true"
				case "default_flat_shipping_cost":
					if val, parseErr := strconv.ParseInt(strings.TrimSpace(v), 10, 64); parseErr == nil && val >= 0 {
						s.DefaultFlatCost = val
					}
				}
			}
		}
	}

	return s
}

// GetShippingSettings returns current Biteship and shipping configuration (admin only).
//
//encore:api auth method=GET path=/shipping/settings
func GetShippingSettings(ctx context.Context) (*BiteshipSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	s := loadBiteshipSettings(ctx)
	return &s, nil
}

// UpdateShippingSettings updates Biteship and shipping configuration (admin only).
//
//encore:api auth method=POST path=/shipping/settings
func UpdateShippingSettings(ctx context.Context, p *BiteshipSettings) (*BiteshipSettings, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	if p.OriginPostalCode == "" {
		p.OriginPostalCode = "40115"
	}
	if p.Couriers == "" {
		p.Couriers = "jne,sicepat,anteraja,jnt"
	}
	if p.DefaultFlatCost <= 0 {
		p.DefaultFlatCost = 15000
	}

	enabledStr := "false"
	if p.Enabled {
		enabledStr = "true"
	}

	configs := map[string]string{
		"biteship_api_key":            strings.TrimSpace(p.APIKey),
		"biteship_origin_postal_code": strings.TrimSpace(p.OriginPostalCode),
		"biteship_origin_address":     strings.TrimSpace(p.OriginAddress),
		"biteship_couriers":           strings.TrimSpace(p.Couriers),
		"biteship_enabled":            enabledStr,
		"default_flat_shipping_cost":  strconv.FormatInt(p.DefaultFlatCost, 10),
	}

	for k, v := range configs {
		_, err := db.Exec(ctx, `
			INSERT INTO shipping_settings (key, value, updated_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
		`, k, v)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("Failed to save %s: %s", k, err.Error())}
		}
	}

	res := loadBiteshipSettings(ctx)
	return &res, nil
}

// TestBiteshipConnection verifies Biteship API key by querying /v1/couriers (admin only).
//
//encore:api auth method=POST path=/shipping/biteship/test
func TestBiteshipConnection(ctx context.Context) (*TestBiteshipResponse, error) {
	usr, err := auth.Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	settings := loadBiteshipSettings(ctx)
	apiKey := strings.TrimSpace(settings.APIKey)
	if apiKey == "" {
		return &TestBiteshipResponse{
			Success: false,
			Message: "Biteship API Key belum diisi. Masukkan API Key terlebih dahulu.",
		}, nil
	}

	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.biteship.com/v1/couriers", nil)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return &TestBiteshipResponse{
			Success: false,
			Message: fmt.Sprintf("Gagal terhubung ke API Biteship: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		var errData map[string]interface{}
		_ = json.Unmarshal(bodyBytes, &errData)
		errMsg := string(bodyBytes)
		if m, ok := errData["error"].(string); ok && m != "" {
			errMsg = m
		}
		return &TestBiteshipResponse{
			Success: false,
			Message: fmt.Sprintf("Biteship mengembalikan HTTP %d: %s", resp.StatusCode, errMsg),
		}, nil
	}

	var data struct {
		Success  bool          `json:"success"`
		Couriers []interface{} `json:"couriers"`
	}
	_ = json.Unmarshal(bodyBytes, &data)

	return &TestBiteshipResponse{
		Success:       true,
		Message:       fmt.Sprintf("Koneksi berhasil! Terhubung dengan %d kurir Biteship.", len(data.Couriers)),
		CouriersCount: len(data.Couriers),
	}, nil
}

// GetShippingRates queries real-time shipping options from Biteship, or returns fallback.
//
//encore:api public method=POST path=/shipping/rates
func GetShippingRates(ctx context.Context, p *GetRatesParams) (*GetRatesResponse, error) {
	settings := loadBiteshipSettings(ctx)

	fallbackOption := &CourierRateOption{
		CourierName:           "Kurir Standar Toko",
		CourierCode:           "standard",
		CourierServiceName:    "Reguler",
		CourierServiceCode:    "reg",
		Description:           "Pengiriman standar ekspedisi ke seluruh Indonesia",
		Duration:              "2 - 3 Hari",
		ShipmentDurationRange: "2 - 3",
		ShipmentDurationUnit:  "days",
		Price:                 settings.DefaultFlatCost,
		IsFallback:            true,
	}

	destPostalClean := strings.TrimSpace(p.DestinationPostalCode)
	// If no postal code or empty items, return fallback immediately
	if destPostalClean == "" || len(p.Items) == 0 {
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Masukkan kode pos tujuan untuk melihat tarif akurat",
		}, nil
	}

	// If Biteship is not enabled or API key is not configured, return fallback
	if !settings.Enabled || settings.APIKey == "" {
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Menggunakan tarif pengiriman standar",
		}, nil
	}

	// Prepare items for Biteship
	type biteshipItem struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Value       int64  `json:"value"`
		Weight      int    `json:"weight"` // in grams
		Quantity    int    `json:"quantity"`
	}

	var bItems []biteshipItem
	var hasPhysical bool

	for _, it := range p.Items {
		if it.Quantity <= 0 {
			it.Quantity = 1
		}

		prName := it.Name
		prWeight := it.WeightGrams
		prPrice := it.Price

		// If product details not complete, look up in product service
		if it.ProductID > 0 && (prWeight == 0 || prName == "" || prPrice == 0) {
			pr, err := product.Get(ctx, strconv.FormatInt(it.ProductID, 10))
			if err == nil && pr != nil {
				if pr.IsDigital {
					continue // skip digital products in shipment calculation
				}
				hasPhysical = true
				if prName == "" {
					prName = pr.Name
				}
				if prPrice == 0 {
					prPrice = pr.Price
				}
				if prWeight == 0 {
					prWeight = pr.WeightGrams
				}
			}
		} else {
			hasPhysical = true
		}

		if prWeight <= 0 {
			prWeight = 500 // default 500g per physical item
		}
		if prPrice <= 0 {
			prPrice = 10000
		}
		if prName == "" {
			prName = "Produk"
		}

		bItems = append(bItems, biteshipItem{
			Name:        prName,
			Description: prName,
			Value:       prPrice,
			Weight:      prWeight,
			Quantity:    it.Quantity,
		})
	}

	// If order has no physical items, rate is 0
	if !hasPhysical || len(bItems) == 0 {
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{},
			IsFallback: false,
			Message:    "Produk digital tidak memerlukan pengiriman",
		}, nil
	}

	// Parse origin and destination postal codes (integers)
	destPostalInt, err := strconv.Atoi(destPostalClean)
	if err != nil {
		// Non-numeric postal code, return fallback
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Format kode pos tidak valid",
		}, nil
	}

	originPostalInt, err := strconv.Atoi(settings.OriginPostalCode)
	if err != nil {
		originPostalInt = 40115
	}

	couriersParam := settings.Couriers
	if couriersParam == "" {
		couriersParam = "jne,sicepat,anteraja,jnt"
	}

	biteshipReqPayload := map[string]interface{}{
		"origin_postal_code":      originPostalInt,
		"destination_postal_code": destPostalInt,
		"couriers":                couriersParam,
		"items":                   bItems,
	}

	reqBytes, _ := json.Marshal(biteshipReqPayload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.biteship.com/v1/rates/couriers", bytes.NewBuffer(reqBytes))
	if err != nil {
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Fallback ke tarif standar",
		}, nil
	}

	httpReq.Header.Set("Authorization", "Bearer "+settings.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 9 * time.Second}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		rlog.Warn("failed to call biteship rates API", "error", err)
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Koneksi biteship timeout, menggunakan tarif standar",
		}, nil
	}
	defer httpResp.Body.Close()

	respBytes, _ := io.ReadAll(httpResp.Body)
	if httpResp.StatusCode != http.StatusOK {
		rlog.Warn("biteship returned non-200", "status", httpResp.StatusCode, "body", string(respBytes))
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Tarif kurir otomatis tidak tersedia, menggunakan tarif standar",
		}, nil
	}

	var biteshipResp struct {
		Success bool `json:"success"`
		Pricing []struct {
			CourierName           string `json:"courier_name"`
			CourierCode           string `json:"courier_code"`
			CourierServiceName    string `json:"courier_service_name"`
			CourierServiceCode    string `json:"courier_service_code"`
			Description           string `json:"description"`
			Duration              string `json:"duration"`
			ShipmentDurationRange string `json:"shipment_duration_range"`
			ShipmentDurationUnit  string `json:"shipment_duration_unit"`
			Price                 int64  `json:"price"`
		} `json:"pricing"`
	}

	if err := json.Unmarshal(respBytes, &biteshipResp); err != nil || len(biteshipResp.Pricing) == 0 {
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Tidak ditemukan rute pengiriman, menggunakan tarif standar",
		}, nil
	}

	var options []*CourierRateOption
	for _, p := range biteshipResp.Pricing {
		if p.Price <= 0 {
			continue
		}
		durationStr := p.Duration
		if durationStr == "" && p.ShipmentDurationRange != "" {
			durationStr = p.ShipmentDurationRange + " Hari"
		}

		options = append(options, &CourierRateOption{
			CourierName:           strings.ToUpper(p.CourierName),
			CourierCode:           p.CourierCode,
			CourierServiceName:    p.CourierServiceName,
			CourierServiceCode:    p.CourierServiceCode,
			Description:           p.Description,
			Duration:              durationStr,
			ShipmentDurationRange: p.ShipmentDurationRange,
			ShipmentDurationUnit:  p.ShipmentDurationUnit,
			Price:                 p.Price,
			IsFallback:            false,
		})
	}

	if len(options) == 0 {
		return &GetRatesResponse{
			Success:    true,
			Origin:     settings.OriginPostalCode,
			Rates:      []*CourierRateOption{fallbackOption},
			IsFallback: true,
			Message:    "Tidak ada kurir yang tersedia untuk rute ini",
		}, nil
	}

	// Sort cheapest first
	sort.Slice(options, func(i, j int) bool {
		return options[i].Price < options[j].Price
	})

	return &GetRatesResponse{
		Success:    true,
		Origin:     settings.OriginPostalCode,
		Rates:      options,
		IsFallback: false,
	}, nil
}
