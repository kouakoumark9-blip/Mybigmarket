"use client";

import { formatTierRange, formatXof, tierForQuantity } from "./format";
import type { PriceTier } from "@/lib/product-detail-data";

/**
 * Grille de prix dégressifs.
 *
 * Le nombre de paliers vient de la base (1 à 6) : la grille s'adapte au lieu de
 * réserver 4 cases fixes. Le palier correspondant à la quantité en cours est
 * mis en évidence, sinon un client ne comprend pas le prix qu'on lui applique.
 */
export function PriceTiers({ tiers, quantity, compact = false }: { tiers: PriceTier[]; quantity: number; compact?: boolean }) {
  if (tiers.length === 0) return null;
  const active = tierForQuantity(tiers, quantity);

  if (compact) {
    return <ul className="b2b-price-list">
      {tiers.map((tier) => <li key={tier.minimumQuantity} className={tier === active ? "is-active" : undefined}>
        <b>{formatXof(tier.unitPriceXof)}</b>
        <span>{formatTierRange(tier.minimumQuantity, tier.maximumQuantity)}</span>
      </li>)}
    </ul>;
  }

  return <div className={`b2b-tiers b2b-tiers-${Math.min(tiers.length, 6)}`} role="list">
    {tiers.map((tier) => <div
      key={tier.minimumQuantity}
      role="listitem"
      className={`b2b-tier${tier === active ? " is-active" : ""}`}
      aria-current={tier === active ? "true" : undefined}
    >
      <b>{formatXof(tier.unitPriceXof)}</b>
      <span>{formatTierRange(tier.minimumQuantity, tier.maximumQuantity)}</span>
    </div>)}
  </div>;
}
