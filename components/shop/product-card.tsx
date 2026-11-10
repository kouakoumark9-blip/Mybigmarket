import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatFcfa } from "@/lib/shop/format";
import type { ShopProduct } from "@/lib/shop/types";

/** Carte produit : photo, prix, nom sur deux lignes, disponibilité (présentation « marketplace »). */
export function ProductCard({ product, priority = false }: { product: ShopProduct; priority?: boolean }) {
  const href = `/produits/${product.slug}`;
  const available = product.availability === "on_order" || product.quantity > 0;
  return <article className="mb-card">
    <Link href={href} className="mb-card-img" aria-label={product.title} tabIndex={-1}>
      {product.image
        ? <Image src={product.image} alt="" width={240} height={240} sizes="(max-width: 640px) 45vw, (max-width: 1100px) 24vw, 200px" priority={priority} unoptimized={product.image.endsWith(".svg")}/>
        : <span className="mb-card-noimg"><ImageOff size={36} strokeWidth={1.5} aria-hidden="true"/><span>Photo à venir</span></span>}
      <span className="mb-card-badges">
        {product.discountPercent > 0 && <span className="mb-badge mb-badge--promo">-{product.discountPercent} %</span>}
        {product.badge && product.discountPercent === 0 && <span className="mb-badge">{product.badge}</span>}
      </span>
    </Link>
    <h3 className="mb-card-title"><Link href={href}>{product.title}</Link></h3>
    {product.powerLabel && <p className="mb-card-power">{product.powerLabel}</p>}
    <div className="mb-price">{formatFcfa(product.priceXof)}</div>
    <div className="mb-price-old">{product.comparePriceXof && product.comparePriceXof > product.priceXof ? <><s>{formatFcfa(product.comparePriceXof)}</s><em>-{product.discountPercent} %</em></> : null}</div>
    <p className={`mb-avail${product.inStock ? " mb-avail--stock" : ""}`}>{available ? product.availabilityLabel : "Indisponible pour le moment"}</p>
  </article>;
}

export function ProductGrid({ products }: { products: ShopProduct[] }) {
  return <div className="mb-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 5}/>)}</div>;
}
