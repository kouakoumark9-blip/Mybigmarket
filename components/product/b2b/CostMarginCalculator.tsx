"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { formatXof } from "./format";

/**
 * Calculateur coût d'arrivée / marge.
 *
 * Volontairement transparent : on n'affiche pas un « coût d'arrivée » magique,
 * mais la somme exacte des postes saisis (achat + transport + douane), puis le
 * bénéfice obtenu avec la marge visée. Les taux par défaut sont des repères
 * modifiables, pas une promesse de prix.
 */
export function CostMarginCalculator({ unitPriceXof }: { unitPriceXof: number }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [shippingPerUnit, setShippingPerUnit] = useState(2500);
  const [customsPercent, setCustomsPercent] = useState(18);
  const [marginPercent, setMarginPercent] = useState(25);

  const totals = useMemo(() => {
    const goods = unitPriceXof * quantity;
    const shipping = shippingPerUnit * quantity;
    const customs = Math.round((goods * customsPercent) / 100);
    const landed = goods + shipping + customs;
    const landedPerUnit = quantity > 0 ? landed / quantity : 0;
    const sellingPerUnit = Math.round(landedPerUnit * (1 + marginPercent / 100));
    return {
      goods,
      shipping,
      customs,
      landed,
      landedPerUnit: Math.round(landedPerUnit),
      sellingPerUnit,
      profit: (sellingPerUnit - Math.round(landedPerUnit)) * quantity,
    };
  }, [unitPriceXof, quantity, shippingPerUnit, customsPercent, marginPercent]);

  return <section className="b2b-margin">
    <button type="button" className="b2b-margin-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      Calculer le coût et la marge
      <ChevronRight size={18} className={open ? "is-open" : undefined} aria-hidden="true" />
    </button>

    {open && <div className="b2b-margin-body">
      <div className="b2b-margin-fields">
        <label>Quantité
          <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <label>Transport / pièce (FCFA)
          <input type="number" min={0} step={100} value={shippingPerUnit} onChange={(event) => setShippingPerUnit(Math.max(0, Number(event.target.value) || 0))} />
        </label>
        <label>Douane (%)
          <input type="number" min={0} max={100} value={customsPercent} onChange={(event) => setCustomsPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
        </label>
        <label>Marge visée (%)
          <input type="number" min={0} max={500} value={marginPercent} onChange={(event) => setMarginPercent(Math.max(0, Number(event.target.value) || 0))} />
        </label>
      </div>

      <dl className="b2b-margin-results">
        <div><dt>Marchandise</dt><dd>{formatXof(totals.goods)}</dd></div>
        <div><dt>Transport</dt><dd>{formatXof(totals.shipping)}</dd></div>
        <div><dt>Douane</dt><dd>{formatXof(totals.customs)}</dd></div>
        <div className="is-total"><dt>Coût d’arrivée</dt><dd>{formatXof(totals.landed)}</dd></div>
        <div><dt>Coût d’arrivée / pièce</dt><dd>{formatXof(totals.landedPerUnit)}</dd></div>
        <div><dt>Prix de vente conseillé / pièce</dt><dd>{formatXof(totals.sellingPerUnit)}</dd></div>
        <div className="is-profit"><dt>Bénéfice estimé</dt><dd>{formatXof(totals.profit)}</dd></div>
      </dl>

      <p className="b2b-margin-note">
        <ChevronDown size={14} aria-hidden="true" />
        Simulation sur tes propres hypothèses. La douane et le transport réels dépendent du fret et du régime douanier de la marchandise.
      </p>
    </div>}
  </section>;
}
