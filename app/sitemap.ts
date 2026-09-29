import type { MetadataRoute } from "next";
import { getCatalogProducts } from "@/lib/catalog";

export const dynamic="force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example";
  const staticPages = ["", "/produits", "/vendeurs", "/comment-ca-marche"];
  const products=await getCatalogProducts();
  return [
    ...staticPages.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: path === "" ? 1 : 0.7 })),
    ...products.map((product) => ({ url: `${base}/produits/${product.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
