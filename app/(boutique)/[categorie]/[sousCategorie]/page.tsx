import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { breadcrumbJsonLd } from "@/components/shop/breadcrumbs";
import { CatalogView } from "@/components/shop/catalog-view";
import { SHOP } from "@/lib/shop/config";
import { categoryIdsOf, getCategoryByPath } from "@/lib/shop/queries";
import { hasActiveFilters, type RawParams } from "@/lib/shop/search-params";

export const revalidate = 60;
type Props = { params: Promise<{ categorie: string; sousCategorie: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { categorie, sousCategorie } = await params;
  const found = await getCategoryByPath(`${categorie}/${sousCategorie}`);
  if (!found) return { title: "Page introuvable", robots: { index: false } };
  const { category } = found;
  const title = category.metaTitle || `${category.name} à Abidjan | MyBigMarket`;
  const description = category.metaDescription || `${category.name} à Abidjan et en Côte d'Ivoire. Prix en FCFA, paiement à la livraison.`;
  return { title: { absolute: title }, description, alternates: { canonical: `/${category.slug}` }, robots: hasActiveFilters(await searchParams) ? { index: false, follow: true } : undefined, openGraph: { title, description, locale: "fr_CI", type: "website" } };
}

export default async function SubCategoryPage({ params, searchParams }: Props) {
  const { categorie, sousCategorie } = await params;
  const found = await getCategoryByPath(`${categorie}/${sousCategorie}`);
  if (!found?.parent) notFound();
  const { category, parent } = found;
  const crumbs = [{ label: "Accueil", href: "/" }, { label: parent.name, href: `/${parent.slug}` }, { label: category.name, href: `/${category.slug}` }];
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs, SHOP.baseUrl)) }}/>
    <CatalogView basePath={`/${category.slug}`} title={category.name} intro={category.introText} crumbs={crumbs} params={await searchParams} categoryIds={categoryIdsOf(category)} body={category.bodyText} faq={category.faq}/>
  </div>;
}
