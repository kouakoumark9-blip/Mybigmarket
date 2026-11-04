import { z } from "zod";
import { validateBarcode } from "@/lib/catalog-rules";
import { currencyCode, metaDescription, metaTitle, slugSchema, urlSchema } from "@/server/modules/catalog/shared";

const money = z.number().int("Montant entier en FCFA.").min(0).max(10_000_000_000);
const quantity = z.number().int().min(0).max(100_000_000);
const nonEmpty = (value: Record<string, unknown>) => Object.keys(value).length > 0;
const barcode = (kind: "ean13" | "upc" | "isbn") => z.string().trim().max(17).nullable().superRefine((value, ctx) => {
  const check = validateBarcode(kind, value);
  if (!check.valid) ctx.addIssue({ code: "custom", message: check.error ?? "Code-barres invalide." });
});

export const productStatuses = ["draft", "pending_review", "approved", "published", "rejected", "archived"] as const;
/** Statuts visibles en boutique. */
export const PUBLIC_STATUSES = ["approved", "published"] as const;

const productFields = {
  title: z.string().trim().min(3).max(190),
  slug: slugSchema,
  reference: z.string().trim().min(1).max(64).nullable(),
  sku: z.string().trim().min(1).max(80).nullable(),
  shortDescription: z.string().trim().max(320).nullable(),
  description: z.string().trim().max(100_000),
  internalNote: z.string().trim().max(5000).nullable(),
  sellerId: z.string().uuid(),
  categoryId: z.number().int().positive(),
  categoryIds: z.array(z.number().int().positive()).max(50),
  brandId: z.number().int().positive().nullable(),
  supplierId: z.string().uuid().nullable(),
  taxRuleGroupId: z.string().uuid().nullable(),
  productType: z.enum(["standard", "pack", "virtual"]),
  condition: z.enum(["new", "used", "refurbished"]),
  visibility: z.enum(["everywhere", "catalog", "search", "nowhere"]),
  status: z.enum(productStatuses),
  availableForOrder: z.boolean(),
  showPrice: z.boolean(),
  isFeatured: z.boolean(),
  allowReviews: z.boolean(),
  priceXof: money,
  purchasePriceXof: money.nullable(),
  ecotaxXof: money,
  unitPriceXof: money.nullable(),
  unitLabel: z.string().trim().max(20).nullable(),
  minimumQuantity: z.number().int().min(1).max(1_000_000),
  lowStockThreshold: quantity,
  leadTimeDays: z.number().int().min(0).max(365),
  deliveryTimeDays: z.number().int().min(0).max(365).nullable(),
  outOfStockBehavior: z.enum(["refuse", "backorder", "use_default"]),
  restockDate: z.coerce.date().nullable(),
  inStockMessage: z.string().trim().max(120).nullable(),
  outOfStockMessage: z.string().trim().max(120).nullable(),
  ean13: barcode("ean13"),
  upc: barcode("upc"),
  isbn: barcode("isbn"),
  mpn: z.string().trim().max(40).nullable(),
  weightGrams: quantity,
  lengthMm: quantity,
  widthMm: quantity,
  heightMm: quantity,
  additionalShippingXof: money,
  seoTitle: metaTitle.nullable(),
  seoDescription: metaDescription.nullable(),
  canonicalPath: z.string().trim().max(300).regex(/^\//, "Chemin relatif commençant par /.").nullable(),
  openGraphImageUrl: urlSchema.nullable(),
  redirectType: z.enum(["301", "302"]).nullable(),
  redirectTargetType: z.enum(["category", "product", "url"]).nullable(),
  redirectTarget: z.string().trim().max(300).nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(60)).max(50),
  relatedProductIds: z.array(z.string().uuid()).max(50),
  accessoryIds: z.array(z.string().uuid()).max(50),
};

