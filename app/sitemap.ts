import type { MetadataRoute } from "next";
import { SHOP } from "@/lib/shop/config";
import { INFO_PAGES } from "@/lib/shop/pages";
import { getCategoryTree, listAllProductSlugs } from "@/lib/shop/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tree, productList] = await Promise.all([getCategoryTree(), listAllProductSlugs()]);
  const base = SHOP.baseUrl;
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/produits`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/promotions`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...tree.flatMap((category) => [category, ...category.children].map((item) => ({ url: `${base}/${item.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: item.parentId ? 0.7 : 0.9 }))),
    ...productList.map((product) => ({ url: `${base}/produits/${product.slug}`, lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...INFO_PAGES.map((page) => ({ url: `${base}/${page.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
