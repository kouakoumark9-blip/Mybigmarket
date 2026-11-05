import type { MetadataRoute } from "next";
import { getCatalogProducts } from "@/lib/catalog";
import { db } from "@/server/core/db";
import { publishedPages } from "@/server/modules/cms/service";

export const dynamic="force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example";
  const staticPages = ["", "/produits"];
  const products=await getCatalogProducts();
  // Pages CMS publiées (étape 6) ; base absente ou non migrée : sitemap sans elles.
  const pages = process.env.DATABASE_URL ? await publishedPages(db()).catch(() => []) : [];
  return [
    ...staticPages.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: path === "" ? 1 : 0.7 })),
    ...products.map((product) => ({ url: `${base}/produits/${product.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...pages.map((page) => ({ url: `${base}/pages/${page.slug}`, lastModified: page.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
