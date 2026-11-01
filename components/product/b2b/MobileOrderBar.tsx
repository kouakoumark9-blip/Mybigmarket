"use client";

import { MessageCircle, ShoppingBag } from "lucide-react";
import { formatXof } from "./format";

/**
 * Barre fixe mobile : discussion, panier, commande avec total.
 *
 * Le total est toujours affiché, même réduit : c'est l'information qui décide
 * de l'achat. La barre respecte la zone de sécurité iOS (`env(safe-area-inset)`).
 */
export function MobileOrderBar({
  totalXof,
  onOrder,
  onAddToCart,
  onChat,
  disabled = false,
}: {
  totalXof: number;
  onOrder: () => void;
  onAddToCart: () => void;
  onChat: () => void;
  disabled?: boolean;
}) {
  return <div className="b2b-mobile-bar">
    <button type="button" className="b2b-mobile-icon" onClick={onChat} aria-label="Discuter avec le vendeur"><MessageCircle size={20} /></button>
    <button type="button" className="b2b-mobile-icon" onClick={onAddToCart} aria-label="Ajouter au panier"><ShoppingBag size={20} /></button>
    <button type="button" className="b2b-btn-primary b2b-mobile-order" onClick={onOrder} disabled={disabled}>
      Commander · {formatXof(totalXof)}
    </button>
  </div>;
}
