"use client";

import { ShoppingCart } from "lucide-react";
import { formatFcfa } from "@/lib/shop/format";

type Props = { slug: string; onOrder: () => void; onAddToCart: () => void; orderable?: boolean; title?: string; price?: number; sizeLabel?: string };

/** Barre fixée en bas de la fiche (téléphone et ordinateur) : le prix reste toujours visible, avec « Ajouter au panier ». */
export function MobileActionBar({ onAddToCart, orderable = true, title = "", price, sizeLabel }: Props) {
  if (!orderable) return <div className="pd-mobile-bar is-single" role="region" aria-label="Actions"><a href={`/demande-de-devis?produit=${encodeURIComponent(title)}`} className="pd-btn pd-btn-primary">Commander</a></div>;
  return <div className={`pd-mobile-bar is-single${price ? " has-price" : ""}`} role="region" aria-label="Prix et ajout au panier">
    {price ? <p className="pd-bar-price"><span>{sizeLabel ? `Taille ${sizeLabel}` : "Prix"}</span><b>{formatFcfa(price)}</b></p> : null}
    <button type="button" className="pd-btn pd-btn-primary" onClick={onAddToCart}><ShoppingCart size={19} strokeWidth={1.8} aria-hidden="true"/> Ajouter au panier</button>
  </div>;
}
