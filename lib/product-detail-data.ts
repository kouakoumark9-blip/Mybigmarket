import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  categories,
  orderItems,
  orders,
  productAttributes,
  productImages,
  productKeywords,
  productLeadTimes,
  productPackaging,
  productPriceTiers,
  productVariants,
  products,
  relatedProducts,
  reviews,
  sellerProfiles,
  suppliers,
  users,
} from "@/lib/db/schema";

/**
 * Chargement de la fiche produit — aucune donnée en dur.
 *
 * Une fiche B2B n'est pas « un produit » : c'est un produit, ses paliers de prix,
 * ses variantes, ses caractéristiques ordonnées, son conditionnement, ses délais
 * de préparation, son fournisseur et ses avis. Tout est lu par une seule
 * fonction pour que la page reste un rendu pur, testable et cohérent.
 *
 * Aucun repli sur des données inventées : si une information manque en base,
 * elle est absente de la fiche. Un prix, un avis ou un délai fabriqué serait
 * pire qu'une section vide sur une place de marché.
 */

export type PriceTier = {
  minimumQuantity: number;
  maximumQuantity: number | null;
  unitPriceXof: number;
};

export type ProductVariantView = {
  id: number;
  name: string;
  value: string;
  sku: string | null;
  priceXof: number | null;
  priceDeltaXof: number;
  stock: number;
  imageUrl: string | null;
  minimumQuantity: number | null;
  isDefault: boolean;
};

export type AttributeRow = { name: string; value: string };

export type SupplierView = {
  id: string | null;
  name: string;
  logoInitials: string;
  countryCode: string;
  countryLabel: string;
  yearsActive: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  responseTimeHours: number | null;
  onTimeDeliveryRate: number | null;
  mainMarkets: string[];
  certifications: string[];
  description: string | null;
  city: string;
  offeringProducts: number;
};

export type ReviewView = {
  id: string;
  rating: number;
  comment: string | null;
  customerName: string;
  countryCode: string | null;
  verifiedPurchase: boolean;
  createdAt: Date;
};

export type LeadTimeRow = { minimumQuantity: number; maximumQuantity: number | null; preparationDays: number | null; negotiable: boolean };

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  shortDescription: string;
  priceXof: number;
  minimumQuantity: number;
  quantity: number;
  leadTimeDays: number;
  weightGrams: number;
  categoryName: string;
  categorySlug: string;
  images: Array<{ url: string; alt: string }>;
  priceTiers: PriceTier[];
  variants: ProductVariantView[];
  attributes: AttributeRow[];
  keyAttributeNames: string[];
  packaging: {
    unitsPerSale: number;
    lengthCm: string;
    widthCm: string;
    heightCm: string;
    grossWeightKg: string;
    fragile: boolean;
  } | null;
  leadTimes: LeadTimeRow[];
  supplier: SupplierView;
  reviews: ReviewView[];
  reviewAverage: number | null;
  reviewCount: number;
  soldCount: number;
  related: ProductDetailCard[];
  keywords: string[];
};

export type ProductDetailCard = {
  slug: string;
  title: string;
  priceXof: number;
  maximumTierPriceXof: number | null;
  minimumQuantity: number;
  imageUrl: string | null;
  categoryName: string;
  colorCount: number;
};

const COUNTRY_LABELS: Record<string, string> = {
  CN: "Chine",
  CI: "Côte d’Ivoire",
  SN: "Sénégal",
  ML: "Mali",
  BF: "Burkina Faso",
  GH: "Ghana",
  NG: "Nigeria",
  FR: "France",
  US: "États-Unis",
  GB: "Royaume-Uni",
};

