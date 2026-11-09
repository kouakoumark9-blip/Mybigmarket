"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "@/lib/shop/banners";

/**
 * Carrousel de bannières : 2172 × 274 px sur ordinateur, 1080 × 540 px sur mobile, image en cover (jamais déformée).
 * Défilement lent (6 s), arrêté au survol ou quand l'utilisateur préfère moins d'animations.
 */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, string>>({});
  const paused = useRef(false);
  const count = banners.length;
  const go = useCallback((next: number) => setIndex((next + count) % count), [count]);

  // N'affiche une image que si son fichier existe : sinon le bandeau de texte reste en place.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    banners.forEach((banner, position) => {
      const src = mobile ? banner.mobile : banner.desktop;
      const probe = new window.Image();
      probe.onload = () => setLoaded((state) => ({ ...state, [position]: src }));
      probe.src = src;
    });
  }, [banners]);

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (!paused.current) setIndex((current) => (current + 1) % count); }, 6000);
    return () => window.clearInterval(timer);
  }, [count]);

  return <section className="mb-hero" aria-roledescription="carrousel" aria-label="Offres du moment"
    onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onFocus={() => { paused.current = true; }} onBlur={() => { paused.current = false; }}>
    <div className="mb-hero-track" style={{ transform: `translateX(-${index * 100}%)` }} aria-live="off">
      {banners.map((banner, position) => <Link key={banner.href} href={banner.href} className="mb-hero-slide" aria-hidden={position !== index} tabIndex={position === index ? 0 : -1} aria-label={banner.alt}>
        <span className="mb-banner-fallback"><b>{banner.fallback.title}</b><span>{banner.fallback.text}</span></span>
        {/* eslint-disable-next-line @next/next/no-img-element -- bannière plein cadre, taille fixée par le conteneur */}
        {loaded[position] && <img src={loaded[position]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
      </Link>)}
    </div>
    {count > 1 && <>
      <button type="button" className="mb-hero-arrow mb-hero-arrow--prev" onClick={() => go(index - 1)} aria-label="Bannière précédente"><ChevronLeft size={22} strokeWidth={1.75}/></button>
      <button type="button" className="mb-hero-arrow mb-hero-arrow--next" onClick={() => go(index + 1)} aria-label="Bannière suivante"><ChevronRight size={22} strokeWidth={1.75}/></button>
      <div className="mb-hero-dots">{banners.map((banner, position) => <button key={banner.href} type="button" aria-label={`Bannière ${position + 1}`} aria-current={position === index} onClick={() => go(position)}/>)}</div>
    </>}
  </section>;
}
