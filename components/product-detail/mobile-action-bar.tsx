"use client";

import Link from "next/link";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { startConversationAction } from "@/actions/messages";
import { useCountryPreferences } from "@/components/country-preferences";

type Props = { slug: string; onOrder: () => void; onAddToCart: () => void; orderable?: boolean; title?: string };

/** Barre d'actions fixée en bas de la fiche sur mobile : discuter, ajouter au panier, commander. */
export function MobileActionBar({ slug, onOrder, onAddToCart, orderable = true, title = "" }: Props) {
  const { tr } = useCountryPreferences();
  if (!orderable) return <div className="pd-mobile-bar is-single" role="region" aria-label={tr("Actions")}><Link href={`/demande-de-devis?produit=${encodeURIComponent(title)}`} className="pd-btn pd-btn-primary">{tr("Commander")}</Link></div>;
  return <div className="pd-mobile-bar" role="region" aria-label={tr("Actions de commande")}>
    <form action={startConversationAction}><input type="hidden" name="productSlug" value={slug}/><button type="submit" className="pd-btn pd-btn-outline pd-btn-icon" aria-label={tr("Discuter avec le vendeur")}><MessageCircle size={20} strokeWidth={1.6} aria-hidden="true"/></button></form>
    <button type="button" className="pd-btn pd-btn-outline" onClick={onAddToCart}><ShoppingCart size={17} strokeWidth={1.6} aria-hidden="true"/> {tr("Au panier")}</button>
    <button type="button" className="pd-btn pd-btn-primary" onClick={onOrder}>{tr("Commander")}</button>
  </div>;
}
