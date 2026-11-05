"use client";

import Link from "next/link";
import Image from "next/image";
import { Archive, ArrowUpRight, Backpack, Cable, Clock3, CupSoda, Fan, Gem, Glasses, Headphones, Laptop, Lightbulb, Moon, Package, Paintbrush, Plus, Printer, Shirt, ShoppingBag, Smartphone, Watch, Wallet, type LucideIcon } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { localizedCategoryName } from "@/lib/site-locale";
import { useCountryPreferences } from "@/components/country-preferences";
import { useCart } from "@/components/cart-provider";
import { CompareProductButton } from "@/components/product-compare";
import { FavoriteToggleButton } from "@/components/favorites-provider";

const productVisuals: Record<string, LucideIcon> = {
  "sac-cabas-urbain": ShoppingBag,
  "montre-minimaliste": Watch,
  "lunettes-uv400": Glasses,
  "sac-a-dos-etudiant": Backpack,
  "portefeuille-compact": Wallet,
  "ecouteurs-bluetooth": Headphones,
  "support-telephone": Smartphone,
  "lampe-led-bureau": Lightbulb,
  "organiseur-bureau": Archive,
  "gourde-isotherme": CupSoda,
  "mini-ventilateur": Fan,
  "chargeur-usb-c": Cable,
  "etui-ordinateur": Laptop,
  "coffret-pinceaux": Paintbrush,
  "miroir-led": Package,
  "rangement-cosmetiques": Package,
  "foulard-satin": Shirt,
  "boucles-acier": Gem,
  "veilleuse-led": Moon,
  "mini-imprimante": Printer,
};

export function ProductVisual({ product, className = "" }: { product: DemoProduct; className?: string }) {
  const { country } = useCountryPreferences();
  const PlaceholderIcon = productVisuals[product.slug] ?? Package;
  return <div className={`product-visual tone-${product.tone} ${className}`} aria-label={product.title} role="img">
    {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="(max-width: 720px) 45vw, 22vw" className="product-image"/> : <div className="product-placeholder" aria-hidden="true"><PlaceholderIcon size={46} strokeWidth={1.35}/></div>}
    <span className="visual-origin">CHINE → {country.code}</span>
  </div>;
}

export function ProductCard({ product, compact = false }: { product: DemoProduct; compact?: boolean }) {
  const { addItem } = useCart();
  const { formatPrice, text, language } = useCountryPreferences();
  return <article className={`product-card ${compact ? "product-card-compact" : ""}`}>
    <Link href={`/produits/${product.slug}#photo`} className="product-card-image-link" aria-label={`Voir ${product.title}`}>
      <ProductVisual product={product}/>
    </Link>
    <div className="product-card-info">
      <div className="product-card-category-row"><div className="product-card-category">{localizedCategoryName(product.categorySlug, language, product.category)}</div><FavoriteToggleButton product={product}/></div>
      <Link href={`/produits/${product.slug}#photo`} className="product-card-title">{product.title}</Link>
      <div className="product-card-price">{formatPrice(product.priceXof)} <span>{text("perUnit")}</span></div>
      <div className="product-card-meta"><span className="delivery-estimate"><Clock3 size={12}/> {text("estimatedDelivery")}</span></div>
      <div className="product-card-foot"><span>{text("minimum")} {product.minimumQuantity} {product.minimumQuantity > 1 ? text("units") : text("unit")}</span><div className="product-card-actions"><CompareProductButton product={product}/><button className="quick-add" onClick={() => addItem(product)} aria-label={`${text("addToCart")}: ${product.title}`}><Plus size={16}/></button></div></div>
    </div>
  </article>;
}

export function SectionHeading({ eyebrow, title, description, href = "/produits", action = "Tout voir" }: { eyebrow: string; title: string; description?: string; href?: string; action?: string }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div><Link className="text-link" href={href}>{action}<ArrowUpRight size={16}/></Link></div>;
}
