"use client";

import { MessageCircle, ShoppingCart } from "lucide-react";
import { startConversationAction } from "@/actions/messages";

type Props = { slug: string; onOrder: () => void; onAddToCart: () => void; orderable?: boolean; title?: string };

/** Barre d'actions fixée en bas de la fiche sur mobile : discuter, ajouter au panier, commander. */
export function MobileActionBar({ slug, onOrder, onAddToCart, orderable = true, title = "" }: Props) {
  if (!orderable) return <div className="pd-mobile-bar is-single" role="region" aria-label="Actions"><a href={`/demande-de-devis?produit=${encodeURIComponent(title)}`} className="pd-btn pd-btn-primary">Commander</a></div>;
  return <div className="pd-mobile-bar" role="region" aria-label="Actions de commande">
    <form action={startConversationAction}><input type="hidden" name="productSlug" value={slug}/><button type="submit" className="pd-btn pd-btn-outline pd-btn-icon" aria-label="Discuter avec le vendeur"><MessageCircle size={20} strokeWidth={1.6} aria-hidden="true"/></button></form>
    <button type="button" className="pd-btn pd-btn-outline" onClick={onAddToCart}><ShoppingCart size={17} strokeWidth={1.6} aria-hidden="true"/> Au panier</button>
    <button type="button" className="pd-btn pd-btn-primary" onClick={onOrder}>Commander</button>
  </div>;
}
