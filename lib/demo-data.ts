/**
 * Format de produit partagé par le panier, les favoris et la fiche produit.
 * Les produits viennent de la base de données (voir lib/catalog.ts) : aucun produit n'est écrit ici.
 */
export type DemoProduct = {
  slug: string; title: string; priceXof: number; minimumQuantity: number; leadTimeDays: number;
  category: string; categorySlug: string; seller: string; sellerSlug: string; university: string;
  city: string; rating: number; reviewCount: number; icon: string; tone: string; quantity: number; imageUrl?: string; description?: string;
  /** Réservé : un produit marqué ainsi est refusé au panier. */
  isDemo?: boolean;
  /** Boutique MyBigMarket : ancien prix, disponibilité, caractéristiques. */
  comparePriceXof?: number | null; availability?: string; availabilityLabel?: string; powerLabel?: string | null;
  energyClass?: string | null; badge?: string | null; isPlaceholder?: boolean; shortDescription?: string | null;
  brandName?: string | null; categoryTrail?: Array<{ label: string; href: string }>; extraAttributes?: Array<{ label: string; value: string }>; images?: string[];
  tiers?: Array<{ minQuantity: number; maxQuantity: number | null; unitPriceXof: number; label: string }>;
};

/** Texte de secours quand un produit n'a pas encore de description. */
export function getProductDescription(product: Pick<DemoProduct, "title" | "category" | "description">): string {
  return product.description?.trim() || `${product.title} : produit de la catégorie ${product.category}. Écrivez-nous sur WhatsApp pour toute question avant de commander.`;
}
