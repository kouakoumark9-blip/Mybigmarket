import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Clock3, MapPin, PackageCheck, ShieldCheck, Star } from "lucide-react";
import { formatXof, getProductDescription } from "@/lib/demo-data";
import { getCatalogProduct, getCatalogProducts } from "@/lib/catalog";
import { ProductVisual, ProductCard } from "@/components/product-card";
import { ProductDetailActions } from "@/components/product-detail-actions";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) return { title: "Produit introuvable" };
  return { title: product.title, description: getProductDescription(product) };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) notFound();
  const productDescription = getProductDescription(product);
  const allProducts = await getCatalogProducts();
  const related = allProducts.filter((item) => item.categorySlug === product.categorySlug && item.slug !== product.slug).slice(0, 4);
  const baseUrl=process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example";
  const productUrl=`${baseUrl}/produits/${product.slug}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.title, description: productDescription, sku: product.slug, category: product.category, offers: { "@type": "Offer", priceCurrency: "XOF", price: product.priceXof, availability: "https://schema.org/PreOrder", url: productUrl }, aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount } };
  const breadcrumbJsonLd={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":baseUrl},{"@type":"ListItem","position":2,"name":product.category,"item":`${baseUrl}/produits?categorie=${product.categorySlug}`},{"@type":"ListItem","position":3,"name":product.title,"item":productUrl}]};
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href={`/produits?categorie=${product.categorySlug}`}>{product.category}</Link><span>›</span><span>{product.title}</span></div>
    <div className="product-detail-grid"><div className="detail-visual"><ProductVisual product={product}/></div><section className="detail-panel"><div className="detail-category">{product.category}</div><h1>{product.title}</h1><div className="detail-rating"><Star size={14} fill="currentColor"/> {product.rating.toFixed(1)} <span>({product.reviewCount} avis · avis de démonstration)</span></div><div className="detail-price">{formatXof(product.priceXof)}</div><div className="detail-price-note">Prix catalogue indicatif par unité · disponibilité et conditions à confirmer</div><div className="detail-facts"><div><PackageCheck/><span>Précommande groupée</span></div><div className="delivery-estimate"><Clock3/><span>Délai estimé : 30 j</span></div><div><MapPin/><span>Départ : {product.city}, Chine</span></div><div><ShieldCheck/><span>Paiement suivi à la commande</span></div></div><div className="detail-seller"><div className="seller-avatar">{product.seller.split(" ").map((part) => part[0]).join("")}</div><div><b>{product.seller} <BadgeCheck size={14} fill="#fff3e5"/></b><small>{product.university} · vendeur vérifié (démo)</small></div></div><ProductDetailActions product={product}/><div className="detail-help">Quantité minimum à respecter : {product.minimumQuantity}. Aucun paiement réel n’est activé dans cette version de démonstration.</div></section></div>
    <section className="product-description-panel" aria-labelledby="product-description-title"><div className="product-description-top"><div><span className="eyebrow">INFORMATIONS PRODUIT</span><h2 id="product-description-title">Description du produit</h2></div><p>{productDescription}</p></div><div className="product-description-details"><div><span>Catégorie</span><b>{product.category}</b></div><div><span>Commande minimale</span><b>{product.minimumQuantity} unité{product.minimumQuantity > 1 ? "s" : ""}</b></div><div className="delivery-estimate-fact"><span>Délai estimé :</span><b>30 j</b></div><div><span>Vendeur</span><b>{product.seller} · {product.city}</b></div></div><div className="product-description-note"><ShieldCheck size={17}/><span>Avant de valider, demandez au vendeur de confirmer les variantes, dimensions, matériaux, éléments inclus et conditions de livraison. Cette fiche contient des données de démonstration.</span></div></section>
    <section className="content-section related-section"><div className="section-heading"><div><span className="eyebrow">DANS LE MÊME RAYON</span><h2>Vous aimerez aussi</h2></div><Link className="text-link" href={`/produits?categorie=${product.categorySlug}`}>Tout voir</Link></div><div className="catalog-grid">{related.map((item) => <ProductCard key={item.slug} product={item}/>)}</div></section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}/>
  </main>;
}