export const createProductBody = z.object({
  ...productFields,
  slug: productFields.slug.optional(),
  reference: productFields.reference.optional(),
  sku: productFields.sku.optional(),
  shortDescription: productFields.shortDescription.optional(),
  description: productFields.description.default(""),
  internalNote: productFields.internalNote.optional(),
  categoryIds: productFields.categoryIds.optional(),
  brandId: productFields.brandId.optional(),
  supplierId: productFields.supplierId.optional(),
  taxRuleGroupId: productFields.taxRuleGroupId.optional(),
  productType: productFields.productType.default("standard"),
  condition: productFields.condition.default("new"),
  visibility: productFields.visibility.default("everywhere"),
  status: productFields.status.optional(),
  availableForOrder: productFields.availableForOrder.default(true),
  showPrice: productFields.showPrice.default(true),
  isFeatured: productFields.isFeatured.default(false),
  allowReviews: productFields.allowReviews.default(true),
  purchasePriceXof: productFields.purchasePriceXof.optional(),
  ecotaxXof: productFields.ecotaxXof.default(0),
  unitPriceXof: productFields.unitPriceXof.optional(),
  unitLabel: productFields.unitLabel.optional(),
  minimumQuantity: productFields.minimumQuantity.default(1),
  lowStockThreshold: productFields.lowStockThreshold.optional(),
  leadTimeDays: productFields.leadTimeDays.default(35),
  deliveryTimeDays: productFields.deliveryTimeDays.optional(),
  outOfStockBehavior: productFields.outOfStockBehavior.default("use_default"),
  restockDate: productFields.restockDate.optional(),
  inStockMessage: productFields.inStockMessage.optional(),
  outOfStockMessage: productFields.outOfStockMessage.optional(),
  ean13: productFields.ean13.optional(),
  upc: productFields.upc.optional(),
  isbn: productFields.isbn.optional(),
  mpn: productFields.mpn.optional(),
  weightGrams: productFields.weightGrams.default(0),
  lengthMm: productFields.lengthMm.default(0),
  widthMm: productFields.widthMm.default(0),
  heightMm: productFields.heightMm.default(0),
  additionalShippingXof: productFields.additionalShippingXof.default(0),
  seoTitle: productFields.seoTitle.optional(),
  seoDescription: productFields.seoDescription.optional(),
  canonicalPath: productFields.canonicalPath.optional(),
  openGraphImageUrl: productFields.openGraphImageUrl.optional(),
  redirectType: productFields.redirectType.optional(),
  redirectTargetType: productFields.redirectTargetType.optional(),
  redirectTarget: productFields.redirectTarget.optional(),
  tags: productFields.tags.optional(),
  relatedProductIds: productFields.relatedProductIds.optional(),
  accessoryIds: productFields.accessoryIds.optional(),
  /** Stock initial, entré dans l'entrepôt par défaut (mouvement tracé). */
  initialQuantity: quantity.optional(),
}).strict();

/** PATCH : tous les champs facultatifs, sans valeur par défaut. Le stock se gère via l'API stock. */
export const updateProductBody = z.object(Object.fromEntries(Object.entries(productFields).map(([key, schema]) => [key, schema.optional()])) as { [K in keyof typeof productFields]: z.ZodOptional<(typeof productFields)[K]> })
  .extend({ version: z.number().int().min(0).optional() })
  .strict()
  .refine(nonEmpty, "Aucun champ à modifier.");

export const bulkProductsBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["publish", "unpublish", "archive", "delete", "feature", "unfeature", "set_category"]),
  categoryId: z.number().int().positive().optional(),
}).strict().refine((value) => value.action !== "set_category" || value.categoryId, { message: "categoryId est requis pour set_category.", path: ["categoryId"] });

export const duplicateBody = z.object({ title: z.string().trim().min(3).max(190).optional(), copyCombinations: z.boolean().default(true), copyImages: z.boolean().default(true) }).strict();

