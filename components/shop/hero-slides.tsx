"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HERO } from "@/lib/shop/hero";

/** Images du hero : fondu lent toutes les 5 secondes, arrêté si l'utilisateur préfère moins d'animations. */
export function HeroSlides() {
  const [index, setIndex] = useState(0);
  const count = HERO.images.length;

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), 5000);
    return () => window.clearInterval(timer);
  }, [count]);

  return <>
    {HERO.images.map((image, position) => <Image key={image.src} src={image.src} alt={position === index ? image.alt : ""} aria-hidden={position !== index} fill
      sizes="(max-width: 760px) 100vw, 560px" priority={position === 0} loading={position === 0 ? "eager" : "lazy"}
      className={`mb-hero2-img${position === index ? " is-active" : ""}`} style={{ objectPosition: image.position }}/>)}
    {count > 1 && <div className="mb-hero2-dots" role="group" aria-label="Choisir l'image">
      {HERO.images.map((image, position) => <button key={image.src} type="button" aria-label={`Image ${position + 1}`} aria-current={position === index} onClick={() => setIndex(position)}/>)}
    </div>}
  </>;
}
