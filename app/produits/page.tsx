import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, PackageCheck } from "lucide-react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { CategoryDiscovery } from "@/components/category-discovery";
import { getCatalogProducts } from "@/lib/catalog";
import { categories } from "@/lib/demo-data";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ q?: string; categorie?: string; min?: string; max?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { categorie } = await searchParams;
  const category = categories.find((item) => item.slug === categorie);
  return { title: category ? `${category.name} · précommandes Chine–Abidjan` : "Catalogue · achats de gros Chine–Abidjan", description: category?.overview.join(" ") || "Comparez les produits pour vos achats de gros entre la Chine et Abidjan, Côte d’Ivoire. Prix indicatifs en FCFA, minimums et délais à confirmer." };
}

export default async function ProductsPage({ searchParams }: Props) {
  const [params, productRows] = await Promise.all([searchParams, getCatalogProducts()]);
  const activeCategory = categories.find((category) => category.slug === params.categorie);
  const title = activeCategory?.name || "Le catalogue mybigmarket";

  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>{activeCategory?.name || "Catalogue"}</span></div>
    <CategoryDiscovery products={productRows} activeCategorySlug={activeCategory?.slug || ""}/>
    <section className="catalog-intro-card">
      <div className="catalog-intro-copy"><span className="eyebrow">{activeCategory ? "DÉCOUVRIR LE RAYON" : "CATALOGUE · CHINE → CÔTE D’IVOIRE"}</span><h1 className="page-title">{title}</h1>
        <div className="catalog-intro-points"><span><PackageCheck size={16}/> MOQ et délai visibles</span><span><BadgeCheck size={16}/> Descriptions détaillées</span></div>
      </div>
    </section>
    <CatalogBrowser products={productRows} initialQuery={params.q || ""} initialCategory={params.categorie || ""} initialMin={params.min || ""} initialMax={params.max || ""}/>
  </main>;
}
