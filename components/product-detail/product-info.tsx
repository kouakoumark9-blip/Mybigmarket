"use client";

import { forwardRef } from "react";
import { useCountryPreferences } from "@/components/country-preferences";
import { Info, Trophy } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { VariantPicker, type VariantState } from "@/components/product-detail/variant-picker";
import { SpecsGrid } from "@/components/product-detail/specs-grid";
import { Stars, usePlural, usePriceRange } from "@/components/product-detail/shared";

type Props = { product: Product; variants: VariantState; unitPrice: number };

/** Bloc prix réutilisé par la boîte d'achat compacte. */
export function PriceBlock({ product, compact = false }: { product: Product; compact?: boolean }) {
  const priceRange = usePriceRange();
  const plural = usePlural();
  const { tr, locale } = useCountryPreferences();
  return <div className={`pd-price-block${compact ? " is-compact" : ""}`}>
    {product.lowestPriceBadge && <span className="pd-badge-deal">{tr(product.lowestPriceBadge)}</span>}
    {product.quantityPrices?.length ? <ul className="pd-qty-prices" aria-label={tr("Prix selon la quantité")}>
      {product.quantityPrices.map((row) => <li key={row.minQuantity}>
        <span className="pd-qty-range">{row.maxQuantity == null ? tr("{n} {unit} et plus", { n: row.minQuantity.toLocaleString(locale), unit: tr("pièces") }) : `${row.minQuantity.toLocaleString(locale)} – ${row.maxQuantity.toLocaleString(locale)} ${tr("pièces")}`}</span>
        <b>{priceRange(row.unitPriceXof)}</b>
      </li>)}
    </ul> : <p className="pd-price"><span className="sr-only">{tr("Prix")} : </span>{priceRange(product.priceMin, product.priceMax)}</p>}
    <p className="pd-moq">{tr("Quantité minimale")} : {plural(product.minOrderQty, product.unit)}</p>
  </div>;
}

export const ProductInfo = forwardRef<HTMLDivElement, Props>(function ProductInfo({ product, variants }, priceRef) {
  const { tr, locale } = useCountryPreferences();
  return <section className="pd-info" aria-label={tr("Informations sur le produit")}>
    <h1 className="pd-title" title={product.title}>{product.title}</h1>
    <div className="pd-reputation">
      {product.reviewsCount > 0 ? <>
        <Stars value={product.rating}/>
        <b>{product.rating.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
        <a href="#pdp-reviews">({tr("{n} avis", { n: product.reviewsCount.toLocaleString(locale) })})</a>
      </> : <span className="pd-new-badge">{tr("Nouveauté · soyez le premier à donner votre avis")}</span>}
      {product.soldCount > 0 && <><i aria-hidden="true"/><span>{tr("{n} vendus", { n: product.soldCount.toLocaleString(locale) })}</span></>}
      {product.rankLabel && <><i aria-hidden="true"/><span className="pd-rank" title={product.rankLabel}><Trophy size={14} strokeWidth={1.5} aria-hidden="true"/> <span>{tr(product.rankLabel)}</span></span></>}
    </div>

    <div ref={priceRef}><PriceBlock product={product}/></div>
    <hr className="pd-rule"/>

    <VariantPicker product={product} state={variants} idPrefix="pd-main"/>
    <SpecsGrid items={product.keySpecs}/>

    {product.highlights.length > 0 && <section className="pd-block" aria-labelledby="pd-glance-title">
      <h3 id="pd-glance-title" className="pd-block-title">{tr("En un coup d’œil")} <Info size={15} strokeWidth={1.5} aria-hidden="true"/></h3>
      <ul className="pd-highlights">{product.highlights.map((item) => <li key={item.lead}><b>{tr(item.lead)}</b> {tr(item.text)}</li>)}</ul>
    </section>}

  </section>;
});
