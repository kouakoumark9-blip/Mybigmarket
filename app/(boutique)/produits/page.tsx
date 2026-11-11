import type { Metadata } from "next";
import { CatalogView } from "@/components/shop/catalog-view";
import { hasActiveFilters, type RawParams } from "@/lib/shop/search-params";

export const revalidate = 60;
export async function generateMetadata({ searchParams }: { searchParams: Promise<RawParams> }): Promise<Metadata> {
  return {
    title: { absolute: "Tous les produits à Abidjan | MyBigMarket" },
    description: "Tout le catalogue MyBigMarket : lits de toutes tailles, lits enfants, superposés, en bois ou en métal. Livraison en Côte d'Ivoire.",
    alternates: { canonical: "/produits" },
    // Résultats de recherche et pages filtrées : suivis par Google mais non indexés (évite les doublons).
    robots: hasActiveFilters(await searchParams) ? { index: false, follow: true } : undefined,
  };
}

export default async function AllProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <CatalogView basePath="/produits" title="Tous les produits" intro="Tout le catalogue MyBigMarket, livré à Abidjan et partout en Côte d'Ivoire." crumbs={[{ label: "Accueil", href: "/" }, { label: "Tous les produits" }]} params={await searchParams}/>
  </div>;
}
