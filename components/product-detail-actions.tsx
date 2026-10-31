"use client";

import { useState } from "react";
import { MessageCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { useCart } from "@/components/cart-provider";
import { useCountryPreferences } from "@/components/country-preferences";
import { startConversationAction } from "@/actions/messages";
import { CompareProductButton } from "@/components/product-compare";
import { FavoriteToggleButton } from "@/components/favorites-provider";

export function ProductDetailActions({ product }: { product: DemoProduct }) {
  const [quantity, setQuantity] = useState(product.minimumQuantity);
  const { addItem } = useCart();
  const { text } = useCountryPreferences();
  return <>
    <div className="quantity-label">{text("quantityLabel")} <span>· {text("minimum")} {product.minimumQuantity}</span></div>
    <div className="quantity-control"><button aria-label={text("decrease")} onClick={() => setQuantity((value) => Math.max(product.minimumQuantity, value - 1))}><Minus size={14}/></button><input aria-label={text("quantityLabel")} type="number" min={product.minimumQuantity} max={product.quantity} value={quantity} onChange={(event) => setQuantity(Math.max(product.minimumQuantity, Math.min(product.quantity, Number(event.target.value) || product.minimumQuantity)))}/><button aria-label={text("increase")} onClick={() => setQuantity((value) => Math.min(product.quantity, value + 1))}><Plus size={14}/></button></div>
    <div className="detail-add-row"><button className="button button-primary" onClick={() => addItem(product, quantity)}><ShoppingBag size={16}/> {text("addToCart")}</button><form action={startConversationAction}><input type="hidden" name="productSlug" value={product.slug}/><button className="button button-outline" type="submit"><MessageCircle size={15}/> {text("contactSeller")}</button></form></div>
    <div className="detail-compare-action"><CompareProductButton product={product} showLabel/><FavoriteToggleButton product={product} showLabel/></div>
  </>;
}
