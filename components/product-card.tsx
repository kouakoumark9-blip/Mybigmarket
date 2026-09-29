"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, BadgeCheck, Clock3, Plus, Star } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { formatXof } from "@/lib/demo-data";
import { useCart } from "@/components/cart-provider";

export function ProductVisual({ product, className = "" }: { product: DemoProduct; className?: string }) {
  return <div className={`product-visual tone-${product.tone} ${className}`} aria-label={product.title} role="img">
    {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="(max-width: 720px) 45vw, 22vw" className="product-image"/> : <><div className="visual-glow"/><span className="product-emoji" aria-hidden="true">{product.icon}</span></>}
    <span className="visual-stamp">PRÉCOMMANDE</span><span className="visual-origin">CHINE → CI</span>
  </div>;
}

export function ProductCard({ product, compact = false }: { product: DemoProduct; compact?: boolean }) {
  const { addItem } = useCart();
  return <article className={`product-card ${compact ? "product-card-compact" : ""}`}>
    <Link href={`/produits/${product.slug}`} className="product-card-image-link" aria-label={`Voir ${product.title}`}>
      <ProductVisual product={product}/>
    </Link>
    <div className="product-card-info">
      <div className="product-card-category">{product.category}</div>
      <Link href={`/produits/${product.slug}`} className="product-card-title">{product.title}</Link>
      <div className="product-card-price">{formatXof(product.priceXof)} <span>/ unité</span></div>
      <div className="product-card-meta"><span><Star size={12} fill="currentColor"/> {product.rating.toFixed(1)} ({product.reviewCount})</span><span><Clock3 size={12}/> {product.leadTimeDays} j</span></div>
      <div className="product-seller"><BadgeCheck size={14} fill="#e9f5ec"/><span>{product.seller}</span><small>Vérifié</small></div>
      <div className="product-card-foot"><span>Min. {product.minimumQuantity} unité{product.minimumQuantity > 1 ? "s" : ""}</span><button className="quick-add" onClick={() => addItem(product)} aria-label={`Ajouter ${product.title} au panier`}><Plus size={16}/></button></div>
    </div>
  </article>;
}

export function SectionHeading({ eyebrow, title, description, href = "/produits", action = "Tout voir" }: { eyebrow: string; title: string; description?: string; href?: string; action?: string }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div><Link className="text-link" href={href}>{action}<ArrowUpRight size={16}/></Link></div>;
}
