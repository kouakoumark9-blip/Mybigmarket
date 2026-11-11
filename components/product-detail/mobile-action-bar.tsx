"use client";

import { ShoppingCart } from "lucide-react";

type Props = { slug: string; onOrder: () => void; onAddToCart: () => void; orderable?: boolean; title?: string };

/** Barre fixée en bas de la fiche sur téléphone : un seul bouton, « Ajouter au panier ». */
export function MobileActionBar({ onAddToCart, orderable = true, title = "" }: Props) {
  if (!orderable) return <div className="pd-mobile-bar is-single" role="region" aria-label="Actions"><a href={`/demande-de-devis?produit=${encodeURIComponent(title)}`} className="pd-btn pd-btn-primary">Commander</a></div>;
  return <div className="pd-mobile-bar is-single" role="region" aria-label="Ajouter au panier">
    <button type="button" className="pd-btn pd-btn-primary" onClick={onAddToCart}><ShoppingCart size={19} strokeWidth={1.8} aria-hidden="true"/> Ajouter au panier</button>
  </div>;
}
