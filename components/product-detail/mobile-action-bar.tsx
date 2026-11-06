"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { startConversationAction } from "@/actions/messages";

export function MobileActionBar({ slug, onOrder, orderable = true, title = "" }: { slug: string; onOrder: () => void; orderable?: boolean; title?: string }) {
  if (!orderable) return <div className="pd-mobile-bar" role="region" aria-label="Actions"><Link href={`/demande-de-devis?produit=${encodeURIComponent(title)}`} className="pd-btn pd-btn-primary">Demander un devis</Link></div>;
  return <div className="pd-mobile-bar" role="region" aria-label="Actions de commande">
    <form action={startConversationAction}><input type="hidden" name="productSlug" value={slug}/><button type="submit" className="pd-btn pd-btn-outline"><MessageCircle size={16} strokeWidth={1.5} aria-hidden="true"/> Discuter</button></form>
    <button type="button" className="pd-btn pd-btn-primary" onClick={onOrder}>Commander</button>
  </div>;
}