/** Cartes de carrousel : prix, MOQ et image principale, en une requête. */
export async function getProductCards(productIds: string[]): Promise<ProductDetailCard[]> {
  if (productIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      priceXof: products.priceXof,
      minimumQuantity: products.minimumQuantity,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(inArray(products.id, productIds));

  const images = await db
    .select({ productId: productImages.productId, url: productImages.url, isPrimary: productImages.isPrimary })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder));

  const tiers = await db
    .select({ productId: productPriceTiers.productId, unitPriceXof: productPriceTiers.unitPriceXof })
    .from(productPriceTiers)
    .where(inArray(productPriceTiers.productId, productIds));

  const variants = await db
    .select({ productId: productVariants.productId, name: productVariants.name })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), isNull(productVariants.deletedAt)));

  const primaryImage = new Map<string, string>();
  for (const image of images) if (!primaryImage.has(image.productId)) primaryImage.set(image.productId, image.url);

  const maxTier = new Map<string, number>();
  for (const tier of tiers) {
    const current = maxTier.get(tier.productId);
    if (current === undefined || tier.unitPriceXof > current) maxTier.set(tier.productId, tier.unitPriceXof);
  }

  const colors = new Map<string, Set<string>>();
  for (const variant of variants) {
    if (!/couleur|color/i.test(variant.name)) continue;
    const list = colors.get(variant.productId) ?? new Set<string>();
    list.add(variant.name);
    colors.set(variant.productId, list);
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return productIds
    .map((id) => byId.get(id))
    .filter((row): row is (typeof rows)[number] => Boolean(row))
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      priceXof: row.priceXof,
      maximumTierPriceXof: maxTier.get(row.id) ?? null,
      minimumQuantity: row.minimumQuantity,
      imageUrl: primaryImage.get(row.id) ?? null,
      categoryName: row.categoryName,
      colorCount: colors.get(row.id)?.size ?? 0,
    }));
}

/**
 * Fiche produit complète. Renvoie `null` si le produit n'est pas publiable
 * (brouillon, refusé, archivé, fournisseur non vérifié, compte inactif) : la
 * page répond alors 404 plutôt que d'exposer une fiche non validée.
 */
