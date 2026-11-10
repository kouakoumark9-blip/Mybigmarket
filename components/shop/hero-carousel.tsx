"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "@/lib/shop/banners";

/**
 * Carrousel de bannières : 2172 × 274 px sur ordinateur, 1080 × 540 px sur mobile, image en cover (jamais déformée).
 * Défilement toutes les 3,5 s, arrêté au survol ou quand l'utilisateur préfère moins d'animations.
 */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const paused = useRef(false);
  const count = banners.length;
  const go = useCallback((next: number) => setIndex((next + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (!paused.current) setIndex((current) => (current + 1) % count); }, 3500);
    return () => window.clearInterval(timer);
  }, [count]);

  return <section className="mb-hero" aria-roledescription="carrousel" aria-label="Offres du moment"
    onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onFocus={() => { paused.current = true; }} onBlur={() => { paused.current = false; }}>
    <div className="mb-hero-track" style={{ transform: `translateX(-${index * 100}%)` }} aria-live="off">
      {banners.map((banner, position) => <Link key={banner.desktop} href={banner.href} className="mb-hero-slide" aria-hidden={position !== index} tabIndex={position === index ? 0 : -1} aria-label={banner.alt}>
        {failed[position] && <span className="mb-banner-fallback"><b>{banner.fallback.title}</b><span>{banner.fallback.text}</span></span>}
        {/* Première bannière chargée en priorité, les autres à la demande ; formats modernes et tailles adaptées à l'écran. */}
        {!failed[position] && <Image src={banner.desktop} alt="" fill sizes="(max-width: 1240px) 100vw, 1240px" unoptimized loading={position === 0 ? "eager" : "lazy"} fetchPriority={position === 0 ? "high" : "low"} style={{ objectFit: "cover" }} onError={() => setFailed((state) => ({ ...state, [position]: true }))}/>}
      </Link>)}
    </div>
    {count > 1 && <>
      <button type="button" className="mb-hero-arrow mb-hero-arrow--prev" onClick={() => go(index - 1)} aria-label="Bannière précédente"><ChevronLeft size={22} strokeWidth={1.75}/></button>
      <button type="button" className="mb-hero-arrow mb-hero-arrow--next" onClick={() => go(index + 1)} aria-label="Bannière suivante"><ChevronRight size={22} strokeWidth={1.75}/></button>
      <div className="mb-hero-dots">{banners.map((banner, position) => <button key={banner.desktop} type="button" aria-label={`Bannière ${position + 1}`} aria-current={position === index} onClick={() => go(position)}/>)}</div>
    </>}
  </section>;
}
