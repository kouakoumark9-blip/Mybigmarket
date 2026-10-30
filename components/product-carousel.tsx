"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { ProductCard } from "@/components/product-card";

export function ProductCarousel({ products, categoryName }: { products: DemoProduct[]; categoryName: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateControls = () => {
      setCanScrollLeft(viewport.scrollLeft > 4);
      setCanScrollRight(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 4);
    };
    updateControls();
    viewport.addEventListener("scroll", updateControls, { passive: true });
    const observer = new ResizeObserver(updateControls);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", updateControls);
      observer.disconnect();
    };
  }, [products.length]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * viewport.clientWidth * 0.8, behavior: "smooth" });
  };

  return <div className="home-product-carousel" aria-label={`Produits ${categoryName}`}>
    <button className="home-carousel-arrow home-carousel-prev" type="button" aria-label={`Produits précédents : ${categoryName}`} onClick={() => move(-1)} disabled={!canScrollLeft}><ArrowLeft size={18}/></button>
    <div className="home-product-carousel-viewport" ref={viewportRef} role="region" aria-label={`Faire défiler les produits : ${categoryName}`} tabIndex={0}>
      <div className="catalog-inspired-grid home-product-carousel-track">
        {products.map((product) => <div className="home-carousel-item" key={product.slug}><ProductCard product={product}/></div>)}
      </div>
    </div>
    <button className="home-carousel-arrow home-carousel-next" type="button" aria-label={`Produits suivants : ${categoryName}`} onClick={() => move(1)} disabled={!canScrollRight}><ArrowRight size={18}/></button>
  </div>;
}
