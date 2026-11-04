"use client";

import { MessageCircle } from "lucide-react";
import { startConversationAction } from "@/actions/messages";

export function MobileActionBar({ slug, onOrder }: { slug: string; onOrder: () => void }) {
  return <div className="pd-mobile-bar" role="region" aria-label="Actions de commande">
    <form action={startConversationAction}><input type="hidden" name="productSlug" value={slug}/><button type="submit" className="pd-btn pd-btn-outline"><MessageCircle size={16} strokeWidth={1.5} aria-hidden="true"/> Discuter</button></form>
    <button type="button" className="pd-btn pd-btn-primary" onClick={onOrder}>Commander</button>
  </div>;
}
