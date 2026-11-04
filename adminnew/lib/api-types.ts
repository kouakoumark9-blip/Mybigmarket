/** Formes des réponses de l'API v1 utilisées par les écrans du back-office. */

export type CategoryNode = { id: number; name: string; slug: string; parentId: number | null; isActive: boolean; depth: number; productCount: number; children: CategoryNode[] };
export type Brand = { id: number; name: string; slug: string; isActive: boolean };
export type TaxGroup = { id: string; name: string; isActive: boolean; rules: Array<{ countryCode: string; label: string; ratePercent: number; isActive: boolean }> };
export type AttributeValue = { id: string; code: string; name: string; colorHex: string | null; textureUrl: string | null; position: number; isActive: boolean };
export type AttributeGroup = { id: string; code: string; name: string; displayType: string; position: number; isActive: boolean; values: AttributeValue[] };
export type Feature = { id: string; code: string; name: string; position: number; isActive: boolean; values: Array<{ id: string; value: string; position: number }> };
export type Warehouse = { id: string; code: string; name: string; countryCode: string; city: string | null; address: string | null; isActive: boolean; isDefault: boolean; isSellable: boolean; position: number; totals?: { physical: number; reserved: number; stockLines: number } };

export type ProductListItem = { id: string; title: string; slug: string; reference: string | null; sku: string | null; status: string; productType: string; visibility: string; priceXof: number; quantity: number; categoryId: number; brandId: number | null; isFeatured: boolean; coverUrl: string | null; updatedAt: string };

export type Combination = {
  id: number; name: string; value: string; sku: string | null; ean13: string | null; priceDeltaXof: number; weightImpactGrams: number; minimumQuantity: number | null; lowStockThreshold: number;
  quantity: number; isDefault: boolean; isActive: boolean; position: number; imageIds: number[];
  attributes: Array<{ groupCode: string; groupName: string; valueId: string; valueName: string; colorHex: string | null }>;
};

export type ProductDetail = {
  id: string; title: string; slug: string; reference: string | null; sku: string | null; shortDescription: string | null; description: string; internalNote: string | null;
  sellerId: string; categoryId: number; brandId: number | null; supplierId: string | null; taxRuleGroupId: string | null;
  productType: "standard" | "pack" | "virtual"; condition: "new" | "used" | "refurbished"; visibility: "everywhere" | "catalog" | "search" | "nowhere"; status: string;
  availableForOrder: boolean; showPrice: boolean; isFeatured: boolean; allowReviews: boolean;
  priceXof: number; purchasePriceXof: number | null; ecotaxXof: number; unitPriceXof: number | null; unitLabel: string | null;
  minimumQuantity: number; lowStockThreshold: number; leadTimeDays: number; deliveryTimeDays: number | null; outOfStockBehavior: "refuse" | "backorder" | "use_default";
  ean13: string | null; upc: string | null; isbn: string | null; mpn: string | null; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number;
  seoTitle: string | null; seoDescription: string | null; canonicalPath: string | null; redirectType: "301" | "302" | null; redirectTargetType: "category" | "product" | "url" | null; redirectTarget: string | null;
  quantity: number; version: number; publishedAt: string | null; createdAt: string; updatedAt: string;
  images: Array<{ id: number; url: string; alt: string | null; position: number; isCover: boolean }>;
  categories: Array<{ categoryId: number; isDefault: boolean }>;
  tags: string[];
  combinations: Combination[];
  priceTiers: Array<{ id: string; variantId: number | null; minimumQuantity: number; maximumQuantity: number | null; unitPriceXof: number }>;
  pack: { items: Array<{ productId: string; variantId: number | null; quantity: number; title: string }>; available: number | null } | null;
  stock: { available: number; warehouses: Array<{ warehouseId: string; code: string; name: string; counted: boolean; physical: number; reserved: number; available: number }> };
  specificPriceCount: number;
};

export type SimulatedPrice = {
  unitPriceExclTaxXof: number; unitPriceInclTaxXof: number; regularPriceExclTaxXof: number; regularPriceInclTaxXof: number; hasDiscount: boolean; discountPercent: number;
  taxRatePercent: number; tierApplied: boolean; floorApplied: boolean; appliedRule: { source: string; id: string } | null; marginXof: number | null; marginPercent: number | null;
};

export type SpecificPrice = { id: string; variantId: number | null; customerId: string | null; customerGroupId: number | null; countryCode: string | null; currency: string | null; fromQuantity: number; reductionType: "percent" | "amount" | "fixed_price"; reductionValue: number; dateFrom: string | null; dateTo: string | null; priority: number };

export type CatalogRule = { id: string; name: string; isActive: boolean; customerGroupId: number | null; countryCode: string | null; fromQuantity: number; reductionType: "percent" | "amount" | "fixed_price"; reductionValue: number; conditions: { categoryIds?: number[]; brandIds?: number[]; productIds?: string[] }; dateFrom: string | null; dateTo: string | null; priority: number };

export type Voucher = { id: string; code: string; name: string | null; description: string | null; isActive: boolean; startsAt: string | null; endsAt: string | null; usageLimit: number | null; usageCount: number; perCustomerLimit: number | null; customerGroupId: number | null; minimumSubtotalXof: number; discountType: "percent" | "amount" | "none"; discountValue: number; maximumDiscountXof: number | null; freeShipping: boolean; combinable: boolean; excludeDiscountedProducts: boolean; categoryIds: number[] };

export type StockLevel = { id: number; warehouseId: string; warehouseCode: string; productId: string; variantId: number | null; title: string; reference: string | null; sku: string | null; variantLabel: string | null; physical: number; reserved: number; available: number; threshold: number; lowStock: boolean; updatedAt: string };
export type StockMovement = { id: number; productId: string; title: string; variantId: number | null; warehouseCode: string | null; reason: string; delta: number; before: number; after: number; orderId: string | null; reference: string | null; note: string | null; createdAt: string };

/** Aplatit l'arbre des catégories pour un menu déroulant (libellé indenté). */
export function flattenCategories(nodes: CategoryNode[], depth = 0): Array<{ id: number; label: string; isActive: boolean }> {
  return nodes.flatMap((node) => [{ id: node.id, label: `${"— ".repeat(depth)}${node.name}`, isActive: node.isActive }, ...flattenCategories(node.children, depth + 1)]);
}

export const PRODUCT_STATUS_LABELS: Record<string, string> = { draft: "Brouillon", pending_review: "À vérifier", approved: "En ligne", published: "Publié", rejected: "Refusé", archived: "Archivé" };
export const STOCK_REASON_LABELS: Record<string, string> = { purchase: "Achat / réception", sale: "Vente (expédition)", return: "Retour client", adjustment: "Correction", loss: "Perte / casse", restock: "Réassort", pack: "Pack", cancellation: "Annulation", transfer: "Transfert", inventory: "Inventaire", import: "Import CSV" };