export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      product: products,
      category: categories,
      seller: users,
      profile: sellerProfiles,
      supplier: suppliers,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(users, eq(users.id, products.sellerId))
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(
      and(
        eq(products.slug, slug),
        isNull(products.deletedAt),
        or(eq(products.status, "published"), eq(products.status, "approved")),
        eq(sellerProfiles.verificationStatus, "approved"),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return null;
  const productId = row.product.id;

  // Le fournisseur effectif : `suppliers` s'il existe, sinon le profil vendeur
  // historique. Le comptage de ses produits publiés en dépend.

  const [imageRows, tierRows, variantRows, attributeRows, packagingRows, leadRows, supplierReviews, keywordRows] =
    await Promise.all([
      db
        .select({ url: productImages.url, alt: productImages.alt })
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder)),
      db
        .select({
          minimumQuantity: productPriceTiers.minimumQuantity,
          maximumQuantity: productPriceTiers.maximumQuantity,
          unitPriceXof: productPriceTiers.unitPriceXof,
        })
        .from(productPriceTiers)
        .where(and(eq(productPriceTiers.productId, productId), isNull(productPriceTiers.variantId)))
        .orderBy(asc(productPriceTiers.minimumQuantity)),
      db
        .select({
          id: productVariants.id,
          name: productVariants.name,
          value: productVariants.value,
          sku: productVariants.sku,
          priceXof: productVariants.priceXof,
          priceDeltaXof: productVariants.priceDeltaXof,
          stock: productVariants.stock,
          imageUrl: productVariants.imageUrl,
          minimumQuantity: productVariants.minimumQuantity,
          isDefault: productVariants.isDefault,
        })
        .from(productVariants)
        .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true), isNull(productVariants.deletedAt)))
        .orderBy(asc(productVariants.position), asc(productVariants.id)),
      db
        .select({ id: productAttributes.id, name: productAttributes.name, value: productAttributes.value })
        .from(productAttributes)
        .where(eq(productAttributes.productId, productId))
        .orderBy(asc(productAttributes.sortOrder)),
      db
        .select()
        .from(productPackaging)
        .where(eq(productPackaging.productId, productId))
        .limit(1),
      db
        .select({
          minimumQuantity: productLeadTimes.minimumQuantity,
          maximumQuantity: productLeadTimes.maximumQuantity,
          preparationDays: productLeadTimes.preparationDays,
          negotiable: productLeadTimes.negotiable,
        })
        .from(productLeadTimes)
        .where(eq(productLeadTimes.productId, productId))
        .orderBy(asc(productLeadTimes.sortOrder), asc(productLeadTimes.minimumQuantity)),
      db
        .select({ total: sql<number>`count(*)::int`, average: sql<number | null>`avg(${reviews.rating})` })
        .from(reviews)
        .where(and(eq(reviews.productId, productId), eq(reviews.isPublished, true))),
      db
        .select({ keyword: productKeywords.keyword })
        .from(productKeywords)
        .where(eq(productKeywords.productId, productId))
        .orderBy(asc(productKeywords.sortOrder))
        .limit(20),
    ]);

  const keyAttributes = await db
    .select({ name: productAttributes.name })
    .from(productAttributes)
    .where(
      and(
        eq(productAttributes.productId, productId),
        sql`${productAttributes.id} in (select attribute_id from product_key_attributes where product_id = ${productId})`,
      ),
    );

  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      verifiedPurchase: reviews.verifiedPurchase,
      createdAt: reviews.createdAt,
      customerName: users.name,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.buyerId))
    .where(and(eq(reviews.productId, productId), eq(reviews.isPublished, true)))
    .orderBy(desc(reviews.createdAt))
    .limit(20);

  const relatedRows = await db
    .select({ relatedProductId: relatedProducts.relatedProductId })
    .from(relatedProducts)
    .where(and(eq(relatedProducts.productId, productId), eq(relatedProducts.relationType, "related")))
    .orderBy(asc(relatedProducts.sortOrder))
    .limit(12);

  let relatedIds = relatedRows.map((item) => item.relatedProductId);
  if (relatedIds.length === 0) {
    // Repli honnête : même catégorie, sans prétendre à une recommandation éditoriale.
    const sameCategory = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.categoryId, row.product.categoryId), ne(products.id, productId), isNull(products.deletedAt)))
      .orderBy(desc(products.createdAt))
      .limit(8);
    relatedIds = sameCategory.map((item) => item.id);
  }

  // Nombre de produits publiés par le même fournisseur : un chiffre réel, jamais estimé.
  const [offerings] = row.supplier
    ? await db
        .select({ total: sql<number>`count(*)::int` })
        .from(products)
        .where(and(eq(products.supplierId, row.supplier.id), isNull(products.deletedAt)))
    : [{ total: 0 }];

  // Ventes réelles : lignes de commande payées pour ce produit. Aucune
  // extrapolation : si aucune commande n'a été payée, le compteur reste à 0 et
  // la fiche n'affiche pas « vendus ».
  const [sold] = await db
    .select({ total: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(
      eq(orderItems.productId, productId),
      inArray(orders.status, ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"]),
    ));

  const countryCode = row.supplier?.countryCode ?? "CN";
  // Ancienneté : valeur saisie dans l'admin, sinon calculée depuis la création du compte.
  const yearsActive =
    row.supplier?.yearsActive ??
    Math.max(0, Math.floor((Date.now() - (row.profile.createdAt?.getTime() ?? Date.now())) / (365.25 * 24 * 3600 * 1000)));

  const supplier: SupplierView = {
    id: row.supplier?.id ?? null,
    name: row.supplier?.companyName ?? row.seller.name,
    logoInitials: (row.supplier?.companyName ?? row.seller.name)
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    countryCode,
    countryLabel: COUNTRY_LABELS[countryCode] ?? countryCode,
    yearsActive,
    ratingAverage: row.supplier
      ? Number(row.supplier.ratingAverage) || null
      : Number(row.profile.ratingAvg) || null,
    ratingCount: row.supplier?.reviewCount ?? row.profile.ratingCount,
    responseTimeHours: row.supplier?.responseTimeHours ? Number(row.supplier.responseTimeHours) : null,
    onTimeDeliveryRate: row.supplier?.onTimeDeliveryPercent ? Number(row.supplier.onTimeDeliveryPercent) : null,
    mainMarkets: row.supplier?.mainMarkets ?? [],
    certifications: [],
    description: row.supplier?.description ?? null,
    city: row.supplier?.city ?? row.profile.cityChina,
    offeringProducts: Number(offerings?.total ?? 0),
  };

  const reviewAverage = supplierReviews[0]?.average != null ? Number(supplierReviews[0].average) : null;
  const reviewCount = Number(supplierReviews[0]?.total ?? 0);

  return {
    id: productId,
    slug: row.product.slug,
    title: row.product.title,
    description: row.product.description,
    shortDescription: row.product.shortDescription ?? "",
    priceXof: row.product.priceXof,
    minimumQuantity: row.product.minimumQuantity,
    quantity: row.product.quantity,
    leadTimeDays: row.product.leadTimeDays,
    weightGrams: row.product.weightGrams,
    categoryName: row.category.name,
    categorySlug: row.category.slug,
    images: imageRows.map((image) => ({ url: image.url, alt: image.alt ?? row.product.title })),
    priceTiers: tierRows,
    variants: variantRows,
    attributes: attributeRows.map(({ name, value }) => ({ name, value })),
    keyAttributeNames: keyAttributes.map((item) => item.name),
    packaging: packagingRows[0]
      ? {
          unitsPerSale: packagingRows[0].unitsPerSale,
          lengthCm: packagingRows[0].lengthCm,
          widthCm: packagingRows[0].widthCm,
          heightCm: packagingRows[0].heightCm,
          grossWeightKg: packagingRows[0].grossWeightKg,
          fragile: packagingRows[0].fragile,
        }
      : null,
    leadTimes: leadRows,
    supplier,
    reviews: reviewRows.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      customerName: review.customerName,
      countryCode: null,
      verifiedPurchase: review.verifiedPurchase,
      createdAt: review.createdAt,
    })),
    reviewAverage,
    reviewCount,
    soldCount: Number(sold?.total ?? 0),
    related: await getProductCards(relatedIds),
    keywords: keywordRows.map((item) => item.keyword),
  };
}

