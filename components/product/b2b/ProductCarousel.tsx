"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { formatRange, formatXof } from "./format";
import type { ProductDetailCard } from "@/lib/product-detail-data";

/**
 * Carrousel horizontal de cartes produit.
 *
 * Défilement natif (`scroll-snap`) plutôt qu'un translate calculé : le geste
 * tactile et la molette restent naturels, et la position survit au redimension.
 * Les flèches défilent d'une « page » visible et se désactivent aux extrémités
 * pour ne jamais donner l'impression qu'il reste du contenu.
 */
export function ProductCarousel({
  title,
  products,
  emptyLabel = "Aucun produit à afficher.",
}: {
  title: string;
  products: ProductDetailCard[];
  emptyLabel?: string;
}) {
  const track = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(320, node.clientWidth * 0.8), behavior: "smooth" });
  };

  if (products.length === 0) {
    return <section className="b2b-carousel">
      <h2>{title}</h2>
      <p className="b2b-muted">{emptyLabel}</p>
    </section>;
  }

  return <section className="b2b-carousel" aria-label={title}>
    <div className="b2b-carousel-head">
      <h2>{title}</h2>
      <div className="b2b-carousel-nav">
        <button type="button" aria-label="Faire défiler vers la gauche" onClick={() => scrollBy(-1)}><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Faire défiler vers la droite" onClick={() => scrollBy(1)}><ChevronRight size={18} /></button>
      </div>
    </div>

    <div className="b2b-carousel-track" ref={track}>
      {products.map((product) => <article key={product.slug} className="b2b-card">
        <Link href={`/produits/${product.slug}`}>
          <div className="b2b-card-media">
            {product.imageUrl
              // eslint-disable-next-line @next/next/no-img-element -- URL en base, format variable
              ? <img src={product.imageUrl} alt={product.title} loading="lazy" />
              : <span className="b2b-card-placeholder" aria-hidden="true">{product.title.slice(0, 1)}</span>}
          </div>
          {product.colorCount > 1 && <p className="b2b-card-colors">{product.colorCount} couleurs</p>}
          <h3>{product.title}</h3>
          <p className="b2b-card-price">
            {product.maximumTierPriceXof !== null && product.maximumTierPriceXof !== product.priceXof
              ? formatRange(product.priceXof, product.maximumTierPriceXof)
              : formatXof(product.priceXof)}
          </p>
          <p className="b2b-card-moq">MOQ : {product.minimumQuantity} pièce{product.minimumQuantity > 1 ? "s" : ""}</p>
        </Link>
      </article>)}
    </div>
  </section>;
}
