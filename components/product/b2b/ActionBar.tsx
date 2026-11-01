"use client";

import { Minus, Plus } from "lucide-react";
import { formatXof, tierForQuantity } from "./format";
import type { PriceTier } from "@/lib/product-detail-data";

/**
 * Sélecteur de quantité + boutons d'action.
 *
 * Bornes strictes : jamais sous le MOQ, jamais au-dessus du stock disponible.
 * Le total estimé = prix du palier × quantité (+ port si fourni) : il est
 * recalculé ici à chaque frappe, sans attendre le serveur, pour que l'acheteur
 * voie immédiatement l'effet d'un palier.
 */
export function ActionBar({
  minimumQuantity,
  stock,
  tiers,
  quantity,
  onQuantityChange,
  shippingXof,
  onOrder,
  onAddToCart,
  onChat,
  submitting = false,
  layout = "panel",
}: {
  minimumQuantity: number;
  stock: number;
  tiers: PriceTier[];
  quantity: number;
  onQuantityChange: (value: number) => void;
  shippingXof: number | null;
  onOrder: () => void;
  onAddToCart: () => void;
  onChat: () => void;
  submitting?: boolean;
  layout?: "panel" | "mobile";
}) {
  const maximum = stock > 0 ? stock : Number.MAX_SAFE_INTEGER;
  const tier = tierForQuantity(tiers, quantity);
  const unitPrice = tier?.unitPriceXof ?? 0;
  const total = unitPrice * quantity + (shippingXof ?? 0);

  const clamp = (value: number) => Math.min(maximum, Math.max(minimumQuantity, Math.trunc(value) || minimumQuantity));

  return <div className={`b2b-actionbar b2b-actionbar-${layout}`}>
    <div className="b2b-quantity">
      <span className="b2b-quantity-label">Quantité</span>
      <div className="b2b-stepper">
        <button type="button" aria-label="Diminuer la quantité" disabled={quantity <= minimumQuantity} onClick={() => onQuantityChange(clamp(quantity - 1))}><Minus size={15} /></button>
        <input
          type="number"
          aria-label="Quantité souhaitée"
          value={quantity}
          min={minimumQuantity}
          max={stock > 0 ? stock : undefined}
          onChange={(event) => onQuantityChange(clamp(Number(event.target.value)))}
        />
        <button type="button" aria-label="Augmenter la quantité" disabled={quantity >= maximum} onClick={() => onQuantityChange(clamp(quantity + 1))}><Plus size={15} /></button>
      </div>
    </div>

    <p className="b2b-quantity-hint">
      Minimum {minimumQuantity} pièce{minimumQuantity > 1 ? "s" : ""}
      {stock > 0 ? ` · ${stock} disponible${stock > 1 ? "s" : ""}` : " · stock à confirmer"}
    </p>

    <p className="b2b-total">
      Total estimé <b>{formatXof(total)}</b>
      {shippingXof !== null && <small>dont {formatXof(shippingXof)} de port</small>}
    </p>

    <button type="button" className="b2b-btn-primary" onClick={onOrder} disabled={submitting}>
      {submitting ? "Traitement…" : "Commander"}
    </button>
    <div className="b2b-actionbar-row">
      <button type="button" className="b2b-btn-outline" onClick={onAddToCart} disabled={submitting}>Ajouter au panier</button>
      <button type="button" className="b2b-btn-outline" onClick={onChat}>Discuter ici</button>
    </div>
  </div>;
}
