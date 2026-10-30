import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, MapPin, Star, Store } from "lucide-react";
import { getPublicStorefrontBySlug, getStorefrontProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getPublicStorefrontBySlug(slug);
  return store ? { title: store.storeName, description: store.headline } : { title: "Boutique introuvable" };
}
export default async function PublicStorefrontPage({ params }: Props) {
  const { slug } = await params;
  const store = await getPublicStorefrontBySlug(slug);
  if (!store) notFound();
  const products = await getStorefrontProducts(store.sellerSlug);
  return <main className="shell page-space public-storefront-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/vendeurs">Vendeurs</Link><span>›</span><span>{store.storeName}</span></div>
    {store.announcement && <div className="storefront-announcement"><Store size={15}/>{store.announcement}</div>}
    <section className="public-storefront-hero"><div className="public-storefront-monogram">{store.storeName.slice(0, 2).toUpperCase()}</div><div className="public-storefront-copy"><span className="eyebrow">{store.isDemo ? "VITRINE DE DÉMONSTRATION" : "BOUTIQUE PARTENAIRE MYBIGMARKET"}</span><h1>{store.storeName} <BadgeCheck size={20}/></h1><h2>{store.headline}</h2><p>{store.description}</p><div className="public-storefront-meta"><span><MapPin size={14}/>{store.city}, Chine · {store.university}</span><span><Star size={14} fill="currentColor"/>{store.rating.toFixed(1)} · note indicative</span><span><Store size={14}/>{store.productCount} produit{store.productCount === 1 ? "" : "s"}</span></div></div></section>
    <div className="section-heading storefront-products-heading"><div><span className="eyebrow">CATALOGUE DE LA BOUTIQUE</span><h2>Produits disponibles</h2></div><span className="storefront-product-count">{products.length} offre{products.length === 1 ? "" : "s"}</span></div>
    {products.length ? <div className="catalog-grid">{products.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="cart-panel cart-empty"><Store size={31}/><h2>Aucun produit publié pour le moment</h2><p>Les annonces validées de ce vendeur apparaîtront ici.</p><Link className="button button-outline" href="/produits">Parcourir le catalogue</Link></div>}
    <div className="storefront-trust-note"><BadgeCheck size={16}/><span>Les fiches, avis et stocks doivent être vérifiés avant achat. Les données de cette page sont indicatives; modalités de transport Chine–Abidjan à confirmer.</span></div>
    <Link className="back-link" href="/vendeurs"><ArrowLeft size={15}/> Voir tous les vendeurs</Link>
  </main>;
}
