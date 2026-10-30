"use client";

import { useState } from "react";
import { MessageCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { useCart } from "@/components/cart-provider";
import { QuoteRequestButton } from "@/components/quote-request-button";
import { startConversationAction } from "@/actions/messages";

export function ProductDetailActions({ product, backendConfigured = false }: { product: DemoProduct; backendConfigured?: boolean }) {
  const [quantity, setQuantity] = useState(product.minimumQuantity);
  const { addItem } = useCart();
  return <>
    <div className="quantity-label">Quantité <span>· minimum {product.minimumQuantity}</span></div>
    <div className="quantity-control"><button aria-label="Diminuer la quantité" onClick={() => setQuantity((value) => Math.max(product.minimumQuantity, value - 1))}><Minus size={14}/></button><input aria-label="Quantité" type="number" min={product.minimumQuantity} max={product.quantity} value={quantity} onChange={(event) => setQuantity(Math.max(product.minimumQuantity, Math.min(product.quantity, Number(event.target.value) || product.minimumQuantity)))}/><button aria-label="Augmenter la quantité" onClick={() => setQuantity((value) => Math.min(product.quantity, value + 1))}><Plus size={14}/></button></div>
    <div className="detail-add-row"><button className="button button-primary" onClick={() => addItem(product, quantity)}><ShoppingBag size={16}/> Ajouter au panier</button><form action={startConversationAction}><input type="hidden" name="productSlug" value={product.slug}/><button className="button button-outline" type="submit"><MessageCircle size={15}/> Écrire au vendeur</button></form></div>
    <div className="wholesale-offer"><div><b>Vous achetez en quantité ?</b><small>Demandez un prix de gros; le vendeur devra confirmer les paliers.</small></div><QuoteRequestButton product={product} backendConfigured={backendConfigured}/></div>
  </>;
}
