"use client";

import type { DetailedProduct, PriceTier } from "@/lib/product";
import { useCountryPreferences } from "@/components/country-preferences";

export function PriceTiers({ product, selectedTier, onQuantityChange, compact = false }: { product: DetailedProduct; selectedTier: PriceTier; onQuantityChange: (quantity: number) => void; compact?: boolean }) {
  const { formatPrice } = useCountryPreferences();
  return <div className={`pdp-price-tiers ${compact ? "is-compact" : ""}`} aria-label="Prix dégressifs selon la quantité">
    {product.tiers.map((tier) => {
      const active = selectedTier === tier;
      return <button key={tier.minQuantity} type="button" className={`pdp-price-tier ${active ? "is-active" : ""}`} onClick={() => onQuantityChange(tier.minQuantity)} aria-pressed={active}>
        <strong>{formatPrice(tier.unitPriceXof)}</strong><span>{tier.label}</span>
      </button>;
    })}
  </div>;
}
