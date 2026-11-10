import type { DemoProduct } from "@/lib/demo-data";
import type { ShopProduct } from "./types";

/** Produit de la vitrine → ligne de panier (le panier garde le même format que la fiche produit). */
export function toCartProduct(product: ShopProduct): DemoProduct {
  return {
    slug: product.slug, title: product.title, priceXof: product.priceXof, leadTimeDays: product.leadTimeDays,
    category: product.categoryName, categorySlug: product.categorySlug, seller: "MyBigMarket", sellerSlug: "mybigmarket",
    university: "Boutique en ligne", city: "Abidjan", rating: 0, reviewCount: 0, icon: "", tone: "sand",
    quantity: product.quantity, imageUrl: product.image ?? undefined,
    availability: product.availability, availabilityLabel: product.availabilityLabel, isPlaceholder: product.isPlaceholder,
  };
}
