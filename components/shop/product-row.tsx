"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ShopProduct } from "@/lib/shop/types";
import { ProductCard } from "./product-card";

/** Rangée de produits à défilement horizontal (tactile sur mobile, flèches sur ordinateur). */
export function ProductRow({ products }: { products: ShopProduct[] }) {
  const track = useRef<HTMLDivElement>(null);
  const move = (direction: 1 | -1) => track.current?.scrollBy({ left: direction * Math.max(240, track.current.clientWidth * 0.8), behavior: "smooth" });
  return <div className="mb-row-wrap">
    <button type="button" className="mb-row-btn mb-row-btn--prev" onClick={() => move(-1)} aria-label="Produits précédents"><ChevronLeft size={22} aria-hidden="true"/></button>
    <div className="mb-row" ref={track} role="list">
      {products.map((product, index) => <div className="mb-row-item" role="listitem" key={product.id}><ProductCard product={product} priority={index < 4}/></div>)}
    </div>
    <button type="button" className="mb-row-btn mb-row-btn--next" onClick={() => move(1)} aria-label="Produits suivants"><ChevronRight size={22} aria-hidden="true"/></button>
  </div>;
}
