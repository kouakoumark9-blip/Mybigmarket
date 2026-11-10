import type { Metadata } from "next";
import { CatalogView } from "@/components/shop/catalog-view";
import type { RawParams } from "@/lib/shop/search-params";

export const revalidate = 60;
export const metadata: Metadata = {
  title: { absolute: "Promotions à Abidjan : climatiseurs, électroménager, TV | MyBigMarket" },
  description: "Les produits en promotion chez MyBigMarket, avec ancien prix barré. Livraison à Abidjan et en Côte d'Ivoire, paiement par mobile money.",
  alternates: { canonical: "/promotions" },
};

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <CatalogView basePath="/promotions" title="Promotions" intro="Les produits dont le prix a baissé, avec l'ancien prix barré." crumbs={[{ label: "Accueil", href: "/" }, { label: "Promotions" }]} params={await searchParams} flag="promo"/>
  </div>;
}
