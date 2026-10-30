import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Boxes, CircleHelp, House, MapPin, PackageCheck, Search, Shirt, Smartphone, SlidersHorizontal, Tag, Truck, type LucideIcon } from "lucide-react";
import { categories, formatXof } from "@/lib/demo-data";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard, ProductVisual } from "@/components/product-card";

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
  const featuredProducts = mixedProducts.slice(0, 3);
  const categoryGroups = categories.map((category) => ({ category, items: products.filter((product) => product.categorySlug === category.slug) }));

  return <main className="shell marketplace-home marketplace-catalog-home">
    <div className="marketplace-context-bar catalog-context">
      <span>Parcours de précommande <b>Chine <span>→</span> Abidjan</b></span>
      <div className="market-context-links"><span className="country-context"><MapPin size={13}/> Côte d’Ivoire · XOF / FCFA</span><Link href="/comment-ca-marche">Guide d’achat <ArrowRight size={14}/></Link></div>
    </div>

    <section className="catalog-search-hero" aria-label="Rechercher et explorer">
      <nav className="catalog-mode-tabs" aria-label="Explorer mybigmarket">
        <Link className="is-active" href="/produits">Produits</Link>
        <Link href="/vendeurs">Vendeurs</Link>
        <Link href="/demande-de-devis">Achats de gros</Link>
      </nav>
      <form action="/produits" className="catalog-search-bar" role="search">
        <div className="catalog-search-input"><Search size={20}/><input name="q" aria-label="Rechercher dans le catalogue" placeholder="Que recherchez-vous ? Ex. sacs, téléphones, maison…"/></div>
        <div className="catalog-search-submit-row"><span><PackageCheck size={15}/> Prix en FCFA · Minimum de commande indiqué sur les offres</span><button type="submit">Rechercher <ArrowRight size={16}/></button></div>
      </form>
    </section>

    <section className="catalog-image-banners" aria-label="Explorer les univers mybigmarket">
      <Link className="catalog-image-banner catalog-image-banner-main" href="/produits">
        <Image src="/hero-courier.jpg" alt="Colis et accessoires sélectionnés pour des achats entre la Chine et Abidjan" fill priority sizes="(max-width: 760px) 100vw, 70vw"/>
        <span className="catalog-image-banner-shade" aria-hidden="true"/>
        <span className="catalog-image-banner-copy"><small>MYBIGMARKET · CHINE → ABIDJAN</small><b>Des trouvailles utiles, simplement.</b><span>Parcourez le catalogue et comparez les offres en FCFA.</span><i>Explorer le catalogue <ArrowRight size={15}/></i></span>
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

    <section className="catalog-welcome-row" aria-label="Bienvenue">
      <h1>Bienvenue sur <span>mybigmarket</span></h1>
      <div><Link href="/demande-de-devis"><Tag size={15}/> Demander un devis</Link><i/><Link href="/comment-ca-marche"><PackageCheck size={15}/> Comprendre les précommandes</Link><i/><Link href="/compte/commandes"><Truck size={15}/> Suivre une commande</Link></div>
    </section>

    <section className="catalog-discovery-layout" aria-label="Explorer le catalogue">
      <aside className="catalog-category-index">
        <div className="catalog-index-heading"><b>Parcourir les catégories</b><Link href="/produits" aria-label="Voir toutes les catégories"><ArrowRight size={15}/></Link></div>
        {categories.map((category) => { const CategoryIcon = categoryIcons[category.slug] ?? Boxes; return <Link className="catalog-index-item" key={category.slug} href={`/produits?categorie=${category.slug}`}><CategoryIcon size={18} strokeWidth={1.7}/><span><b>{category.name}</b><small>{category.description}</small></span><ArrowRight className="catalog-index-arrow" size={14}/></Link>; })}
        <Link className="catalog-index-all" href="/produits">Tous les produits <ArrowRight size={14}/></Link>
      </aside>

      <div className="catalog-picks-panel">
        <div className="catalog-picks-heading"><div><span className="eyebrow">À EXPLORER</span><h2>Des idées pour votre prochaine commande</h2></div><Link href="/produits">Tout voir <ArrowRight size={14}/></Link></div>
        <div className="catalog-picks-grid">
          {featuredProducts.map((product) => <Link className="catalog-pick-card" key={product.slug} href={`/produits/${product.slug}`}>
            <div className="catalog-pick-visual"><ProductVisual product={product}/></div>
            <span className="catalog-pick-category">{product.category}</span>
            <b>{product.title}</b>
            <strong>{formatXof(product.priceXof)}</strong>
          </Link>)}
        </div>
      </div>

      <aside className="catalog-volume-card">
        <div className="catalog-volume-photo"><Image src="/product-home.jpg" alt="Lampe de bureau proposée dans le catalogue" fill sizes="(max-width: 760px) 100vw, 280px"/></div>
        <div className="catalog-volume-copy">
          <span className="eyebrow">ACHAT EN QUANTITÉ</span>
          <h2>Un besoin spécifique ?</h2>
          <p>Décrivez les produits et volumes recherchés pour préparer une demande de devis.</p>
          <Link href="/demande-de-devis">Demander un devis <ArrowRight size={15}/></Link>
          <small>Démo : la demande n’est pas transmise au vendeur sans backend actif.</small>
        </div>
      </aside>
    </section>

    <section id="catalogue" className="catalog-feed" aria-labelledby="catalog-feed-title">
      <div className="catalog-feed-heading">
        <div><span className="eyebrow">CATALOGUE MYBIGMARKET</span><h2 id="catalog-feed-title">Des produits par catégorie</h2><p>Explorez les rayons et comparez les offres disponibles.</p></div>
        <Link className="catalog-more-link" href="/produits">Voir tout le catalogue <ArrowRight size={15}/></Link>
      </div>
      <div className="catalog-filter-strip">
        <span className="catalog-result-count"><Boxes size={15}/>{products.length} produits</span>
        <span className="catalog-filter-note"><PackageCheck size={15}/> Minimum de commande indiqué</span>
        <Link href="/produits" className="catalog-sort-link"><SlidersHorizontal size={15}/> Filtrer le catalogue</Link>
      </div>
      {products.length ? <div className="catalog-category-groups">{categoryGroups.map(({ category, items }, index) => <div className="catalog-category-group-wrap" key={category.slug}><section className="catalog-category-section" aria-labelledby={`category-${category.slug}`}><div className="catalog-category-section-heading"><div><span className="eyebrow">{items.length} PRODUITS</span><h3 id={`category-${category.slug}`}>{category.name}</h3><p>{category.description}</p></div><Link className="catalog-more-link" href={`/produits?categorie=${category.slug}`}>Voir tout <ArrowRight size={14}/></Link></div>{items.length ? <div className="product-grid catalog-inspired-grid catalog-category-product-grid">{items.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="catalog-empty"><p>De nouvelles offres seront bientôt ajoutées à ce rayon.</p></div>}</section>{index < categoryGroups.length - 1 && <Link className={`catalog-category-interstitial ${index === 0 ? "interstitial-electronics" : "interstitial-home"}`} href={index === 0 ? "/produits?categorie=electronique" : "/produits?categorie=maison-cuisine"}><Image src={index === 0 ? "/products/tech-keyboard.jpg" : "/products/home-kettle.jpg"} alt="" fill sizes="(max-width: 760px) 100vw, 1260px"/><span className="catalog-category-interstitial-copy"><small>{index === 0 ? "À DÉCOUVRIR · HIGH-TECH" : "À DÉCOUVRIR · MAISON & BEAUTÉ"}</small><b>{index === 0 ? "Les bons accessoires pour rester connecté." : "De nouvelles idées pour votre intérieur."}</b><span>Découvrir la sélection <ArrowRight size={14}/></span></span></Link>}</div>)}</div> : <div className="catalog-empty"><h2>Le catalogue se prépare</h2><p>Revenez bientôt pour découvrir les prochaines offres.</p></div>}
      <div className="catalog-bottom-note"><Truck size={16}/><span>Délais indicatifs. Les offres et vendeurs affichés ici sont des exemples de démonstration.</span><Link href="/comment-ca-marche">En savoir plus <ArrowRight size={13}/></Link></div>
    </section>

    <section className="catalog-help-row"><div><CircleHelp size={18}/><span><b>Première commande ?</b><small>Consultez le guide pour comprendre les précommandes et le transport.</small></span></div><Link href="/comment-ca-marche">Voir les étapes <ArrowRight size={14}/></Link></section>
    <div className="demo-note"><BadgeCheck size={15}/> Prototype : vendeurs, avis et offres visibles à titre illustratif. Aucun paiement réel n’est traité.</div>
  </main>;
}
