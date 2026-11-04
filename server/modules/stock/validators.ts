import { z } from "zod";
import { countryCode, queryBoolean } from "@/server/modules/catalog/shared";

const nonEmpty = (value: Record<string, unknown>) => Object.keys(value).length > 0;
const target = { productId: z.string().uuid(), variantId: z.number().int().positive().nullable().optional() };
const note = z.string().trim().max(240).nullable().optional();
const reference = z.string().trim().max(120).nullable().optional();

const warehouseFields = {
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, "Code : 2 à 40 caractères (minuscules, chiffres, tirets)."),
  name: z.string().trim().min(2).max(120),
  countryCode,
  city: z.string().trim().max(120).nullable(),
  address: z.string().trim().max(500).nullable(),
  managerEmployeeId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  isSellable: z.boolean(),
  position: z.number().int().min(0).max(10_000),
};

export const createWarehouseBody = z.object({
  ...warehouseFields,
  countryCode: warehouseFields.countryCode.default("CI"), city: warehouseFields.city.optional(), address: warehouseFields.address.optional(), managerEmployeeId: warehouseFields.managerEmployeeId.optional(),
  isActive: warehouseFields.isActive.default(true), isDefault: warehouseFields.isDefault.default(false), isSellable: warehouseFields.isSellable.default(true), position: warehouseFields.position.default(0),
}).strict();

export const updateWarehouseBody = z.object(Object.fromEntries(Object.entries(warehouseFields).filter(([key]) => key !== "code").map(([key, schema]) => [key, schema.optional()])) as { [K in Exclude<keyof typeof warehouseFields, "code">]: z.ZodOptional<(typeof warehouseFields)[K]> })
  .strict().refine(nonEmpty, "Aucun champ à modifier.");

export const adjustmentBody = z.object({
  ...target, warehouseId: z.string().uuid().nullable().optional(),
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, "La variation ne peut pas être nulle."),
  reason: z.enum(["purchase", "return", "adjustment", "loss", "restock"]), note, reference,
}).strict();

export const inventoryBody = z.object({
  warehouseId: z.string().uuid().nullable().optional(), reference, note,
  items: z.array(z.object({ ...target, quantity: z.number().int().min(0).max(100_000_000) }).strict()).min(1).max(1000),
}).strict();

export const transferBody = z.object({ ...target, fromWarehouseId: z.string().uuid(), toWarehouseId: z.string().uuid(), quantity: z.number().int().min(1).max(1_000_000), note, reference }).strict();

export const receiptBody = z.object({
  warehouseId: z.string().uuid().nullable().optional(), supplierId: z.string().uuid().nullable().optional(), reference: z.string().trim().min(1).max(120), note,
  items: z.array(z.object({ ...target, quantity: z.number().int().min(1).max(1_000_000), unitCostXof: z.number().int().min(0).max(10_000_000_000).nullable().optional() }).strict()).min(1).max(1000),
}).strict();

// Non strict : la même chaîne de requête porte aussi page, limit, sort et q (pagination).
export const levelsQuery = z.object({ lowStock: queryBoolean.optional() });
export const replenishmentQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).strict();
export const exportQuery = z.object({ warehouseId: z.string().uuid().optional() }).strict();
export const importBody = z.object({ csv: z.string().min(1).max(900_000), mode: z.enum(["set", "add"]).default("set"), dryRun: z.boolean().default(true), reference: z.string().trim().max(120).optional() }).strict();
