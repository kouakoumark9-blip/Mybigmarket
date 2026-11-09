import type { MetadataRoute } from "next";
import { SHOP } from "@/lib/shop/config";

/** L'administration n'est pas citée ici (cela révélerait son adresse) : elle est protégée par noindex et par sa connexion. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/panier", "/commande", "/suivi-commande", "/favoris", "/api/"] }, sitemap: `${SHOP.baseUrl}/sitemap.xml` };
}
