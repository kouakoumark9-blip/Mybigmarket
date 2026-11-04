"use client";

import { forwardRef, useState } from "react";
import { ChevronRight, Info, Sparkles, Trophy } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";
import { VariantPicker, type VariantState } from "@/components/product-detail/variant-picker";
import { SpecsGrid } from "@/components/product-detail/specs-grid";
import { MarginCalculator } from "@/components/product-detail/margin-calculator";
import { Stars, plural, usePriceRange } from "@/components/product-detail/shared";

type Props = { product: Product; variants: VariantState; unitPrice: number };

/** Bloc prix réutilisé par la boîte d'achat compacte. */
export function PriceBlock({ product, compact = false }: { product: Product; compact?: boolean }) {
  const priceRange = usePriceRange();
  return <div className={`pd-price-block${compact ? " is-compact" : ""}`}>
    {product.lowestPriceBadge && <span className="pd-badge-deal">{product.lowestPriceBadge}</span>}
    <p className="pd-price"><span className="sr-only">Prix : </span>{priceRange(product.priceMin, product.priceMax)}</p>
    <p className="pd-moq">Quantité minimale : {plural(product.minOrderQty, product.unit)}</p>
  </div>;
}

export const ProductInfo = forwardRef<HTMLDivElement, Props>(function ProductInfo({ product, variants, unitPrice }, priceRef) {
  const [calcOpen, setCalcOpen] = useState(false);
  return <section className="pd-info" aria-label="Informations sur le produit">
    <h1 className="pd-title">{product.title}</h1>
    <div className="pd-reputation">
      <Stars value={product.rating}/>
      <b>{product.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
      <a href="#pdp-reviews">({product.reviewsCount.toLocaleString("fr-FR")} avis)</a>
      {product.soldCount > 0 && <><i aria-hidden="true"/><span>{product.soldCount.toLocaleString("fr-FR")} vendus</span></>}
      {product.rankLabel && <><i aria-hidden="true"/><span className="pd-rank" title={product.rankLabel}><Trophy size={14} strokeWidth={1.5} aria-hidden="true"/> <span>{product.rankLabel}</span></span></>}
    </div>

    <div ref={priceRef}><PriceBlock product={product}/></div>
    <hr className="pd-rule"/>

    <VariantPicker product={product} state={variants} idPrefix="pd-main"/>
    <SpecsGrid items={product.keySpecs}/>

    {product.highlights.length > 0 && <section className="pd-block" aria-labelledby="pd-glance-title">
      <h3 id="pd-glance-title" className="pd-block-title">En un coup d&apos;œil <Info size={15} strokeWidth={1.5} aria-hidden="true"/></h3>
      <ul className="pd-highlights">{product.highlights.map((item) => <li key={item.lead}><b>{item.lead}</b> {item.text}</li>)}</ul>
    </section>}

    <section className="pd-block" aria-label={pdpConfig.analysisTitle}>
      <p className="pd-analysis"><Sparkles size={15} strokeWidth={1.75} className="pd-spark" aria-hidden="true"/> {pdpConfig.analysisTitle}</p>
      <button type="button" className="pd-row-button" onClick={() => setCalcOpen((value) => !value)} aria-expanded={calcOpen}>{pdpConfig.marginCta}<ChevronRight size={16} strokeWidth={1.5} className={calcOpen ? "is-rotated" : ""}/></button>
      {calcOpen && <MarginCalculator unitPrice={unitPrice} minOrderQty={product.minOrderQty} onClose={() => setCalcOpen(false)}/>}
    </section>
  </section>;
});
