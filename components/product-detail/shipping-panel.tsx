"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, LockKeyhole, MessageCircle, ShoppingCart, Truck } from "lucide-react";
import type { DetailedProduct, PriceTier } from "@/lib/product";
import { PriceTiers } from "@/components/product-detail/price-tiers";
import { useCountryPreferences } from "@/components/country-preferences";
import { useCart } from "@/components/cart-provider";
import { startConversationAction } from "@/actions/messages";

export function ShippingPanel({ product, quantity, selectedTier, onQuantityChange, selectedColorLabel, selectedPlug }: { product: DetailedProduct; quantity: number; selectedTier: PriceTier; onQuantityChange: (quantity: number) => void; selectedColorLabel: string; selectedPlug: string }) {
  const { formatPrice } = useCountryPreferences();
  const { addItem } = useCart();
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const totalXof = selectedTier.unitPriceXof * quantity;

  const orderNow = () => {
    addItem(product, quantity);
    router.push("/checkout");
  };
  const addToCart = () => {
    addItem(product, quantity);
    setFeedback("Article ajouté au panier. Aucun paiement n’a été effectué.");
  };

  return <aside className="pdp-shipping-panel" id="pdp-shipping" aria-label="Livraison et commande">
    <div className="pdp-shipping-card">
      <header className="pdp-shipping-header"><h2>Livraison</h2><a href="#pdp-shipping-details">Modifier <ChevronRight size={15}/></a></header>
      <div className="pdp-shipping-quote"><span className="pdp-logistics-label"><Truck size={14}/> Estimation logistique · démo</span><b>Frais indicatifs : {formatPrice(product.shipping.feeXof)} / {product.shipping.pieceCount} pièce</b><span>Date estimative : {product.shipping.estimatedDate}</span><small>{product.shipping.disclaimer}</small></div>
      <div className="pdp-order-protection"><h3><LockKeyhole size={16}/> Conditions de commande</h3><p>Les détails de livraison et les conditions doivent être confirmés avant commande.</p><div className="pdp-payment-status"><span className="pdp-status-dot"/> Paiement réel non activé</div><small>Aucun prestataire de paiement n’est connecté; aucune donnée bancaire n’est demandée ici.</small></div>
      <section className="pdp-sticky-price" aria-label="Prix et options sélectionnées">
        <PriceTiers product={product} selectedTier={selectedTier} onQuantityChange={onQuantityChange} compact/>
        <div className="pdp-selected-variant"><span>Couleur</span><strong>{selectedColorLabel}</strong><span>Fiche</span><strong>{selectedPlug}</strong></div>
      </section>
      <div className="pdp-order-controls" id="pdp-shipping-details">
        <label htmlFor="pdp-quantity">Quantité</label><div className="pdp-quantity-stepper"><button type="button" onClick={() => onQuantityChange(Math.max(product.minimumQuantity, quantity - 1))} aria-label="Diminuer la quantité">−</button><input id="pdp-quantity" type="number" min={product.minimumQuantity} max={10_000} value={quantity} onChange={(event) => onQuantityChange(Math.max(product.minimumQuantity, Math.min(10_000, Number(event.target.value) || product.minimumQuantity)))}/><button type="button" onClick={() => onQuantityChange(Math.min(10_000, quantity + 1))} aria-label="Augmenter la quantité">+</button></div>
        <div className="pdp-order-total"><span>{formatPrice(selectedTier.unitPriceXof)} × {quantity}</span><strong>{formatPrice(totalXof)}</strong><small>Total indicatif des produits; livraison, douane et frais exclus.</small></div>
        <button type="button" className="pdp-order-button" onClick={orderNow}>Commander <ArrowRight size={17}/></button>
        <div className="pdp-secondary-actions"><button type="button" onClick={addToCart}><ShoppingCart size={15}/> Ajouter au panier</button><form action={startConversationAction}><input type="hidden" name="productSlug" value={product.slug}/><button type="submit"><MessageCircle size={15}/> Discuter ici</button></form></div>
        <p className="pdp-add-feedback" aria-live="polite">{feedback}</p>
        <div className="pdp-no-payment-note">La commande et le paiement ne sont pas transmis à un vendeur dans cette démonstration locale.</div>
      </div>
    </div>
  </aside>;
}
