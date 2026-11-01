import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductCarousel } from "@/components/product/b2b/ProductCarousel";
import { ProductDetailSkeleton } from "@/components/product/b2b/ProductDetailSkeleton";
import { ProductDetailView } from "@/components/product/b2b/ProductDetailView";
import { getProductDetail, getRelatedProducts } from "@/lib/product-detail-data";
import { getProductShippingOptions } from "@/lib/product-shipping";
import "./product-detail.css";

export const dynamic = "force-dynamic";

/**
 * Fiche produit B2B.
 *
 * La page est un rendu pur : `getProductDetail` lit tout (produit, paliers,
 * variantes, attributs, emballage, délais, fournisseur, avis) en une fois, et
 * `null` déclenche un vrai 404 — pas une fiche de démonstration. Aucune donnée
 * n'est écrite en dur ici, y compris les libellés commerciaux de marque.
 */

type PageProps = { params: Promise<{ slug: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://mybigmarket.com";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let product = null;
  try {
    product = await getProductDetail(slug);
  } catch {
    // Base indisponible : on ne bloque pas les métadonnées, le rendu affichera l'erreur.
    return { title: "Produit indisponible | mybigmarket" };
  }
  if (!product) return { title: "Produit introuvable | mybigmarket", robots: { index: false, follow: false } };

  const description = (product.shortDescription || product.description || "").replace(/\s+/g, " ").slice(0, 158);
  const image = product.images[0]?.url;

  return {
    // Pas de suffixe manuel : le gabarit racine « %s | mybigmarket » l'ajoute.
    title: product.title,
    description: description || `${product.title} — achat en gros et demi-gros sur mybigmarket.`,
    alternates: { canonical: `${SITE_URL}/produits/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.title,
      description,
      url: `${SITE_URL}/produits/${product.slug}`,
      images: image ? [{ url: image, alt: product.images[0]?.alt || product.title }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  return <main className="b2b-page">
    <nav className="b2b-breadcrumb" aria-label="Fil d’Ariane">
      <Link href="/">Accueil</Link>
      <span aria-hidden="true">›</span>
      <Link href="/produits">Produits</Link>
      <Suspense fallback={null}>
        <BreadcrumbTail slug={slug} />
      </Suspense>
    </nav>

    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductDetailSection slug={slug} />
    </Suspense>
  </main>;
}

/** Fil d'Ariane : catégorie + titre, une fois le produit chargé. */
async function BreadcrumbTail({ slug }: { slug: string }) {
  const product = await getProductDetail(slug).catch(() => null);
  if (!product) return null;
  return <>
    <span aria-hidden="true">›</span>
    <Link href={`/produits?categorie=${encodeURIComponent(product.categorySlug)}`}>{product.categoryName}</Link>
    <span aria-hidden="true">›</span>
    <span className="b2b-breadcrumb-current" aria-current="page">{product.title}</span>
  </>;
}

async function ProductDetailSection({ slug }: { slug: string }) {
  const product = await getProductDetail(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product);

  // Port initial calculé côté serveur : le panneau s'affiche déjà rempli, sans
  // aller-retour réseau ni saut de mise en page à l'arrivée.
  const shipping = await getProductShippingOptions({
    countryCode: "CI",
    packages: [{
      lengthCm: Number(product.packaging?.lengthCm ?? 30),
      widthCm: Number(product.packaging?.widthCm ?? 20),
      heightCm: Number(product.packaging?.heightCm ?? 10),
      weightGrams: product.weightGrams,
      quantity: product.minimumQuantity,
    }],
    subtotalXof: (product.priceTiers[0]?.unitPriceXof ?? product.priceXof) * product.minimumQuantity,
    isFragile: product.packaging?.fragile ?? false,
    preference: "automatic",
  }).catch(() => ({ options: [], zoneName: null, available: false }));

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.shortDescription || product.description || undefined,
    image: product.images.map((image) => image.url).filter(Boolean),
    sku: product.slug,
    category: product.categoryName,
    brand: { "@type": "Brand", name: "mybigmarket" },
    offers: {
      "@type": "Offer",
      priceCurrency: "XOF",
      price: Math.min(...[product.priceXof, ...product.priceTiers.map((tier) => tier.unitPriceXof)]),
      url: `${SITE_URL}/produits/${product.slug}`,
      availability: product.quantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.supplier.name },
    },
    // Aucune note agrégée si la base ne contient aucun avis : un aggregateRating
    // fabriqué serait une donnée structurée mensongère.
    ...(product.reviewCount > 0 && product.reviewAverage !== null ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.reviewAverage,
        reviewCount: product.reviewCount,
      },
    } : {}),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Produits", item: `${SITE_URL}/produits` },
      { "@type": "ListItem", position: 3, name: product.categoryName, item: `${SITE_URL}/produits?categorie=${encodeURIComponent(product.categorySlug)}` },
      { "@type": "ListItem", position: 4, name: product.title, item: `${SITE_URL}/produits/${product.slug}` },
    ],
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

    <ProductDetailView product={product} initialShipping={shipping} />

    <ProductCarousel
      title="Produits recommandés"
      products={related.recommended}
      emptyLabel="Aucun produit recommandé pour l’instant."
    />
    <ProductCarousel
      title="Vous aimerez aussi"
      products={related.alternatives}
      emptyLabel="Aucune alternative publiée dans cette catégorie."
    />
  </>;
}
