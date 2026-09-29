"use client";

import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { formatXof } from "@/lib/demo-data";
import { ProductVisual } from "@/components/product-card";

export default function CartPage() {
  const { items, total, setQuantity, removeItem } = useCart();
  const sellers = [...new Set(items.map((item) => item.seller))];
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Mon panier</span></div><h1 className="page-title">Mon panier</h1><p className="page-subtitle">Les quantités minimums sont appliquées. Le paiement est une démonstration.</p>
    {!items.length ? <div className="cart-panel cart-empty"><ShoppingBag size={36}/><h2>Votre panier est encore vide</h2><p>Découvrez les produits en précommande et ajoutez vos trouvailles.</p><Link className="button button-primary" href="/produits">Explorer le catalogue <ArrowRight size={15}/></Link></div> :
    <div className="two-column"><section className="cart-panel">{sellers.map((seller) => <div key={seller}><div className="seller-cart-group">Une commande séparée sera créée pour {seller}</div>{items.filter((item) => item.seller === seller).map((item) => <article className="cart-line" key={item.slug}><Link href={`/produits/${item.slug}`} className="cart-thumb"><ProductVisual product={item}/></Link><div><h3><Link href={`/produits/${item.slug}`}>{item.title}</Link></h3><small>{item.seller} · minimum {item.minimumQuantity} · {item.leadTimeDays} jours estimés</small><div className="cart-line-price">{formatXof(item.priceXof * item.qty)}</div><div className="quantity-control"><button aria-label="Diminuer" onClick={() => setQuantity(item.slug, item.qty - 1)}><Minus size={13}/></button><input aria-label={`Quantité ${item.title}`} type="number" min={item.minimumQuantity} value={item.qty} onChange={(e) => setQuantity(item.slug, Number(e.target.value) || item.minimumQuantity)}/><button aria-label="Augmenter" onClick={() => setQuantity(item.slug, item.qty + 1)}><Plus size={13}/></button></div></div><div className="cart-line-actions"><button aria-label={`Retirer ${item.title}`} onClick={() => removeItem(item.slug)}><Trash2 size={15}/></button></div></article>)}</div>)}</section><aside className="summary-card"><h2>Résumé du panier</h2><div className="summary-row"><span>Articles ({items.length})</span><b>{formatXof(total)}</b></div><div className="summary-row"><span>Vendeurs</span><b>{sellers.length}</b></div><div className="summary-row"><span>Livraison & douane</span><span>À confirmer</span></div><div className="summary-row total"><span>Sous-total</span><b>{formatXof(total)}</b></div><Link className="button button-primary" href="/checkout">Continuer vers le paiement <ArrowRight size={15}/></Link><p className="summary-note">Le checkout créera une commande par vendeur. Les frais de livraison et de douane ne sont pas calculés dans cette démo.</p></aside></div>}
  </main>;
}