/**
 * Recommandations de bas de fiche, en deux listes réellement liées au produit :
 *  - `recommended` : les produits choisis dans l'admin (table related_products),
 *    dans leur ordre de saisie ;
 *  - `alternatives` : les autres produits publiés de la même catégorie, hors
 *    produit courant et hors déjà recommandés, du plus récent au plus ancien.
 * Aucune liste n'est complétée par du hasard : si la catégorie est vide, le
 * carrousel affiche son message d'absence.
 */
export async function getRelatedProducts(product: ProductDetail): Promise<{
  recommended: ProductDetailCard[];
  alternatives: ProductDetailCard[];
}> {
  const db = getDb();

  const relatedIds = await db
    .select({ productId: relatedProducts.relatedProductId, sortOrder: relatedProducts.sortOrder })
    .from(relatedProducts)
    .where(eq(relatedProducts.productId, product.id))
    .orderBy(asc(relatedProducts.sortOrder))
    .limit(12);

  const recommended = await getProductCards(relatedIds.map((row) => row.productId));
  const excluded = new Set<string>([product.id, ...relatedIds.map((row) => row.productId)]);

  const categoryRows = await db
    .select({ id: products.id })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(users, eq(users.id, products.sellerId))
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(and(
      eq(categories.slug, product.categorySlug),
      isNull(products.deletedAt),
      or(eq(products.status, "published"), eq(products.status, "approved")),
      eq(sellerProfiles.verificationStatus, "approved"),
      eq(users.status, "active"),
    ))
    .orderBy(desc(products.createdAt))
    .limit(24);

  const alternativeIds = categoryRows.map((row) => row.id).filter((id) => !excluded.has(id)).slice(0, 12);
  const alternatives = await getProductCards(alternativeIds);

  return { recommended, alternatives };
}
