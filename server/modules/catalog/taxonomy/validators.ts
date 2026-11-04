import { z } from "zod";
import { countryCode, metaDescription, metaTitle, slugSchema, urlSchema } from "@/server/modules/catalog/shared";

const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(20_000);
const position = z.number().int().min(0).max(1_000_000);
const code = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/, "Code : lettres minuscules, chiffres, tirets et soulignés.");
const nonEmpty = (value: Record<string, unknown>) => Object.keys(value).length > 0;

/* Catégories */
export const createCategoryBody = z.object({
  name, slug: slugSchema.optional(), parentId: z.number().int().positive().nullable().optional(), description: description.optional(),
  isActive: z.boolean().default(true), sortOrder: position.optional(), imageUrl: urlSchema.nullable().optional(), bannerUrl: urlSchema.nullable().optional(),
  metaTitle: metaTitle.nullable().optional(), metaDescription: metaDescription.nullable().optional(),
}).strict();

export const updateCategoryBody = createCategoryBody.partial().extend({ isActive: z.boolean().optional() }).strict().refine(nonEmpty, "Aucun champ à modifier.");

export const deleteCategoryQuery = z.object({ moveProductsTo: z.coerce.number().int().positive().optional() }).strict();

export const moveCategoryBody = z.object({ parentId: z.number().int().positive().nullable(), position: position.optional() }).strict();

/* Marques */
export const createBrandBody = z.object({
  name: z.string().trim().min(1).max(120), slug: slugSchema.optional(), logoUrl: urlSchema.nullable().optional(), description: description.nullable().optional(),
  isActive: z.boolean().default(true), metaTitle: metaTitle.nullable().optional(), metaDescription: metaDescription.nullable().optional(),
}).strict();
export const updateBrandBody = createBrandBody.partial().extend({ isActive: z.boolean().optional() }).strict().refine(nonEmpty, "Aucun champ à modifier.");

/* Fournisseurs */
export const createSupplierBody = z.object({
  companyName: z.string().trim().min(2).max(190), slug: slugSchema.optional(), countryCode, city: z.string().trim().max(120).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(190).nullable().optional(), description: description.nullable().optional(), logoUrl: urlSchema.nullable().optional(),
  yearsActive: z.number().int().min(0).max(200).nullable().optional(), mainMarkets: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  profileStatus: z.enum(["unverified", "pending", "verified"]).default("unverified"), isActive: z.boolean().default(true),
}).strict();
export const updateSupplierBody = createSupplierBody.partial().extend({ isActive: z.boolean().optional(), mainMarkets: z.array(z.string().trim().min(1).max(60)).max(30).optional(), profileStatus: z.enum(["unverified", "pending", "verified"]).optional() }).strict().refine(nonEmpty, "Aucun champ à modifier.");

/* Attributs (groupes et valeurs) */
export const createAttributeGroupBody = z.object({
  code, name: z.string().trim().min(1).max(120), displayType: z.enum(["color", "texture", "select", "radio"]).default("select"), position: position.optional(), isActive: z.boolean().default(true),
  values: z.array(z.object({ code, name: z.string().trim().min(1).max(120), colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), textureUrl: urlSchema.nullable().optional(), position: position.optional() }).strict()).max(500).default([]),
}).strict();
export const updateAttributeGroupBody = z.object({ name: z.string().trim().min(1).max(120).optional(), displayType: z.enum(["color", "texture", "select", "radio"]).optional(), position: position.optional(), isActive: z.boolean().optional() }).strict().refine(nonEmpty, "Aucun champ à modifier.");
export const attributeValueBody = z.object({ code, name: z.string().trim().min(1).max(120), colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB.").nullable().optional(), textureUrl: urlSchema.nullable().optional(), position: position.optional(), isActive: z.boolean().default(true) }).strict();
export const updateAttributeValueBody = attributeValueBody.partial().extend({ isActive: z.boolean().optional() }).omit({ code: true }).strict().refine(nonEmpty, "Aucun champ à modifier.");
export const groupValueParams = z.object({ id: z.string().uuid(), valueId: z.string().uuid() });

/* Caractéristiques */
export const createFeatureBody = z.object({ code, name: z.string().trim().min(1).max(120), position: position.optional(), isActive: z.boolean().default(true), values: z.array(z.string().trim().min(1).max(190)).max(500).default([]) }).strict();
export const updateFeatureBody = z.object({ name: z.string().trim().min(1).max(120).optional(), position: position.optional(), isActive: z.boolean().optional() }).strict().refine(nonEmpty, "Aucun champ à modifier.");
export const featureValueBody = z.object({ value: z.string().trim().min(1).max(190), position: position.optional() }).strict();
export const featureValueParams = z.object({ id: z.string().uuid(), valueId: z.string().uuid() });
