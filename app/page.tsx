import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, BookOpen, ChevronRight, CircleDollarSign, PackageCheck, ShieldCheck, Sparkles, Truck, UserRound } from "lucide-react";
import { categories } from "@/lib/demo-data";
import { getCatalogProducts, getStoreSellers } from "@/lib/catalog";
import { ProductCard, SectionHeading } from "@/components/product-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [products, sellers] = await Promise.all([getCatalogProducts({ featured: true }), getStoreSellers()]);

  return <main className="shell page-space marketplace-home">
    <div className="marketplace-context-bar">
      <span><i className="announcement-dot"/> Précommandes ouvertes <b>Chine → Abidjan</b></span>
      <Link href="/comment-ca-marche">Comment fonctionne l’achat groupé ? <ArrowRight size={14}/></Link>
    </div>

    <section className="marketplace-hero-layout" aria-label="Découvrir mybigmarket">
      <aside className="market-category-panel">
        <div className="market-category-heading"><span>Explorer les catégories</span><Link href="/produits" aria-label="Voir tout le catalogue"><ChevronRight size={16}/></Link></div>
        <div className="market-category-list">
          {categories.map((category) => <Link href={`/produits?categorie=${category.slug}`} key={category.slug}>
            <span className="market-category-icon">{category.icon}</span><span className="market-category-copy"><b>{category.name}</b><small>{category.description}</small></span><ChevronRight size={15}/>
          </Link>)}
        </div>
        <div className="category-panel-bottom"><BadgeCheck size={16}/><span><b>Des vendeurs étudiants</b><small>Profils de démonstration, à vérifier avant lancement.</small></span></div>
      </aside>

      <div className="market-feature-column">
        <div className="hero-banner marketplace-hero-banner">
          <Image src="/hero-courier.jpg" alt="Colis et accessoires sélectionnés pour une commande groupée vers Abidjan" fill priority sizes="(max-width: 720px) 100vw, 58vw" className="hero-backdrop"/>
          <div className="hero-copy marketplace-hero-copy">
            <span className="hero-kicker">AFRIMARKETS · CHINE → CÔTE D’IVOIRE</span>
            <h1>Vos trouvailles de Chine,<br/><em>à plusieurs, jusqu’à Abidjan.</em></h1>
            <p>Découvrez des produits proposés en précommande et regroupez vos achats avec la communauté.</p>
            <div className="market-hero-actions"><Link className="button button-primary" href="/produits">Explorer les offres <ArrowRight size={16}/></Link><Link className="market-how-link" href="/comment-ca-marche">Voir les étapes</Link></div>
            <div className="hero-proof"><span><CircleDollarSign size={15}/> Prix en FCFA</span><i/><span><PackageCheck size={15}/> MOQ affiché</span><i/><span><Truck size={15}/> Suivi de commande</span></div>
          </div>
          <div className="hero-route-tag"><span>LOT GROUPÉ</span><b>Guangzhou <i>→</i> Abidjan</b></div>
        </div>
        <div className="market-promo-row">
          <Link href="/produits?categorie=mode-accessoires" className="market-promo market-promo-sand"><span>MODE & ACCESSOIRES</span><b>Les essentiels<br/>du quotidien</b><i>Découvrir <ArrowRight size={13}/></i></Link>
          <Link href="/produits?categorie=electronique" className="market-promo market-promo-blue"><span>HIGH-TECH</span><b>Les trouvailles<br/>connectées</b><i>Voir les produits <ArrowRight size={13}/></i></Link>
          <Link href="/produits?categorie=maison-cuisine" className="market-promo market-promo-peach"><span>MAISON & BEAUTÉ</span><b>De nouvelles idées<br/>pour chez vous</b><i>Explorer <ArrowRight size={13}/></i></Link>
        </div>
      </div>

      <aside className="buyer-toolbox">
        <div className="buyer-toolbox-welcome"><span className="buyer-avatar"><UserRound size={19}/></span><div><b>Bienvenue chez mybigmarket</b><small>Votre espace d’achat en Côte d’Ivoire</small></div></div>
        <p className="buyer-toolbox-copy">Retrouvez vos commandes et découvrez les nouveautés proposées en précommande.</p>
        <Link href="/inscription" className="button button-primary buyer-signup">Créer mon compte <ArrowRight size={15}/></Link>
        <Link href="/connexion" className="buyer-login">J’ai déjà un compte</Link>
        <div className="buyer-tool-divider"><span>Raccourcis acheteur</span></div>
        <Link className="buyer-tool-link" href="/compte/commandes"><PackageCheck size={16}/><span><b>Suivre une commande</b><small>Consulter les étapes du colis</small></span><ChevronRight size={14}/></Link>
        <Link className="buyer-tool-link" href="/comment-ca-marche"><BookOpen size={16}/><span><b>Guide d’achat</b><small>Comprendre les précommandes</small></span><ChevronRight size={14}/></Link>
        <div className="buyer-tip"><Sparkles size={15}/><span>Vérifiez le MOQ et le délai estimé sur chaque fiche produit.</span></div>
      </aside>
    </section>

    <section className="market-benefits" aria-label="Repères d’achat">
      <div><span className="benefit-icon"><PackageCheck size={17}/></span><p><b>Lots et minimum affichés</b><small>Consultez la quantité minimale avant de commander.</small></p></div>
      <div><span className="benefit-icon"><CircleDollarSign size={17}/></span><p><b>Prix en XOF / FCFA</b><small>Les prix catalogue sont faciles à comparer.</small></p></div>
      <div><span className="benefit-icon"><Truck size={17}/></span><p><b>De Chine à Abidjan</b><small>Retrouvez les étapes de commande sur votre compte.</small></p></div>
    </section>

    <section className="buying-paths">
      <div className="buying-paths-heading"><span className="eyebrow">DEUX FAÇONS D’ACHETER</span><h2>Choisissez votre parcours</h2></div>
      <Link href="/produits" className="buying-path-card buying-path-group"><span className="buying-path-number">01</span><span><b>Précommande groupée</b><small>Ajoutez les articles au panier en respectant leur quantité minimum.</small></span><ArrowRight size={17}/></Link>
      <Link href="/demande-de-devis" className="buying-path-card buying-path-wholesale"><span className="buying-path-number">02</span><span><b>Achat de gros · devis</b><small>Décrivez votre besoin ou demandez un prix de volume au vendeur.</small></span><ArrowRight size={17}/></Link>
    </section>

    <section className="content-section marketplace-products-section">
      <SectionHeading eyebrow="SÉLECTION DU MOMENT" title="À découvrir en précommande" description="Parcourez les offres et consultez les conditions de chaque lot." href="/produits" action="Tout le catalogue"/>
      <div className="product-grid">{products.slice(0, 8).map((product) => <ProductCard key={product.slug} product={product}/>)}</div>
      <div className="catalog-cta"><Link className="button button-outline" href="/produits">Parcourir toutes les catégories <ArrowRight size={16}/></Link></div>
    </section>

    <section className="group-order-banner">
      <div className="group-order-mark"><PackageCheck size={22}/></div>
      <div><span className="eyebrow">L’ACHAT GROUPÉ, EN TOUTE CLARTÉ</span><h2>Le bon produit. Le bon lot. Le suivi à chaque étape.</h2><p>Chaque fiche indique le minimum de commande et le délai estimé. Consultez notre guide avant de précommander.</p></div>
      <Link className="button button-outline" href="/comment-ca-marche">Comprendre le fonctionnement <ArrowRight size={15}/></Link>
    </section>

    <section className="content-section sellers-section"><SectionHeading eyebrow="VENDEURS PRÉSENTS EN CHINE" title="Rencontrez les vendeurs" description="Les profils et avis visibles dans cette version sont des données de démonstration." href="/vendeurs" action="Voir tous les profils"/><div className="seller-grid">{sellers.map((seller, i) => <Link className="seller-card" key={seller.slug} href={`/vendeurs/${seller.slug}`}><div className={`seller-avatar avatar-${i}`}>{seller.initials}</div><div><b>{seller.name}<BadgeCheck size={14} fill="#e9f5ec"/></b><small>{seller.university}</small><span><span className="star">★</span> {seller.rating.toFixed(1)} <i>·</i> {seller.city}</span></div><ArrowRight size={16}/></Link>)}</div></section>

    <div className="demo-note"><ShieldCheck size={16}/> Prototype de démonstration : les vendeurs, évaluations, produits et commandes affichés ne sont pas des données commerciales réelles. Aucun paiement réel n’est traité.</div>
  </main>;
}
