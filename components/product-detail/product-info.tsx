"use client";

import { forwardRef } from "react";
import Image from "next/image";
import { Info, Minus, Plus, Trophy } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { VariantPicker, type VariantState } from "@/components/product-detail/variant-picker";
import { SpecsGrid } from "@/components/product-detail/specs-grid";
import { Stars, usePriceRange } from "@/components/product-detail/shared";
import { formatFcfa } from "@/lib/shop/format";

type Props = { product: Product; variants: VariantState; unitPrice: number; quantity: number; onQuantity: (value: number) => void; maxQuantity?: number; orderable?: boolean };


/** Choix de la quantité : boutons moins / plus ou saisie directe. */
function QuantityPicker({ value, onChange, min, max, unitPrice }: { value: number; onChange: (value: number) => void; min: number; max: number; unitPrice: number }) {
  const clamp = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next) || min)));
  return <div className="pd-qty">
    <label htmlFor="pd-qty-input">Quantité</label>
    <div className="pd-qty-box">
      <button type="button" onClick={() => clamp(value - 1)} disabled={value <= min} aria-label="Diminuer la quantité"><Minus size={16} strokeWidth={1.75} aria-hidden="true"/></button>
      <input id="pd-qty-input" type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(event) => clamp(Number(event.target.value))}/>
      <button type="button" onClick={() => clamp(value + 1)} disabled={value >= max} aria-label="Augmenter la quantité"><Plus size={16} strokeWidth={1.75} aria-hidden="true"/></button>
    </div>
    <p className="pd-qty-total" aria-live="polite"><span>Total</span> <b>{formatFcfa(unitPrice * value)}</b>{value > 1 && <small>{value} × {formatFcfa(unitPrice)}</small>}</p>
    {value >= max && max < 99 && <p className="pd-qty-note">Quantité maximale disponible en stock : {max}. Pour davantage, écrivez-nous sur WhatsApp.</p>}
  </div>;
}

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
  </div>;
}

export const ProductInfo = forwardRef<HTMLDivElement, Props>(function ProductInfo({ product, variants, unitPrice, quantity, onQuantity, maxQuantity = 99, orderable = true }, priceRef) {
  return <section className="pd-info" aria-label="Informations sur le produit">
    <h1 className="pd-title" title={product.title}>{product.title}</h1>
    {product.brand && <div className="pd-brand">
      {product.brand.logo && <Image src={product.brand.logo} alt={`Logo ${product.brand.name}`} width={433} height={183} className="pd-brand-logo"/>}
      <span>Marque : <b>{product.brand.name}</b>{product.brand.tagline ? <> · {product.brand.tagline}</> : null}</span>
    </div>}
    <div className="pd-reputation">
      {product.reviewsCount > 0 ? <>
        <Stars value={product.rating}/>
        <b>{product.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
        <a href="#pdp-reviews">({product.reviewsCount.toLocaleString("fr-FR")} avis)</a>
      </> : null}
      {product.soldCount > 0 && <><i aria-hidden="true"/><span>{product.soldCount.toLocaleString("fr-FR")} vendus</span></>}
      {product.rankLabel && <><i aria-hidden="true"/><span className="pd-rank" title={product.rankLabel}><Trophy size={14} strokeWidth={1.5} aria-hidden="true"/> <span>{product.rankLabel}</span></span></>}
    </div>

    <div ref={priceRef}><PriceBlock product={product}/></div>
    <hr className="pd-rule"/>

    <VariantPicker product={product} state={variants} idPrefix="pd-main"/>
    {orderable && <QuantityPicker value={quantity} onChange={onQuantity} min={1} unitPrice={unitPrice} max={maxQuantity}/>}
    <SpecsGrid items={product.keySpecs}/>

    {product.highlights.length > 0 && <section className="pd-block" aria-labelledby="pd-glance-title">
      <h3 id="pd-glance-title" className="pd-block-title">En un coup d&apos;œil <Info size={15} strokeWidth={1.5} aria-hidden="true"/></h3>
      <ul className="pd-highlights">{product.highlights.map((item) => <li key={item.lead}><b>{item.lead}</b> {item.text}</li>)}</ul>
    </section>}

  </section>;
});
