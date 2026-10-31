import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Boxes, House, MapPin, PackageCheck, Search, Shirt, SlidersHorizontal, Smartphone, Tag, Truck, type LucideIcon } from "lucide-react";
import { categories } from "@/lib/demo-data";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const categoryIcons: Record<string, LucideIcon> = {
  "mode-accessoires": Shirt,
  electronique: Smartphone,
  "maison-cuisine": House,
};

export default async function HomePage() {
  const products = await getCatalogProducts();
  const byCategory = categories.map((category) => products.filter((product) => product.categorySlug === category.slug));
  const mixedProducts = Array.from({ length: Math.max(0, ...byCategory.map((group) => group.length)) }, (_, index) => byCategory.flatMap((group) => group[index] ? [group[index]] : [])).flat();
  const featuredProducts = mixedProducts.slice(0, 5);

  return <main className="shell marketplace-home marketplace-catalog-home">
    <div className="marketplace-context-bar catalog-context">
      <span>Parcours de précommande <b>Chine <span>→</span> Abidjan</b></span>
      <div className="market-context-links"><span className="country-context"><MapPin size={13}/> Côte d’Ivoire · XOF / FCFA</span><Link href="/compte/commandes">Suivre une commande <ArrowRight size={14}/></Link></div>
    </div>

    <section className="catalog-search-hero" aria-label="Rechercher et explorer">
      <nav className="catalog-mode-tabs" aria-label="Explorer mybigmarket">
        <Link className="is-active" href="/produits">Produits</Link>
        <Link href="/demande-de-devis">Achats de gros</Link>
      </nav>
      <form action="/produits" className="catalog-search-bar" role="search">
        <div className="catalog-search-input"><Search size={20}/><input name="q" aria-label="Rechercher dans le catalogue" placeholder="Que recherchez-vous ? Ex. sacs, téléphones, maison…"/></div>
        <div className="catalog-search-submit-row"><span><PackageCheck size={15}/> Prix indicatifs en FCFA · Quantité minimum indiquée</span><button type="submit">Rechercher <ArrowRight size={16}/></button></div>
      </form>
    </section>

    <section className="catalog-image-banners" aria-label="Explorer les univers mybigmarket">
      <aside className="catalog-category-index catalog-home-rail">
        <div className="catalog-index-heading"><b>Parcourir les catégories</b><Link href="/produits" aria-label="Voir toutes les catégories"><ArrowRight size={15}/></Link></div>
        {categories.map((category) => { const CategoryIcon = categoryIcons[category.slug] ?? Boxes; return <Link className="catalog-index-item" key={category.slug} href={`/produits?categorie=${category.slug}`}><CategoryIcon size={18} strokeWidth={1.7}/><span><b>{category.name}</b></span><ArrowRight className="catalog-index-arrow" size={14}/></Link>; })}
        <Link className="catalog-index-all" href="/produits">Tous les produits <ArrowRight size={14}/></Link>
      </aside>
      <Link className="catalog-image-banner catalog-image-banner-main" href="/produits">
        <Image src="/hero-courier.jpg" alt="Colis préparés pour un acheminement de la Chine vers Abidjan" fill priority sizes="(max-width: 760px) 100vw, 60vw"/>
        <span className="catalog-image-banner-shade" aria-hidden="true"/>
        <span className="catalog-image-banner-copy"><small>MYBIGMARKET · CHINE → ABIDJAN</small><b>Des achats groupés, plus simples.</b><span>Parcourez les produits et comparez les conditions en FCFA.</span><i>Explorer le catalogue <ArrowRight size={15}/></i></span>
      </Link>
      <div className="catalog-image-banner-side">
        <Link className="catalog-image-banner catalog-image-banner-electronics" href="/produits?categorie=electronique">
          <span className="catalog-image-banner-copy"><small>TECH DU QUOTIDIEN</small><b>Électronique</b><i>Voir les produits <ArrowRight size={13}/></i></span>
          <Image src="/product-audio.jpg" alt="Accessoires audio du catalogue" fill sizes="(max-width: 760px) 45vw, 18vw"/>
        </Link>
        <Link className="catalog-image-banner catalog-image-banner-home" href="/produits?categorie=maison-cuisine">
          <span className="catalog-image-banner-copy"><small>MAISON & IDÉES UTILES</small><b>Pour votre espace</b><i>Découvrir <ArrowRight size={13}/></i></span>
          <Image src="/product-home.jpg" alt="Article pour la maison présenté dans le catalogue" fill sizes="(max-width: 760px) 45vw, 18vw"/>
        </Link>
      </div>
    </section>

    <section className="catalog-welcome-row" aria-label="Raccourcis d’achat">
      <h1>Bienvenue sur <span>mybigmarket</span></h1>
      <div><Link href="/demande-de-devis"><Tag size={15}/> Demander un devis</Link><i/><Link href="/compte/commandes"><Truck size={15}/> Suivre une commande</Link></div>
    </section>

    <section id="catalogue" className="catalog-feed" aria-labelledby="catalog-feed-title">
      <div className="catalog-feed-heading">
        <div><span className="eyebrow">SÉLECTION MYBIGMARKET</span><h2 id="catalog-feed-title">Produits à découvrir</h2><p>Une sélection de cinq produits maximum sur l’accueil.</p></div>
        <Link className="catalog-more-link" href="/produits">Voir tout le catalogue <ArrowRight size={15}/></Link>
      </div>
      <div className="catalog-filter-strip">
        <span className="catalog-result-count"><Boxes size={15}/>{featuredProducts.length} produit{featuredProducts.length === 1 ? "" : "s"} affiché{featuredProducts.length === 1 ? "" : "s"}</span>
        <span className="catalog-filter-note"><PackageCheck size={15}/> Délai estimé indiqué sur chaque fiche</span>
        <Link href="/produits" className="catalog-sort-link"><SlidersHorizontal size={15}/> Filtrer le catalogue</Link>
      </div>
      {featuredProducts.length ? <div className="catalog-home-featured-grid">{featuredProducts.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="catalog-empty"><h2>Le catalogue se prépare</h2><p>Revenez bientôt pour découvrir les prochaines offres.</p></div>}
      <div className="catalog-bottom-note"><Truck size={16}/><span>Prix, vendeurs, stocks et délais présentés à titre indicatif dans cette démonstration.</span><Link href="/demande-de-devis">Demander un devis <ArrowRight size={13}/></Link></div>
    </section>

    <div className="demo-note"><BadgeCheck size={15}/> Prototype : aucun paiement réel n’est traité et les demandes ne sont pas transmises sans backend configuré.</div>
  </main>;
}
