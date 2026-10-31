"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, PackageCheck, Sparkles, Star } from "lucide-react";
import { useCountryPreferences } from "@/components/country-preferences";
import type { DetailedProduct, PriceTier } from "@/lib/product";
import { PriceTiers } from "@/components/product-detail/price-tiers";
import { VariantSelector } from "@/components/product-detail/variant-selector";
import { KeyAttributes } from "@/components/product-detail/key-attributes";

export function ProductInfo({ product, selectedTier, onQuantityChange, selectedColor, selectedPlug, onColorChange, onPlugChange }: { product: DetailedProduct; selectedTier: PriceTier; onQuantityChange: (quantity: number) => void; selectedColor: string; selectedPlug: string; onColorChange: (id: string) => void; onPlugChange: (value: string) => void }) {
  const [showCostNote, setShowCostNote] = useState(false);
  const [targetSellingPrice, setTargetSellingPrice] = useState("");
  const { convertXofToLocal, currency, locale, exchangeRateReady, formatPrice } = useCountryPreferences();
  const costInLocalCurrency = convertXofToLocal(selectedTier.unitPriceXof);
  const targetPrice = Number(targetSellingPrice);
  const estimatedGrossMargin = Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice - costInLocalCurrency : null;
  const displayedCurrency = exchangeRateReady ? currency : "XOF";
  const formatLocalAmount = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency: displayedCurrency, maximumFractionDigits: 2 }).format(amount);
  return <section className="pdp-info-card">
    <div className="pdp-info-head">
      <span className="pdp-category-label">{product.category} · {product.breadcrumb[2]}</span>
      <h1>{product.title}</h1>
      <div className="pdp-rating-row"><span className="pdp-stars" aria-label={`Note indicative : ${product.rating} sur 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={15} fill={i < Math.floor(product.rating) ? "currentColor" : "none"}/>)}</span><strong>{product.rating.toFixed(1).replace(".", ",")}</strong><a href="#pdp-reviews">({product.reviewCount} avis illustratifs)</a><i aria-hidden="true"/> <span>{product.soldCount} vendus (exemple)</span></div>
    </div>
    <PriceTiers product={product} selectedTier={selectedTier} onQuantityChange={onQuantityChange}/>
    <VariantSelector product={product} selectedColor={selectedColor} selectedPlug={selectedPlug} onColorChange={onColorChange} onPlugChange={onPlugChange}/>
    <KeyAttributes items={product.keyAttributes}/>
    <div className="pdp-analysis-block">
      <p><Sparkles size={16}/> Autres analyses et recherches sur ce produit <span>· démonstration</span></p>
      <button type="button" onClick={() => setShowCostNote((value) => !value)} aria-expanded={showCostNote}>Calculer le coût et la marge <ChevronRight size={16}/></button>
      {showCostNote && <div className="pdp-cost-note pdp-margin-calculator"><label htmlFor="pdp-target-price">Prix de revente visé par unité ({displayedCurrency})</label><input id="pdp-target-price" type="number" min="0" inputMode="decimal" value={targetSellingPrice} onChange={(event) => setTargetSellingPrice(event.target.value)} placeholder="Ex. 75 000"/><div><PackageCheck size={15}/><span>Prix d’achat unitaire indicatif : <b>{formatPrice(selectedTier.unitPriceXof)}</b></span></div>{estimatedGrossMargin !== null && <output className={estimatedGrossMargin >= 0 ? "is-positive" : "is-negative"}>Marge brute estimée, hors frais : <strong>{formatLocalAmount(estimatedGrossMargin)}</strong></output>}<small>Simulation simple avant transport, douane, taxes et autres frais; ne constitue pas une offre de marge garantie.</small></div>}
    </div>
    <div className="pdp-demo-ribbon">Données de démonstration · prix, variantes, avis et disponibilité à confirmer.</div>
    <Link href="#pdp-attributes" className="pdp-more-details">Voir toutes les caractéristiques <ChevronRight size={15}/></Link>
  </section>;
}
