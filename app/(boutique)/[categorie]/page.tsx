import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { breadcrumbJsonLd } from "@/components/shop/breadcrumbs";
import { CatalogView } from "@/components/shop/catalog-view";
import { InfoView } from "@/components/shop/info-view";
import { SHOP } from "@/lib/shop/config";
import { findInfoPage } from "@/lib/shop/pages";
import { categoryIdsOf, getCategoryByPath } from "@/lib/shop/queries";
import { hasActiveFilters, type RawParams } from "@/lib/shop/search-params";

export const revalidate = 60;
type Props = { params: Promise<{ categorie: string }>; searchParams: Promise<RawParams> };

/** Adresse propre à un seul segment : page d'information (/livraison) ou catégorie (/climatiseurs). */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { categorie } = await params;
  const info = findInfoPage(categorie);
  if (info) return { title: info.metaTitle, description: info.description, alternates: { canonical: `/${info.slug}` }, openGraph: { title: info.metaTitle, description: info.description, locale: "fr_CI", type: "website" } };
  const found = await getCategoryByPath(categorie);
  if (!found) return { title: "Page introuvable", robots: { index: false } };
  const { category } = found;
  const title = category.metaTitle || `${category.name} à Abidjan | MyBigMarket`;
  const description = category.metaDescription || `${category.name} à Abidjan et en Côte d'Ivoire. Prix en FCFA, paiement à la livraison.`;
  return { title: { absolute: title }, description, alternates: { canonical: `/${category.slug}` }, robots: hasActiveFilters(await searchParams) ? { index: false, follow: true } : undefined, openGraph: { title, description, locale: "fr_CI", type: "website" } };
}

export default async function CategoryOrInfoPage({ params, searchParams }: Props) {
  const { categorie } = await params;
  const info = findInfoPage(categorie);
  if (info) return <div className="mb-wrap mb-page" id="contenu" role="main"><InfoView page={info}/></div>;
  const found = await getCategoryByPath(categorie);
  if (!found) notFound();
  const { category } = found;
  const crumbs = [{ label: "Accueil", href: "/" }, { label: category.name, href: `/${category.slug}` }];
  const jsonLd = [breadcrumbJsonLd(crumbs, SHOP.baseUrl), ...(category.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: category.faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) }] : [])];
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    {jsonLd.map((item, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}/>)}
    <CatalogView basePath={`/${category.slug}`} title={category.name} intro={category.introText} crumbs={crumbs} params={await searchParams} categoryIds={categoryIdsOf(category)} subcategories={category.children} body={category.bodyText} faq={category.faq}/>
  </div>;
}
