"use client";

import { useEffect } from "react";
import { Check, X } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";
import { visibleThumbs } from "@/lib/pdp/margin";
import { PdpImage } from "@/components/product-detail/shared";
import { useCountryPreferences } from "@/components/country-preferences";

export type VariantState = {
  color: string;
  design: string;
  onColor: (id: string) => void;
  onDesign: (id: string) => void;
  onOpenSheet: () => void;
};

type Props = { product: Product; state: VariantState; compact?: boolean; idPrefix: string };

export function VariantPicker({ product, state, compact = false, idPrefix }: Props) {
  const { tr } = useCountryPreferences();
  const slots = compact ? pdpConfig.colorThumbLimit.compact : pdpConfig.colorThumbLimit.full;
  const { shown, hidden } = visibleThumbs(product.colorVariants, slots, product.colorVariants.findIndex((variant) => variant.id === state.color));
  const current = product.colorVariants.find((variant) => variant.id === state.color);
  const design = product.designOptions.find((option) => option.id === state.design);
  if (!product.colorVariants.length && !product.designOptions.length) return null;

  return <div className={`pd-variants${compact ? " is-compact" : ""}`}>
    {product.colorVariants.length > 0 && <section aria-labelledby={`${idPrefix}-color`}>
      <div className="pd-variant-head">
        <h3 id={`${idPrefix}-color`}>{tr("Couleur")}{current && <span> : {current.label}</span>}</h3>
        {!compact && <button type="button" className="pd-pill-small" onClick={state.onOpenSheet}>{tr("Sélectionner")}</button>}
      </div>
      <div className="pd-swatches" role="radiogroup" aria-labelledby={`${idPrefix}-color`} style={{ "--pd-cols": slots } as React.CSSProperties}>
        {shown.map((variant) => <button key={variant.id} type="button" role="radio" aria-checked={variant.id === state.color} aria-label={variant.label} title={variant.label} className={`pd-swatch${variant.id === state.color ? " is-selected" : ""}`} onClick={() => state.onColor(variant.id)}>
          <PdpImage src={variant.image} alt="" width={56} height={56} sizes="56px"/>
        </button>)}
        {hidden > 0 && <button type="button" className="pd-swatch pd-swatch-more" onClick={state.onOpenSheet} aria-label={tr("Voir les {n} autres couleurs", { n: hidden })}>+{hidden}</button>}
      </div>
    </section>}

    {product.designOptions.length > 0 && <section aria-labelledby={`${idPrefix}-design`}>
      <div className="pd-variant-head"><h3 id={`${idPrefix}-design`}>{tr(product.designLabel || "Conception")}{compact && design && <span> : {design.label}</span>}</h3></div>
      <div className="pd-chips" role="radiogroup" aria-labelledby={`${idPrefix}-design`}>
        {product.designOptions.map((option) => <button key={option.id} type="button" role="radio" aria-checked={option.id === state.design} className={`pd-chip${option.id === state.design ? " is-selected" : ""}`} onClick={() => state.onDesign(option.id)}>{option.label}</button>)}
      </div>
    </section>}
  </div>;
}

/** Liste complète des variantes : bottom sheet sur mobile, panneau centré sur desktop. */
export function VariantSheet({ product, state, open, onClose }: { product: Product; state: VariantState; open: boolean; onClose: () => void }) {
  const { tr } = useCountryPreferences();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("pd-lock");
    return () => { window.removeEventListener("keydown", onKey); document.body.classList.remove("pd-lock"); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="pd-modal-backdrop is-sheet" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pd-modal pd-sheet" role="dialog" aria-modal="true" aria-labelledby="pd-sheet-title">
      <header className="pd-modal-head"><h2 id="pd-sheet-title">{tr("Choisir les options")}</h2><button type="button" onClick={onClose} aria-label={tr("Fermer")} autoFocus><X size={20} strokeWidth={1.5}/></button></header>
      {product.colorVariants.length > 0 && <section aria-labelledby="pd-sheet-color">
        <h3 id="pd-sheet-color" className="pd-block-title">{tr("Couleur")} ({product.colorVariants.length})</h3>
        <div className="pd-sheet-list" role="radiogroup" aria-labelledby="pd-sheet-color">
          {product.colorVariants.map((variant) => <button key={variant.id} type="button" role="radio" aria-checked={variant.id === state.color} className={`pd-sheet-option${variant.id === state.color ? " is-selected" : ""}`} onClick={() => state.onColor(variant.id)}>
            <PdpImage src={variant.image} alt="" width={48} height={48} sizes="48px"/><span>{variant.label}</span>{variant.id === state.color && <Check size={16} strokeWidth={2} aria-hidden="true"/>}
          </button>)}
        </div>
      </section>}
      {product.designOptions.length > 0 && <section aria-labelledby="pd-sheet-design">
        <h3 id="pd-sheet-design" className="pd-block-title">{tr(product.designLabel || "Conception")}</h3>
        <div className="pd-chips" role="radiogroup" aria-labelledby="pd-sheet-design">
          {product.designOptions.map((option) => <button key={option.id} type="button" role="radio" aria-checked={option.id === state.design} className={`pd-chip${option.id === state.design ? " is-selected" : ""}`} onClick={() => state.onDesign(option.id)}>{option.label}</button>)}
        </div>
      </section>}
      <button type="button" className="pd-btn pd-btn-primary pd-btn-block" onClick={onClose}>{tr("Valider")}</button>
    </div>
  </div>;
}
