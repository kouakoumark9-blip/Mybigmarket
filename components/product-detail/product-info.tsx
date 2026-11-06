"use client";

import { forwardRef } from "react";
import { Info, Trophy } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { VariantPicker, type VariantState } from "@/components/product-detail/variant-picker";
import { SpecsGrid } from "@/components/product-detail/specs-grid";
import { Stars, plural, usePriceRange } from "@/components/product-detail/shared";

type Props = { product: Product; variants: VariantState; unitPrice: number };

/** Bloc prix réutilisé par la boîte d'achat compacte. */
export function PriceBlock({ product, compact = false }: { product: Product; compact?: boolean }) {
  const priceRange = usePriceRange();
  return <div className={`pd-price-block${compact ? " is-compact" : ""}`}>
    {product.lowestPriceBadge && <span className="pd-badge-deal">{product.lowestPriceBadge}</span>}
    {product.quantityPrices?.length ? <ul className="pd-qty-prices" aria-label="Prix selon la quantité">
      {product.quantityPrices.map((row) => <li key={row.minQuantity}>
        <span className="pd-qty-range">{row.maxQuantity == null ? `${row.minQuantity.toLocaleString("fr-FR")} ${product.unit}s et plus` : `${row.minQuantity.toLocaleString("fr-FR")} – ${row.maxQuantity.toLocaleString("fr-FR")} ${product.unit}s`}</span>
        <b>{priceRange(row.unitPriceXof)}</b>
      </li>)}
    </ul> : <p className="pd-price"><span className="sr-only">Prix : </span>{priceRange(product.priceMin, product.priceMax)}</p>}
    <p className="pd-moq">Quantité minimale : {plural(product.minOrderQty, product.unit)}</p>
  </div>;
}

export const ProductInfo = forwardRef<HTMLDivElement, Props>(function ProductInfo({ product, variants }, priceRef) {
  return <section className="pd-info" aria-label="Informations sur le produit">
    <h1 className="pd-title" title={product.title}>{product.title}</h1>
    <div className="pd-reputation">
      {product.reviewsCount > 0 ? <>
        <Stars value={product.rating}/>
        <b>{product.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
        <a href="#pdp-reviews">({product.reviewsCount.toLocaleString("fr-FR")} avis)</a>
      </> : <span className="pd-new-badge">Nouveauté · soyez le premier à donner votre avis</span>}
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

  </section>;
});
