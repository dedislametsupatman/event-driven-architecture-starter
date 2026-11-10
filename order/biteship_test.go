package order

import (
	"context"
	"testing"
)

func TestGetShippingRates_FallbackWhenDisabled(t *testing.T) {
	ctx := context.Background()

	resp, err := GetShippingRates(ctx, &GetRatesParams{
		DestinationPostalCode: "12240",
		Items: []*RateCartItem{
			{
				ProductID:   1,
				Quantity:    1,
				WeightGrams: 500,
				Price:       50000,
				Name:        "Produk Fisik Test",
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !resp.Success {
		t.Errorf("expected resp.Success to be true, got false")
	}

	if len(resp.Rates) == 0 {
		t.Fatalf("expected at least 1 rate (fallback), got 0")
	}

	first := resp.Rates[0]
	if first.Price <= 0 {
		t.Errorf("expected valid positive price, got %d", first.Price)
	}
}

func TestGetShippingRates_EmptyPostalCode(t *testing.T) {
	ctx := context.Background()

	resp, err := GetShippingRates(ctx, &GetRatesParams{
		DestinationPostalCode: "",
		Items: []*RateCartItem{
			{
				ProductID:   1,
				Quantity:    1,
				WeightGrams: 500,
				Price:       50000,
				Name:        "Produk Fisik Test",
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !resp.IsFallback {
		t.Errorf("expected IsFallback to be true for empty postal code")
	}
}
