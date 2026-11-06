"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { computeMargin } from "@/lib/pdp/margin";
import { useCountryPreferences } from "@/components/country-preferences";

type Props = { unitPrice: number; minOrderQty: number; onClose: () => void };

export function MarginCalculator({ unitPrice, minOrderQty, onClose }: Props) {
  const id = useId();
  const { formatPrice, tr } = useCountryPreferences();
  const [values, setValues] = useState({ unitPrice: String(unitPrice), quantity: String(Math.max(minOrderQty, 50)), shippingTotal: "15000", marginPercent: "35" });
  const result = computeMargin({ unitPrice: Number(values.unitPrice), quantity: Number(values.quantity), shippingTotal: Number(values.shippingTotal), marginPercent: Number(values.marginPercent) });
  const field = (key: keyof typeof values, label: string, suffix: string, max?: number) => <div className="pd-calc-field">
    <label htmlFor={`${id}-${key}`}>{label}</label>
    <div><input id={`${id}-${key}`} type="number" inputMode="decimal" min={0} max={max} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}/><span>{suffix}</span></div>
  </div>;

  return <section className="pd-calc" aria-labelledby={`${id}-title`}>
    <header><h3 id={`${id}-title`}>{tr("Calculateur de coût et de marge")}</h3><button type="button" onClick={onClose} aria-label={tr("Fermer le calculateur")}><X size={18} strokeWidth={1.5}/></button></header>
    <div className="pd-calc-grid">
      {field("unitPrice", tr("Prix d'achat unitaire"), "FCFA")}
      {field("quantity", tr("Quantité"), tr("pièces"))}
      {field("shippingTotal", tr("Frais de livraison (total)"), "FCFA")}
      {field("marginPercent", tr("Marge souhaitée"), "%", 95)}
    </div>
    <dl className="pd-calc-result" aria-live="polite">
      <div><dt>{tr("Coût de revient unitaire")}</dt><dd>{formatPrice(result.unitCost)}</dd></div>
      <div><dt>{tr("Investissement total")}</dt><dd>{formatPrice(result.totalCost)}</dd></div>
      <div className="is-key"><dt>{tr("Prix de revente suggéré")}</dt><dd>{formatPrice(result.suggestedPrice)}</dd></div>
      <div><dt>{tr("Bénéfice estimé ({n} pièces)", { n: values.quantity || 0 })}</dt><dd>{formatPrice(result.totalProfit)}</dd></div>
    </dl>
    <p className="pd-calc-note">{tr("Estimation hors taxes et frais de douane. La marge est calculée sur le prix de revente.")}</p>
  </section>;
}
