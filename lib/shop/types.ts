export type ShopCategory = {
  id: number; name: string; slug: string; parentId: number | null; imageUrl: string | null; sortOrder: number;
  metaTitle: string | null; metaDescription: string | null; introText: string | null; bodyText: string | null;
  faq: Array<{ question: string; answer: string }>;
  children: ShopCategory[];
};

export type ShopProduct = {
  id: string; slug: string; title: string; shortDescription: string | null;
  priceXof: number; comparePriceXof: number | null; discountPercent: number;
  quantity: number; availability: string; leadTimeDays: number; availabilityLabel: string; inStock: boolean;
  badge: string | null; isBestSeller: boolean; isPlaceholder: boolean;
  powerLabel: string | null; energyClass: string | null; brand: string | null;
  image: string | null; categoryName: string; categorySlug: string; createdAt: Date | string;
};

export type ProductSort = "pertinence" | "prix-croissant" | "prix-decroissant" | "nouveautes";
export type ProductFilters = {
  categoryIds?: number[]; q?: string; brand?: string; power?: string; minPrice?: number; maxPrice?: number;
  stock?: "in_stock" | "on_order"; sort?: ProductSort; page?: number; pageSize?: number;
  flag?: "best" | "promo"; limit?: number; slugs?: string[];
};
