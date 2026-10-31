"use client";

import Image from "next/image";
import type { DetailedProduct } from "@/lib/product";

export function VariantSelector({ product, selectedColor, selectedPlug, onColorChange, onPlugChange }: { product: DetailedProduct; selectedColor: string; selectedPlug: string; onColorChange: (id: string) => void; onPlugChange: (value: string) => void }) {
  const color = product.colorVariants.find((variant) => variant.id === selectedColor) || product.colorVariants[0];
  return <div className="pdp-variants">
    <section className="pdp-variant-section" aria-labelledby="pdp-color-title">
      <div className="pdp-variant-heading"><h3 id="pdp-color-title">Couleur</h3><button type="button" onClick={() => onColorChange(color.id)}>{color.label} · Sélectionner</button></div>
      <div className="pdp-color-options" role="group" aria-label="Choisir une couleur">
        {product.colorVariants.map((variant) => <button type="button" key={variant.id} className={`pdp-color-option ${variant.id === selectedColor ? "is-selected" : ""}`} onClick={() => onColorChange(variant.id)} aria-label={variant.label} aria-pressed={variant.id === selectedColor} title={variant.label}>
          <Image src={product.gallery[variant.imageIndex]?.src || product.imageUrl || ""} alt="" width={72} height={72}/><span className="pdp-color-dot" style={{ backgroundColor: variant.swatch }}/>
        </button>)}
      </div>
    </section>
    <section className="pdp-variant-section" aria-labelledby="pdp-plug-title">
      <div className="pdp-variant-heading"><h3 id="pdp-plug-title">Fiche / région</h3><span>{selectedPlug}</span></div>
      <div className="pdp-plug-options" role="group" aria-label="Choisir le type de fiche">
        {product.plugVariants.map((plug) => <button key={plug} type="button" className={plug === selectedPlug ? "is-selected" : ""} onClick={() => onPlugChange(plug)} aria-pressed={plug === selectedPlug}>{plug}</button>)}
      </div>
    </section>
  </div>;
}
