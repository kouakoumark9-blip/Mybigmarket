import { z } from "zod";
import { countryCode, currencyCode } from "@/server/modules/catalog/shared";

const nonEmpty = (value: Record<string, unknown>) => Object.keys(value).length > 0;
const reduction = { reductionType: z.enum(["percent", "amount", "fixed_price"]), reductionValue: z.number().min(0).max(10_000_000_000) };
const period = { dateFrom: z.coerce.date().nullable().optional(), dateTo: z.coerce.date().nullable().optional() };

function checkReduction(value: { reductionType?: string; reductionValue?: number; dateFrom?: Date | null; dateTo?: Date | null }, ctx: z.RefinementCtx) {
  if (value.reductionType === "percent" && value.reductionValue !== undefined && value.reductionValue > 100) ctx.addIssue({ code: "custom", path: ["reductionValue"], message: "Un pourcentage ne peut pas dépasser 100." });
  if (value.reductionType !== "percent" && value.reductionValue !== undefined && !Number.isInteger(value.reductionValue)) ctx.addIssue({ code: "custom", path: ["reductionValue"], message: "Montant entier en FCFA." });
  if (value.dateFrom && value.dateTo && value.dateTo <= value.dateFrom) ctx.addIssue({ code: "custom", path: ["dateTo"], message: "La date de fin doit suivre la date de début." });
}

const specificPriceFields = {
  variantId: z.number().int().positive().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerGroupId: z.number().int().positive().nullable().optional(),
  countryCode: countryCode.nullable().optional(),
  currency: currencyCode.nullable().optional(),
  fromQuantity: z.number().int().min(1).max(1_000_000),
  ...reduction,
  ...period,
  priority: z.number().int().min(-1000).max(1000).optional(),
};

export const createSpecificPriceBody = z.object({ ...specificPriceFields, fromQuantity: specificPriceFields.fromQuantity.default(1) }).strict().superRefine(checkReduction);
export const updateSpecificPriceBody = z.object({ ...specificPriceFields, fromQuantity: specificPriceFields.fromQuantity.optional(), reductionType: reduction.reductionType.optional(), reductionValue: reduction.reductionValue.optional() })
  .strict().superRefine(checkReduction).refine(nonEmpty, "Aucun champ à modifier.");

export const conditionsSchema = z.object({
  categoryIds: z.array(z.number().int().positive()).max(200).optional(),
  brandIds: z.array(z.number().int().positive()).max(200).optional(),
  supplierIds: z.array(z.string().uuid()).max(200).optional(),
  productIds: z.array(z.string().uuid()).max(500).optional(),
  excludeProductIds: z.array(z.string().uuid()).max(500).optional(),
}).strict();

const ruleFields = {
  name: z.string().trim().min(2).max(120),
  isActive: z.boolean(),
  customerGroupId: z.number().int().positive().nullable().optional(),
  countryCode: countryCode.nullable().optional(),
  currency: currencyCode.nullable().optional(),
  fromQuantity: z.number().int().min(1).max(1_000_000),
  ...reduction,
  conditions: conditionsSchema,
  ...period,
  priority: z.number().int().min(-1000).max(1000).optional(),
};

export const createCatalogRuleBody = z.object({ ...ruleFields, isActive: ruleFields.isActive.default(true), fromQuantity: ruleFields.fromQuantity.default(1), conditions: ruleFields.conditions.default({}) }).strict().superRefine(checkReduction);
export const updateCatalogRuleBody = z.object(Object.fromEntries(Object.entries(ruleFields).map(([key, schema]) => [key, schema.optional()])) as { [K in keyof typeof ruleFields]: z.ZodOptional<(typeof ruleFields)[K]> })
  .strict().superRefine(checkReduction).refine(nonEmpty, "Aucun champ à modifier.");

export const priceTiersBody = z.object({
  tiers: z.array(z.object({ variantId: z.number().int().positive().nullable().optional(), minimumQuantity: z.number().int().min(1).max(10_000_000), maximumQuantity: z.number().int().min(1).max(10_000_000).nullable().optional(), unitPriceXof: z.number().int().min(0).max(10_000_000_000) }).strict()
    .refine((tier) => tier.maximumQuantity == null || tier.maximumQuantity >= tier.minimumQuantity, { message: "La quantité maximale doit être ≥ à la minimale.", path: ["maximumQuantity"] })).max(50),
}).strict();

const voucherFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,63}$/, "Code : 3 à 64 caractères (lettres, chiffres, tirets)."),
  name: z.string().trim().min(2).max(120).nullable(),
  description: z.string().trim().max(2000).nullable(),
  isActive: z.boolean(),
  startsAt: z.coerce.date().nullable(),
  endsAt: z.coerce.date().nullable(),
  usageLimit: z.number().int().min(1).max(10_000_000).nullable(),
  perCustomerLimit: z.number().int().min(1).max(1000).nullable(),
  customerId: z.string().uuid().nullable(),
  customerGroupId: z.number().int().positive().nullable(),
  minimumSubtotalXof: z.number().int().min(0).max(10_000_000_000),
  discountType: z.enum(["percent", "amount", "none"]),
  discountValue: z.number().int().min(0).max(10_000_000_000),
  maximumDiscountXof: z.number().int().min(0).max(10_000_000_000).nullable(),
  freeShipping: z.boolean(),
  combinable: z.boolean(),
  excludeDiscountedProducts: z.boolean(),
  productIds: z.array(z.string().uuid()).max(500),
  categoryIds: z.array(z.number().int().positive()).max(200),
  priority: z.number().int().min(-1000).max(1000),
};

function checkVoucher(value: { discountType?: string; discountValue?: number; freeShipping?: boolean; startsAt?: Date | null; endsAt?: Date | null }, ctx: z.RefinementCtx) {
  if (value.discountType === "percent" && (value.discountValue ?? 0) > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Un pourcentage ne peut pas dépasser 100." });
  if (value.discountType === "none" && value.freeShipping === false) ctx.addIssue({ code: "custom", path: ["freeShipping"], message: "Un bon sans remise doit au moins offrir la livraison." });
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La date de fin doit suivre la date de début." });
}

export const createVoucherBody = z.object({
  ...voucherFields,
  code: voucherFields.code.optional(),
  name: voucherFields.name.optional(), description: voucherFields.description.optional(), isActive: voucherFields.isActive.default(true),
  startsAt: voucherFields.startsAt.optional(), endsAt: voucherFields.endsAt.optional(), usageLimit: voucherFields.usageLimit.optional(), perCustomerLimit: voucherFields.perCustomerLimit.optional(),
  customerId: voucherFields.customerId.optional(), customerGroupId: voucherFields.customerGroupId.optional(), minimumSubtotalXof: voucherFields.minimumSubtotalXof.default(0),
  discountValue: voucherFields.discountValue.default(0), maximumDiscountXof: voucherFields.maximumDiscountXof.optional(), freeShipping: voucherFields.freeShipping.default(false),
  combinable: voucherFields.combinable.default(false), excludeDiscountedProducts: voucherFields.excludeDiscountedProducts.default(false),
  productIds: voucherFields.productIds.default([]), categoryIds: voucherFields.categoryIds.default([]), priority: voucherFields.priority.default(0),
}).strict().superRefine(checkVoucher);

export const updateVoucherBody = z.object(Object.fromEntries(Object.entries(voucherFields).map(([key, schema]) => [key, schema.optional()])) as { [K in keyof typeof voucherFields]: z.ZodOptional<(typeof voucherFields)[K]> })
  .strict().superRefine(checkVoucher).refine(nonEmpty, "Aucun champ à modifier.");

export const priceQuery = z.object({
  quantity: z.coerce.number().int().min(1).max(10_000_000).default(1),
  variantId: z.coerce.number().int().positive().optional(),
  customerId: z.string().uuid().optional(),
  customerGroupId: z.coerce.number().int().positive().optional(),
  country: countryCode.optional(),
  currency: currencyCode.optional(),
}).strict();

export const voucherCheckBody = z.object({
  codes: z.array(z.string().trim().min(1).max(64)).min(1).max(5),
  lines: z.array(z.object({ productId: z.string().uuid(), variantId: z.number().int().positive().nullable().optional(), quantity: z.number().int().min(1).max(100_000) }).strict()).min(1).max(100),
  country: countryCode.optional(),
}).strict();

export const specificPriceParams = z.object({ id: z.string().uuid() });
