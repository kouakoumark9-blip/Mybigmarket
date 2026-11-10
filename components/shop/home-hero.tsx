import Link from "next/link";
import { HERO } from "@/lib/shop/hero";
import { HeroSlides } from "./hero-slides";

/** Hero de l'accueil : un titre, une ligne d'explication, un bouton d'action et une photo produit. */
export function HomeHero() {
  return <section className="mb-hero2" aria-labelledby="hero-title">
    <div className="mb-hero2-copy">
      <p className="mb-hero2-eyebrow">MyBigMarket · Abidjan</p>
      <h1 id="hero-title">{HERO.title}</h1>
      <p className="mb-hero2-sub">{HERO.subtitle}</p>
      <Link className="mb-btn mb-hero2-cta" href={HERO.cta.href}>{HERO.cta.label}</Link>
    </div>
    <div className="mb-hero2-media">
      <HeroSlides/>
    </div>
  </section>;
}
