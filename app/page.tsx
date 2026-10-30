import Link from "next/link";
import { ArrowDownWideNarrow, ArrowRight, BadgeCheck, Boxes, CircleHelp, PackageCheck, SlidersHorizontal, Truck } from "lucide-react";
import { categories } from "@/lib/demo-data";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const products = await getCatalogProducts();
  // Mix categories so the first screen feels like a broad marketplace, not a single-vendor catalogue.
  const byCategory = categories.map((category) => products.filter((product) => product.categorySlug === category.slug));
  const mixedProducts = Array.from({ length: Math.max(0, ...byCategory.map((group) => group.length)) }, (_, index) => byCategory.flatMap((group) => group[index] ? [group[index]] : [])).flat();

  return <main className="shell marketplace-home marketplace-catalog-home">
    <div className="marketplace-context-bar catalog-context">
      <span><i className="announcement-dot"/> Précommandes ouvertes <b>Chine <span>→</span> Abidjan</b></span>
      <div className="market-context-links"><span className="country-context">🇨🇮 Côte d’Ivoire · XOF / FCFA</span><Link href="/comment-ca-marche">Comment ça marche ? <ArrowRight size={14}/></Link></div>
    </div>

    <nav className="catalog-category-nav" aria-label="Catégories de produits">
      <Link className="catalog-category-all" href="/produits"><SlidersHorizontal size={15}/> Tous les produits</Link>
      {categories.map((category) => <Link key={category.slug} href={`/produits?categorie=${category.slug}`}><span>{category.icon}</span>{category.name}</Link>)}
      <Link href="/demande-de-devis">Achats de gros · devis</Link>
      <Link href="/vendeur">Vendre sur mybigmarket</Link>
    </nav>

    <section className="catalog-feed" aria-labelledby="catalog-feed-title">
      <div className="catalog-feed-heading">
        <div><span className="eyebrow">SÉLECTION DU MOMENT</span><h1 id="catalog-feed-title">À découvrir</h1><p>Des trouvailles proposées en précommande, expédiées de Chine vers Abidjan.</p></div>
        <Link className="catalog-more-link" href="/produits">Voir tout le catalogue <ArrowRight size={15}/></Link>
      </div>
      <div className="catalog-filter-strip">
        <span className="catalog-result-count"><Boxes size={15}/>{products.length} produits</span>
        <span className="catalog-filter-note"><PackageCheck size={15}/> Quantité minimale affichée sur chaque offre</span>
        <Link href="/produits" className="catalog-sort-link"><ArrowDownWideNarrow size={15}/> Explorer les filtres</Link>
      </div>
      {products.length ? <div className="product-grid catalog-inspired-grid">{mixedProducts.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="catalog-empty"><h2>Le catalogue se prépare</h2><p>Revenez bientôt pour découvrir les prochaines offres.</p></div>}
      <div className="catalog-bottom-note"><Truck size={16}/><span>Les délais affichés sont estimatifs. Les vendeurs et offres de cette version sont des exemples de démonstration.</span><Link href="/comment-ca-marche">En savoir plus <ArrowRight size={13}/></Link></div>
    </section>

    <section className="catalog-help-row">
      <div><CircleHelp size={18}/><span><b>Première commande ?</b><small>Consultez le guide pour comprendre les précommandes et le transport.</small></span></div>
      <Link href="/comment-ca-marche">Voir les étapes <ArrowRight size={14}/></Link>
    </section>
    <div className="demo-note"><BadgeCheck size={15}/> Prototype : vendeurs, avis et offres visibles à titre illustratif. Aucun paiement réel n’est traité.</div>
  </main>;
}
