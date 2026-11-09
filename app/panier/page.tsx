"use client";

import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { useCountryPreferences } from "@/components/country-preferences";
import { ProductVisual } from "@/components/product-card";

export default function CartPage() {
  const { items, total, setQuantity, removeItem } = useCart();
  const { formatPrice, text } = useCountryPreferences();
  const sellers = [...new Set(items.map((item) => item.seller))];
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">{text("home")}</Link><span>›</span><span>{text("cart")}</span></div><h1 className="page-title">{text("cartTitle")}</h1><p className="page-subtitle">{text("cartSubtitle")}</p>
    {!items.length ? <div className="cart-panel cart-empty"><ShoppingBag size={36}/><h2>{text("cartEmptyMessage")}</h2><p>{text("checkoutEmptyMessage")}</p><Link className="button button-primary" href="/produits">{text("exploreCatalog")} <ArrowRight size={15}/></Link></div> :
    <div className="two-column"><section className="cart-panel">{sellers.map((seller) => <div key={seller}><div className="seller-cart-group">{text("orderPerSeller")} {seller}</div>{items.filter((item) => item.seller === seller).map((item) => <article className="cart-line" key={item.slug}><Link href={`/produits/${item.slug}`} className="cart-thumb"><ProductVisual product={item}/></Link><div><h3><Link href={`/produits/${item.slug}`}>{item.title}</Link></h3><small>{item.seller} · {text("minimumQuantity")} {item.minimumQuantity} · {text("estimatedDelivery")}</small><div className="cart-line-price">{formatPrice(item.priceXof * item.qty)}</div><div className="quantity-control"><button aria-label="Diminuer" onClick={() => setQuantity(item.slug, item.qty - 1)}><Minus size={13}/></button><input aria-label={`Quantité ${item.title}`} type="number" min={item.minimumQuantity} value={item.qty} onChange={(e) => setQuantity(item.slug, Number(e.target.value) || item.minimumQuantity)}/><button aria-label="Augmenter" onClick={() => setQuantity(item.slug, item.qty + 1)}><Plus size={13}/></button></div></div><div className="cart-line-actions"><button aria-label={`Retirer ${item.title}`} onClick={() => removeItem(item.slug)}><Trash2 size={15}/></button></div></article>)}</div>)}</section><aside className="summary-card"><h2>{text("cartSummary")}</h2><div className="summary-row"><span>{text("cartItems")} ({items.length})</span><b>{formatPrice(total)}</b></div><div className="summary-row"><span>{text("vendors")}</span><b>{sellers.length}</b></div><div className="summary-row"><span>{text("shippingCustoms")}</span><span>À confirmer</span></div><div className="summary-row total"><span>Sous-total</span><b>{formatPrice(total)}</b></div><Link className="button button-primary" href="/checkout">{text("cartContinue")} <ArrowRight size={15}/></Link><p className="summary-note">Le checkout créera une commande par vendeur. Les frais de livraison et de douane ne sont pas calculés dans cette démo.</p></aside></div>}
  </main>;
}
