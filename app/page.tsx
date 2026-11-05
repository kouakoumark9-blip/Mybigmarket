import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgePercent, Boxes, Headset, House, ShieldCheck, Shirt, Smartphone, Truck, type LucideIcon } from "lucide-react";
import { categories } from "@/lib/demo-data";
import { LocalizedCategoryName } from "@/components/destination-labels";
import { LocaleText } from "@/components/locale-text";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCarousel } from "@/components/product-carousel";

export const dynamic = "force-dynamic";

const categoryIcons: Record<string, LucideIcon> = {
  "mode-accessoires": Shirt,
  electronique: Smartphone,
  "maison-cuisine": House,
};

export default async function HomePage() {
  // Accueil vitrine : rendu sans dépendre de la base. Un accueil en 500 parce
  // que la base est momentanément indisponible fait perdre visiteurs et
  // crédibilité ; le catalogue temps réel reste sur /produits.
  const products = await getCatalogProducts({ forceDemo: true });
  const categoryGroups = categories.map((category) => ({ category, items: products.filter((product) => product.categorySlug === category.slug) }));

  return <main className="shell marketplace-home marketplace-catalog-home">
    <section className="catalog-image-banners" aria-label="Explorer les univers mybigmarket">
      <aside className="catalog-category-index catalog-home-rail">
        <div className="catalog-index-heading"><b><LocaleText messageKey="browseCategories"/></b><Link href="/produits" aria-label="Toutes les catégories"><ArrowRight size={15}/></Link></div>
        {categories.map((category) => { const CategoryIcon = categoryIcons[category.slug] ?? Boxes; return <Link className="catalog-index-item" key={category.slug} href={`/produits?categorie=${category.slug}`}><CategoryIcon size={18} strokeWidth={1.7}/><span><b><LocalizedCategoryName slug={category.slug} fallback={category.name}/></b></span><ArrowRight className="catalog-index-arrow" size={14}/></Link>; })}
        <Link className="catalog-index-all" href="/produits"><LocaleText messageKey="allProducts"/> <ArrowRight size={14}/></Link>
      </aside>
      <Link className="catalog-image-banner catalog-image-banner-main" href="/produits">
        <Image src="/hero-courier.jpg" alt="Colis et accessoires sélectionnés pour des achats entre la Chine et Abidjan" fill priority sizes="(max-width: 760px) 100vw, 70vw"/>
        <span className="catalog-image-banner-shade" aria-hidden="true"/>
        <span className="catalog-image-banner-copy"><small>MYBIGMARKET · CHINE → AFRIQUE DE L’OUEST</small><b><LocaleText messageKey="bannerTitle"/></b><span><LocaleText messageKey="bannerDescription"/></span><i><LocaleText messageKey="exploreCatalog"/> <ArrowRight size={15}/></i></span>
      </Link>
      <div className="catalog-image-banner-side">
        <Link className="catalog-image-banner catalog-image-banner-electronics" href="/produits?categorie=electronique">
          <span className="catalog-image-banner-copy"><small>TECH DU QUOTIDIEN</small><b>Électronique</b><i>Voir les produits <ArrowRight size={13}/></i></span>
          <Image src="/product-audio.jpg" alt="Casque et écouteurs audio" fill sizes="(max-width: 760px) 45vw, 18vw"/>
        </Link>
        <Link className="catalog-image-banner catalog-image-banner-home" href="/produits?categorie=maison-cuisine">
          <span className="catalog-image-banner-copy"><small>MAISON & IDÉES UTILES</small><b>Pour votre espace</b><i>Découvrir <ArrowRight size={13}/></i></span>
          <Image src="/product-home.jpg" alt="Lampe de bureau et accessoires pour la maison" fill sizes="(max-width: 760px) 45vw, 18vw"/>
        </Link>
      </div>
    </section>

    <section className="home-trust-bar" aria-label="Nos engagements">
      <div><ShieldCheck size={22} strokeWidth={1.6}/><span><b>Paiement sécurisé</b><small>Mobile Money, Wave et carte bancaire</small></span></div>
      <div><Truck size={22} strokeWidth={1.6}/><span><b>Livraison suivie</b><small>De la Chine jusqu’à votre porte</small></span></div>
      <div><BadgePercent size={22} strokeWidth={1.6}/><span><b>Prix dans votre devise</b><small>Montant clair avant de commander</small></span></div>
      <div><Headset size={22} strokeWidth={1.6}/><span><b>Service client</b><small>Une équipe pour vous accompagner</small></span></div>
    </section>

    <section id="catalogue" className="catalog-feed" aria-labelledby="catalog-feed-title">
      <div className="home-section-heading">
        <div><span className="eyebrow">{products.length} PRODUITS SÉLECTIONNÉS</span><h2 id="catalog-feed-title">Notre sélection du moment</h2></div>
        <Link className="catalog-more-link" href="/produits"><LocaleText messageKey="viewAllCatalog"/> <ArrowRight size={15}/></Link>
      </div>
      {products.length ? <div className="catalog-category-groups">{categoryGroups.map(({ category, items }, index) => <div className="catalog-category-group-wrap" key={category.slug}><section className="catalog-category-section" aria-labelledby={`category-${category.slug}`}><div className="catalog-category-section-heading"><div><span className="eyebrow">{items.length} PRODUITS</span><h3 id={`category-${category.slug}`}>{category.name}</h3></div><Link className="catalog-more-link" href={`/produits?categorie=${category.slug}`}>Voir tout <ArrowRight size={14}/></Link></div>{items.length ? <ProductCarousel products={items} categoryName={category.name}/> : <div className="catalog-empty"><p>De nouvelles offres seront bientôt ajoutées à ce rayon.</p></div>}</section>{index < categoryGroups.length - 1 && <Link className={`catalog-category-interstitial ${index === 0 ? "interstitial-electronics" : "interstitial-home"}`} href={index === 0 ? "/produits?categorie=electronique" : "/produits?categorie=maison-cuisine"}><Image src={index === 0 ? "/products/tech-keyboard.jpg" : "/products/home-kettle.jpg"} alt="" fill sizes="(max-width: 760px) 100vw, 1260px"/><span className="catalog-category-interstitial-copy"><small>{index === 0 ? "À DÉCOUVRIR · HIGH-TECH" : "À DÉCOUVRIR · MAISON & BEAUTÉ"}</small><b>{index === 0 ? "Les bons accessoires pour rester connecté." : "De nouvelles idées pour votre intérieur."}</b><span>Découvrir la sélection <ArrowRight size={14}/></span></span></Link>}</div>)}</div> : <div className="catalog-empty"><h2>Le catalogue se prépare</h2><p>Revenez bientôt pour découvrir les prochaines offres.</p></div>}
      <div className="catalog-bottom-note"><Truck size={16}/><span><LocaleText messageKey="demoProductsNote"/></span></div>
    </section>

  </main>;
}
