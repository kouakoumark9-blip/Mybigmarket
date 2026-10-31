"use client";

import Image from "next/image";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Recommendation } from "@/lib/product";
import { useCountryPreferences } from "@/components/country-preferences";

export function ProductCarousel({ title, items, visibleCount = 5, id }: { title: string; items: Recommendation[]; visibleCount?: number; id: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const { formatPrice } = useCountryPreferences();
  const move = (direction: -1 | 1) => rail.current?.scrollBy({ left: direction * (rail.current.clientWidth * .8), behavior: "smooth" });
  return <section className="pdp-recommendation-section" aria-labelledby={`${id}-title`}>
    <header className="pdp-recommendation-header"><h2 id={`${id}-title`}>{title}</h2><div className="pdp-carousel-controls"><button type="button" onClick={() => move(-1)} aria-label={`Défiler vers la gauche : ${title}`}><ChevronLeft size={18}/></button><button type="button" onClick={() => move(1)} aria-label={`Défiler vers la droite : ${title}`}><ChevronRight size={18}/></button></div></header>
    <div className="pdp-recommendation-rail" ref={rail} style={{ "--pdp-visible-count": visibleCount } as React.CSSProperties}>
      {items.map((item) => <article className="pdp-recommendation-card" key={item.id}>
        <div className="pdp-recommendation-image"><Image src={item.image} alt={item.title} width={360} height={360} sizes="(max-width: 700px) 42vw, 18vw"/></div>
        {item.colors && <span className="pdp-recommendation-colors"><i/><i/><i/> {item.colors} couleurs</span>}
        <h3>{item.title}</h3>
        <strong>{item.priceRangeXof ? `${formatPrice(item.priceRangeXof[0])} – ${formatPrice(item.priceRangeXof[1])}` : formatPrice(item.priceXof)}</strong>
        <span className="pdp-recommendation-moq">MOQ : {item.moq} pièce{item.moq === 1 ? "" : "s"}</span>
      </article>)}
    </div>
  </section>;
}
