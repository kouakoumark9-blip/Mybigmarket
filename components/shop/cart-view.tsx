"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { formatFcfa } from "@/lib/shop/format";

export function CartView() {
  const { items, total, setQuantity, removeItem } = useCart();
  if (!items.length) return <div className="mb-box"><div className="mb-box-body" style={{ textAlign: "center", padding: "40px 16px" }}>
    <ShoppingCart size={40} strokeWidth={1.5} aria-hidden="true" style={{ color: "#9aa3b2" }}/>
    <h2 style={{ margin: "12px 0 6px", fontSize: 18 }}>Votre panier est vide</h2>
    <p style={{ margin: "0 0 16px", color: "#5b6577" }}>Ajoutez un produit depuis le catalogue, il apparaîtra ici.</p>
    <Link className="mb-btn" href="/produits">Voir les produits</Link>
  </div></div>;
  const onOrder = items.some((item) => item.availability === "on_order");
  const inStock = items.some((item) => item.availability !== "on_order");
  const longest = Math.max(0, ...items.filter((item) => item.availability === "on_order").map((item) => item.leadTimeDays));
  return <div className="mb-two">
    <section className="mb-box" aria-label="Articles du panier">
      <h2>Articles ({items.reduce((sum, item) => sum + item.qty, 0)})</h2>
      {items.map((item) => <article key={item.slug} className="mb-line">
        <Link href={`/produits/${item.slug}`} className="mb-line-img">{item.imageUrl ? <Image src={item.imageUrl} alt="" width={84} height={84} unoptimized={item.imageUrl.endsWith(".svg")}/> : null}</Link>
        <div>
          <h3><Link href={`/produits/${item.slug}`}>{item.title}</Link></h3>
          <p className={`mb-avail${item.availability !== "on_order" ? " mb-avail--stock" : ""}`} style={{ margin: "0 0 8px", minHeight: 0 }}>{item.availabilityLabel ?? "Livraison à confirmer"}</p>
          <div className="mb-qty">
            <button type="button" aria-label={`Diminuer la quantité de ${item.title}`} onClick={() => setQuantity(item.slug, item.qty - 1)}><Minus size={14} strokeWidth={1.75}/></button>
            <input type="number" min={1} value={item.qty} aria-label={`Quantité de ${item.title}`} onChange={(event) => setQuantity(item.slug, Number(event.target.value) || 1)}/>
            <button type="button" aria-label={`Augmenter la quantité de ${item.title}`} onClick={() => setQuantity(item.slug, item.qty + 1)}><Plus size={14} strokeWidth={1.75}/></button>
          </div>
          {item.isPlaceholder && <p className="mb-notice mb-notice--error" style={{ marginTop: 8 }}>Fiche fictive : ce produit ne peut pas être commandé.</p>}
        </div>
        <div className="mb-line-side">
          <div className="mb-price">{formatFcfa(item.priceXof * item.qty)}</div>
          <button type="button" className="mb-remove" onClick={() => removeItem(item.slug)}><Trash2 size={14} strokeWidth={1.75} aria-hidden="true"/> Retirer</button>
        </div>
      </article>)}
    </section>
    <aside className="mb-box" aria-label="Récapitulatif">
      <h2>Récapitulatif</h2>
      <div className="mb-box-body">
        <div className="mb-summary-row"><span>Sous-total</span><b>{formatFcfa(total)}</b></div>
        <div className="mb-summary-row"><span>Livraison</span><span>Selon votre commune</span></div>
        <div className="mb-summary-row mb-summary-row--total"><span>Total produits</span><span>{formatFcfa(total)}</span></div>
        {onOrder && <p className="mb-notice" style={{ marginTop: 12 }}>{inStock ? "Les produits en stock partent sous 24 à 72 h. " : ""}Les produits sur commande sont livrés sous {longest} jours{inStock ? " : ils peuvent arriver séparément" : ""}.</p>}
        <Link className="mb-btn mb-btn--block" href="/commande" style={{ marginTop: 12 }}>Commander</Link>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#5b6577" }}>Paiement par mobile money. Les frais de livraison s&apos;affichent à l&apos;étape suivante, avant validation.</p>
      </div>
    </aside>
  </div>;
}
