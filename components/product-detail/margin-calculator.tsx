"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { computeMargin } from "@/lib/pdp/margin";
import { useCountryPreferences } from "@/components/country-preferences";

type Props = { unitPrice: number; minOrderQty: number; onClose: () => void };

export function MarginCalculator({ unitPrice, minOrderQty, onClose }: Props) {
  const id = useId();
  const { formatPrice } = useCountryPreferences();
  const [values, setValues] = useState({ unitPrice: String(unitPrice), quantity: String(Math.max(minOrderQty, 50)), shippingTotal: "15000", marginPercent: "35" });
  const result = computeMargin({ unitPrice: Number(values.unitPrice), quantity: Number(values.quantity), shippingTotal: Number(values.shippingTotal), marginPercent: Number(values.marginPercent) });
  const field = (key: keyof typeof values, label: string, suffix: string, max?: number) => <div className="pd-calc-field">
    <label htmlFor={`${id}-${key}`}>{label}</label>
    <div><input id={`${id}-${key}`} type="number" inputMode="decimal" min={0} max={max} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}/><span>{suffix}</span></div>
  </div>;

  return <section className="pd-calc" aria-labelledby={`${id}-title`}>
    <header><h3 id={`${id}-title`}>Calculateur de coût et de marge</h3><button type="button" onClick={onClose} aria-label="Fermer le calculateur"><X size={18} strokeWidth={1.5}/></button></header>
    <div className="pd-calc-grid">
      {field("unitPrice", "Prix d'achat unitaire", "FCFA")}
      {field("quantity", "Quantité", "pièces")}
      {field("shippingTotal", "Frais de livraison (total)", "FCFA")}
      {field("marginPercent", "Marge souhaitée", "%", 95)}
    </div>
    <dl className="pd-calc-result" aria-live="polite">
      <div><dt>Coût de revient unitaire</dt><dd>{formatPrice(result.unitCost)}</dd></div>
      <div><dt>Investissement total</dt><dd>{formatPrice(result.totalCost)}</dd></div>
      <div className="is-key"><dt>Prix de revente suggéré</dt><dd>{formatPrice(result.suggestedPrice)}</dd></div>
      <div><dt>Bénéfice estimé ({values.quantity || 0} pièces)</dt><dd>{formatPrice(result.totalProfit)}</dd></div>
    </dl>
    <p className="pd-calc-note">Estimation hors taxes et frais de douane. La marge est calculée sur le prix de revente.</p>
  </section>;
}
