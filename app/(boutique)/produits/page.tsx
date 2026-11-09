import type { Metadata } from "next";
import { CatalogView } from "@/components/shop/catalog-view";
import type { RawParams } from "@/lib/shop/search-params";

export const revalidate = 60;
export const metadata: Metadata = {
  title: { absolute: "Tous les produits à Abidjan | MyBigMarket" },
  description: "Tout le catalogue MyBigMarket : climatiseurs, groupes électrogènes, informatique, électroménager et téléviseurs. Livraison en Côte d'Ivoire.",
  alternates: { canonical: "/produits" },
};

export default async function AllProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <CatalogView basePath="/produits" title="Tous les produits" intro="Tout le catalogue MyBigMarket, livré à Abidjan et partout en Côte d'Ivoire." crumbs={[{ label: "Accueil", href: "/" }, { label: "Tous les produits" }]} params={await searchParams}/>
  </div>;
}
