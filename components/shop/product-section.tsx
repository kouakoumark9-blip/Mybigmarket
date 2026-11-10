import Link from "next/link";
import type { ShopProduct } from "@/lib/shop/types";
import { ProductRow } from "./product-row";

export function ProductSection({ title, href, products, promo = false }: { title: string; href?: string; products: ShopProduct[]; promo?: boolean }) {
  if (!products.length) return null;
  return <section className="mb-section" aria-label={title}>
    <div className={`mb-section-head${promo ? " mb-section-head--promo" : ""}`}>
      <div><span className="mb-eyebrow">{products.length} produit{products.length > 1 ? "s" : ""}</span><h2>{title}</h2></div>
      {href && <Link className="mb-link" href={href}>Voir tout</Link>}
    </div>
    <ProductRow products={products}/>
  </section>;
}
