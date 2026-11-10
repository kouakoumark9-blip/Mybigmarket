import Image from "next/image";
import Link from "next/link";
import { HERO } from "@/lib/shop/hero";

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
      <Image src={HERO.image.src} alt={HERO.image.alt} fill priority sizes="(max-width: 760px) 100vw, 560px" quality={80}/>
    </div>
  </section>;
}
