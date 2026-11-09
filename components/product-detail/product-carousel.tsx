"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { markProductCardClick } from "@/lib/pdp/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductCardData } from "@/lib/pdp/types";
import { PdpImage, usePriceRange } from "@/components/product-detail/shared";
import { useCountryPreferences } from "@/components/country-preferences";

function Card({ item }: { item: ProductCardData }) {
  const priceRange = usePriceRange();
  const { formatPrice } = useCountryPreferences();
  const body = <>
    <div className="pd-card-image"><PdpImage src={item.image} alt={item.title} width={320} height={320} sizes="(max-width: 700px) 45vw, 18vw" loading="lazy"/></div>
    {(item.swatches?.length || item.colorCount) ? <p className="pd-card-colors">
      {item.swatches?.slice(0, 3).map((color) => <i key={color} style={{ backgroundColor: color }} aria-hidden="true"/>)}
      {item.colorCount ? <span>{item.colorCount} couleurs</span> : null}
    </p> : null}
    <h3 className="pd-card-title">{item.title}</h3>
    <p className="pd-card-price">{priceRange(item.priceMin, item.priceMax)}</p>
    {item.compareAtPrice && item.discountPercent ? <p className="pd-card-discount"><s>{formatPrice(item.compareAtPrice)}</s> <span>-{item.discountPercent} %</span></p> : null}
    <p className="pd-card-moq">MOQ : {item.minOrderQty} pièce{item.minOrderQty > 1 ? "s" : ""}</p>
  </>;
  return item.slug ? <Link href={`/produits/${item.slug}`} onClick={markProductCardClick} className="pd-card">{body}</Link> : <article className="pd-card">{body}</article>;
}

export function ProductCarousel({ title, items, id, anchorId }: { title: string; items: ProductCardData[]; id: string; anchorId?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const scroll = (direction: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") { event.preventDefault(); scroll(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); scroll(-1); }
  };

  if (!items.length) return null;
  return <section className="pd-section pd-carousel" id={anchorId} aria-labelledby={`${id}-title`} aria-roledescription="carrousel">
    <h2 id={`${id}-title`} className="pd-section-title">{title}</h2>
    <div className="pd-carousel-frame">
      <button type="button" className="pd-carousel-arrow is-prev" onClick={() => scroll(-1)} disabled={edges.start} aria-label={`Produits précédents : ${title}`}><ChevronLeft size={20} strokeWidth={1.5}/></button>
      <div className="pd-carousel-rail" ref={rail} onScroll={update} onKeyDown={onKey} tabIndex={0} aria-label={`${title}, utilisez les flèches pour faire défiler`}>
        {items.map((item) => <Card key={item.id} item={item}/>)}
      </div>
      <button type="button" className="pd-carousel-arrow is-next" onClick={() => scroll(1)} disabled={edges.end} aria-label={`Produits suivants : ${title}`}><ChevronRight size={20} strokeWidth={1.5}/></button>
    </div>
  </section>;
}
