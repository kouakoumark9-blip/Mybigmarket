import type { MetadataRoute } from "next";
import { SHOP } from "@/lib/shop/config";
import { INFO_PAGES } from "@/lib/shop/pages";
import { getCategoryTree, listAllProductSlugs } from "@/lib/shop/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tree, productList] = await Promise.all([getCategoryTree(), listAllProductSlugs()]);
  const base = SHOP.baseUrl;
  // Date de dernière modification honnête : celle du produit modifié le plus récemment (et non « maintenant » à chaque lecture).
  const now = productList.reduce((latest, product) => (product.updatedAt > latest ? product.updatedAt : latest), new Date(0));
  const lastChange = now.getTime() > 0 ? now : undefined;
  return [
    { url: base, lastModified: lastChange, changeFrequency: "daily", priority: 1 },
    { url: `${base}/produits`, lastModified: lastChange, changeFrequency: "daily", priority: 0.7 },
    ...tree.flatMap((category) => [category, ...category.children].map((item) => ({ url: `${base}/${item.slug}`, lastModified: lastChange, changeFrequency: "weekly" as const, priority: item.parentId ? 0.7 : 0.9 }))),
    ...productList.map((product) => ({ url: `${base}/produits/${product.slug}`, lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...INFO_PAGES.map((page) => ({ url: `${base}/${page.slug}`, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
