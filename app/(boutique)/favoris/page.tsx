import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shop/breadcrumbs";
import { FavoritesList } from "@/components/shop/favorites-list";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };

export default function FavoritesPage() {
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Mes favoris" }]}/>
    <h1 className="mb-title">Mes favoris</h1>
    <p className="mb-intro">Les produits que vous avez gardés de côté. Ils sont enregistrés dans ce navigateur.</p>
    <FavoritesList/>
  </div>;
}