/* Sous-ressources */
export const imageBody = z.object({ url: urlSchema, alt: z.string().trim().max(190).nullable().optional(), isCover: z.boolean().default(false), position: z.number().int().min(0).max(1000).optional() }).strict();
export const updateImageBody = z.object({ alt: z.string().trim().max(190).nullable().optional(), isCover: z.literal(true).optional() }).strict().refine(nonEmpty, "Aucun champ à modifier.");
export const imageOrderBody = z.object({ imageIds: z.array(z.number().int().positive()).min(1).max(200) }).strict();
export const imageParams = z.object({ id: z.string().uuid(), imageId: z.coerce.number().int().positive() });

export const generateCombinationsBody = z.object({
  attributeValueIds: z.array(z.string().uuid()).min(1).max(200),
  priceImpactXof: z.number().int().min(-10_000_000).max(10_000_000).default(0),
}).strict();

export const updateCombinationBody = z.object({
  sku: z.string().trim().min(1).max(80).nullable().optional(),
  ean13: barcode("ean13").optional(),
  upc: barcode("upc").optional(),
  priceDeltaXof: z.number().int().min(-10_000_000).max(10_000_000).optional(),
  weightImpactGrams: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  minimumQuantity: z.number().int().min(1).max(1_000_000).nullable().optional(),
  lowStockThreshold: quantity.optional(),
  isDefault: z.literal(true).optional(),
  isActive: z.boolean().optional(),
  imageIds: z.array(z.number().int().positive()).max(50).optional(),
}).strict().refine(nonEmpty, "Aucun champ à modifier.");
export const combinationParams = z.object({ id: z.string().uuid(), variantId: z.coerce.number().int().positive() });

export const featuresBody = z.object({
  features: z.array(z.object({ featureId: z.string().uuid(), featureValueId: z.string().uuid().nullable().optional(), customValue: z.string().trim().min(1).max(190).nullable().optional() }).strict()
    .refine((value) => Boolean(value.featureValueId) !== Boolean(value.customValue), "Indiquez soit une valeur prédéfinie, soit une valeur libre.")).max(100),
}).strict();

export const attachmentBody = z.object({ fileName: z.string().trim().min(1).max(190), url: urlSchema, contentType: z.string().trim().min(3).max(120), sizeBytes: z.number().int().min(0).max(100_000_000) }).strict();
export const attachmentParams = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });

export const packBody = z.object({ items: z.array(z.object({ productId: z.string().uuid(), variantId: z.number().int().positive().nullable().optional(), quantity: z.number().int().min(1).max(10_000) }).strict()).max(50) }).strict();

export const productSuppliersBody = z.object({
  suppliers: z.array(z.object({ supplierId: z.string().uuid(), supplierReference: z.string().trim().max(80).nullable().optional(), purchasePriceXof: money.nullable().optional(), currency: currencyCode.default("XOF"), isDefault: z.boolean().default(false) }).strict()).max(20)
    .refine((list) => list.filter((entry) => entry.isDefault).length <= 1, "Un seul fournisseur par défaut."),
}).strict();

export const downloadBody = z.object({
  fileName: z.string().trim().min(1).max(190),
  storageKey: z.string().trim().min(3).max(500).refine((value) => !/^https?:\/\//i.test(value), "Clé de stockage privée attendue, pas une URL publique."),
  contentType: z.string().trim().min(3).max(120).default("application/octet-stream"),
  sizeBytes: z.number().int().min(0).max(5_000_000_000).default(0),
  maxDownloads: z.number().int().min(1).max(1000).nullable().optional(),
  expiresAfterDays: z.number().int().min(1).max(3650).nullable().optional(),
  isActive: z.boolean().default(true),
}).strict();

export const customizationsBody = z.object({
  fields: z.array(z.object({ label: z.string().trim().min(1).max(120), type: z.enum(["text", "file"]).default("text"), isRequired: z.boolean().default(false), maxChars: z.number().int().min(1).max(10_000).nullable().optional(), maxBytes: z.number().int().min(1).max(50_000_000).nullable().optional() }).strict()).max(20),
}).strict();

export const trashQuery = z.object({}).strict();
