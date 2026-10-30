import type { Metadata } from "next";
import { FavoritesPageContent } from "@/components/favorites-page-content";

export const metadata: Metadata = { title: "Mes favoris" };

export default function FavoritesPage() {
  return <FavoritesPageContent/>;
}
