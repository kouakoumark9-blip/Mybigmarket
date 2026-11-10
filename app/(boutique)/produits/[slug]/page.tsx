import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getPdpProduct } from "@/lib/pdp/get-product";
import { listOpenPaymentMethodCodes } from "@/lib/payments-open";
import { getPublishedReviewsForSlug } from "@/lib/reviews";
import { ProductDetailPage } from "@/components/product-detail/product-page";
import "@/components/product-detail/pdp.css";
import { db } from "@/server/core/db";
import { resolveProductRedirect } from "@/server/modules/storefront/service";

type Props = { params: Promise<{ slug: string }> };
// Page mise en cache puis rafraîchie toutes les minutes : la fiche s'affiche instantanément, prix et stock restent à jour à la minute près.
export const revalidate = 60;
// Aucune fiche n'est préparée à la construction : chaque fiche est créée à la première visite puis gardée en cache.
export function generateStaticParams() { return []; }

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPdpProduct(slug);
  if (!payload) return { title: "Produit introuvable", robots: { index: false } };
  const { product } = payload;
  const url = `${siteUrl()}/produits/${product.slug}`;
  return {
    title: product.title.length > 70 ? `${product.title.slice(0, 67).trimEnd()}…` : product.title,
    description: product.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: product.title, description: product.metaDescription, url, type: "website", images: product.images[0] && !product.images[0].src.endsWith(".svg") ? [{ url: product.images[0].src, alt: product.images[0].alt }] : undefined },
  };
}

/** Ancienne URL (slug modifié) ou produit désactivé avec redirection configurée. */
async function redirectTarget(slug: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await resolveProductRedirect(db(), slug);
  } catch {
    return null; // base non migrée ou indisponible : page introuvable classique
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const payload = await getPdpProduct(slug);
  if (!payload) {
    const target = await redirectTarget(slug);
    if (target) (target.permanent ? permanentRedirect : redirect)(target.location);
    notFound();
  }
  const { product, cartItem } = payload;
  const [publishedReviews, paymentMethods] = await Promise.all([getPublishedReviewsForSlug(product.slug), listOpenPaymentMethodCodes()]);
  const paymentsOpen = paymentMethods.length > 0;
  const url = `${siteUrl()}/produits/${product.slug}`;
  const reviewCount = product.reviews.count + publishedReviews.length;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.metaDescription,
    sku: product.id,
    image: product.images.map((image) => `${siteUrl()}${image.src}`),
    category: product.category.label,
    brand: { "@type": "Brand", name: product.supplier.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: product.currency,
      lowPrice: product.priceMin,
      highPrice: product.priceMax,
      offerCount: Math.max(1, product.colorVariants.length),
      availability: `https://schema.org/${product.availability}`,
      url,
    },
    ...(reviewCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount, bestRating: 5, worstRating: 1 } } : {}),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [...product.breadcrumb, { label: product.title, href: `/produits/${product.slug}` }].map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.label, item: `${siteUrl()}${item.href}` })),
  };
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

  return <>
    <ProductDetailPage product={product} cartItem={cartItem} publishedReviews={publishedReviews} paymentsOpen={paymentsOpen} paymentMethods={paymentMethods}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(productJsonLd) }}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(breadcrumbJsonLd) }}/>
  </>;
}
