/**
 * Prix et promotions : calcul du prix d'un produit pour un client (HT, TTC, prix barré),
 * prix spécifiques, règles de prix catalogue, prix dégressifs et bons de réduction.
 *
 * Le calcul lui-même est dans lib/pricing.ts (pur, testé) :
 *   palier dégressif → remise de groupe → meilleure règle (prix spécifique ou règle catalogue,
 *   la plus favorable au client) → plancher au prix d'achat → écotaxe ; puis la taxe du pays.
 * Les bons sont évalués par lib/vouchers.ts sur les prix TTC réellement payés.
 */
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { computeUnitPrice, type PriceBreakdown, type SpecificPriceRule } from "@/lib/pricing";
import { priceIncludingTax, resolveTaxRate } from "@/lib/taxes";
import { combineVouchers, evaluateVoucher, normalizeVoucherCode, type VoucherRule } from "@/lib/vouchers";
import {
  catalogPriceRules, customerGroupMembers, customerGroups, customers, productCategories, productPriceTiers, productVariants, products, promoCodeRedemptions,
  promoCodes, specificPrices, taxRuleGroupRules, taxRules, type CatalogPriceRuleConditions,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { definedEntries, type Context } from "@/server/modules/catalog/shared";

/* ─────────────────────────────  Calcul du prix  ───────────────────────────── */

export type PriceRequest = {
  productId: string;
  variantId?: number | null;
  quantity: number;
  customerId?: string | null;
  customerGroupId?: number | null;
  countryCode?: string;
  currency?: string;
  now?: Date;
};

export type ResolvedPrice = {
  productId: string;
  variantId: number | null;
  quantity: number;
  currency: string;
  countryCode: string;
  taxRatePercent: number;
  taxRuleId: string | null;
  /** Prix unitaire payé, HT et TTC (écotaxe comprise). */
  unitPriceExclTaxXof: number;
  unitPriceInclTaxXof: number;
  /** Prix « normal » avant remises : à barrer quand il est supérieur au prix payé. */
  regularPriceExclTaxXof: number;
  regularPriceInclTaxXof: number;
  hasDiscount: boolean;
  discountPercent: number;
  totalExclTaxXof: number;
  totalInclTaxXof: number;
  tierApplied: boolean;
  groupDiscountXof: number;
  specificDiscountXof: number;
  appliedRule: { source: "specific_price" | "catalog_rule"; id: string } | null;
  floorApplied: boolean;
  ecotaxXof: number;
};

async function productCategoryIds(executor: Executor, productId: string, defaultCategoryId: number): Promise<number[]> {
  const links = await executor.select({ id: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, productId));
  return [...new Set([defaultCategoryId, ...links.map((link) => link.id)])];
}

/** Une règle catalogue vise-t-elle ce produit ? Chaque type de condition renseigné doit être satisfait. */
export function ruleMatchesProduct(conditions: CatalogPriceRuleConditions, product: { id: string; categoryIds: number[]; brandId: number | null; supplierId: string | null }): boolean {
  if (conditions.excludeProductIds?.includes(product.id)) return false;
  if (conditions.productIds?.length && !conditions.productIds.includes(product.id)) return false;
  if (conditions.categoryIds?.length && !product.categoryIds.some((id) => conditions.categoryIds!.includes(id))) return false;
  if (conditions.brandIds?.length && (product.brandId == null || !conditions.brandIds.includes(product.brandId))) return false;
  if (conditions.supplierIds?.length && (product.supplierId == null || !conditions.supplierIds.includes(product.supplierId))) return false;
  return true;
}

async function customerGroup(executor: Executor, request: PriceRequest): Promise<{ groupId: number | null; basisPoints: number }> {
  let groupId = request.customerGroupId ?? null;
  if (groupId == null && request.customerId) {
    const [customer] = await executor.select({ groupId: customers.customerGroupId }).from(customers).where(eq(customers.id, request.customerId)).limit(1);
    groupId = customer?.groupId ?? null;
  }
  if (groupId == null) return { groupId: null, basisPoints: 0 };
  const [group] = await executor.select({ basisPoints: customerGroups.discountBasisPoints }).from(customerGroups).where(and(eq(customerGroups.id, groupId), eq(customerGroups.isActive, true), isNull(customerGroups.deletedAt))).limit(1);
  return { groupId, basisPoints: group?.basisPoints ?? 0 };
}

export async function taxRateFor(executor: Executor, taxRuleGroupId: string | null, countryCode: string) {
  if (!taxRuleGroupId) return { ratePercent: 0, ruleId: null as string | null };
  const rules = await executor.select({ id: taxRules.id, countryCode: taxRules.countryCode, region: taxRules.region, ratePercent: taxRules.ratePercent, isActive: taxRules.isActive, priority: taxRuleGroupRules.priority })
    .from(taxRuleGroupRules).innerJoin(taxRules, eq(taxRules.id, taxRuleGroupRules.taxRuleId)).where(eq(taxRuleGroupRules.taxRuleGroupId, taxRuleGroupId));
  const resolved = resolveTaxRate(rules.map((rule) => ({ ...rule, ratePercent: Number(rule.ratePercent) })), { countryCode });
  return { ratePercent: resolved.ratePercent, ruleId: resolved.ruleId };
}

/** Règles applicables (prix spécifiques du produit + règles catalogue actives qui le visent). */
async function candidateRules(executor: Executor, product: typeof products.$inferSelect, variantId: number | null, now: Date): Promise<SpecificPriceRule[]> {
  const inPeriod = (from: AnyPgColumn, to: AnyPgColumn) => and(or(isNull(from), lte(from, now)), or(isNull(to), gte(to, now)));
  const [specific, catalog] = await Promise.all([
    executor.select().from(specificPrices).where(and(eq(specificPrices.productId, product.id), variantId == null ? isNull(specificPrices.variantId) : or(isNull(specificPrices.variantId), eq(specificPrices.variantId, variantId)), inPeriod(specificPrices.dateFrom, specificPrices.dateTo))),
    executor.select().from(catalogPriceRules).where(and(eq(catalogPriceRules.isActive, true), isNull(catalogPriceRules.deletedAt), inPeriod(catalogPriceRules.dateFrom, catalogPriceRules.dateTo))),
  ]);
  const categoryIds = await productCategoryIds(executor, product.id, product.categoryId);
  const rules: SpecificPriceRule[] = specific.map((row) => ({
    id: row.id, source: "specific_price", variantId: row.variantId, customerId: row.customerId, groupId: row.customerGroupId == null ? null : String(row.customerGroupId),
    countryCode: row.countryCode, currency: row.currency, dateFrom: row.dateFrom, dateTo: row.dateTo, minimumQuantity: row.fromQuantity,
    discountType: row.reductionType, discountValue: Number(row.reductionValue), priority: row.priority,
  }));
  for (const row of catalog) {
    if (!ruleMatchesProduct(row.conditions, { id: product.id, categoryIds, brandId: product.brandId, supplierId: product.supplierId })) continue;
    rules.push({
      id: row.id, source: "catalog_rule", groupId: row.customerGroupId == null ? null : String(row.customerGroupId), countryCode: row.countryCode, currency: row.currency,
      dateFrom: row.dateFrom, dateTo: row.dateTo, minimumQuantity: row.fromQuantity, discountType: row.reductionType, discountValue: Number(row.reductionValue), priority: row.priority,
    });
  }
  return rules;
}

export async function resolvePrice(executor: Executor, request: PriceRequest): Promise<ResolvedPrice & { breakdown: PriceBreakdown }> {
  const [product] = await executor.select().from(products).where(and(eq(products.id, request.productId), isNull(products.deletedAt))).limit(1);
  if (!product) throw errors.notFound("Produit", request.productId);
  const variantId = request.variantId ?? null;
  let variantDelta = 0;
  if (variantId != null) {
    const [variant] = await executor.select({ delta: productVariants.priceDeltaXof }).from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, product.id), isNull(productVariants.deletedAt))).limit(1);
    if (!variant) throw errors.notFound("Déclinaison", variantId);
    variantDelta = variant.delta;
  }
  const now = request.now ?? new Date();
  const countryCode = (request.countryCode ?? "CI").toUpperCase();
  const currency = (request.currency ?? "XOF").toUpperCase();
  const [allTiers, group, rules, tax] = await Promise.all([
    executor.select().from(productPriceTiers).where(eq(productPriceTiers.productId, product.id)),
    customerGroup(executor, request),
    candidateRules(executor, product, variantId, now),
    taxRateFor(executor, product.taxRuleGroupId, countryCode),
  ]);
  // Paliers propres à la déclinaison s'il en existe, sinon paliers du produit.
  const variantTiers = variantId != null ? allTiers.filter((tier) => tier.variantId === variantId) : [];
  const tiers = (variantTiers.length ? variantTiers : allTiers.filter((tier) => tier.variantId == null)).map((tier) => ({ minimumQuantity: tier.minimumQuantity, maximumQuantity: tier.maximumQuantity, unitPriceXof: tier.unitPriceXof }));

  const breakdown = computeUnitPrice({
    basePriceXof: product.priceXof, variantDeltaXof: variantDelta, purchasePriceXof: product.purchasePriceXof, ecotaxXof: product.ecotaxXof,
    quantity: request.quantity, tiers, groupDiscountBasisPoints: group.basisPoints, specificPrices: rules,
    customer: { customerId: request.customerId ?? null, groupId: group.groupId == null ? null : String(group.groupId), countryCode, currency }, now,
  }, variantId);

  const regularExcl = breakdown.basePriceXof + breakdown.ecotaxXof;
  const unitIncl = priceIncludingTax(breakdown.unitPriceXof, tax.ratePercent);
  const regularIncl = priceIncludingTax(regularExcl, tax.ratePercent);
  const hasDiscount = breakdown.unitPriceXof < regularExcl;
  return {
    productId: product.id, variantId, quantity: request.quantity, currency, countryCode, taxRatePercent: tax.ratePercent, taxRuleId: tax.ruleId,
    unitPriceExclTaxXof: breakdown.unitPriceXof, unitPriceInclTaxXof: unitIncl,
    regularPriceExclTaxXof: regularExcl, regularPriceInclTaxXof: regularIncl,
    hasDiscount, discountPercent: hasDiscount && regularExcl > 0 ? Math.round(((regularExcl - breakdown.unitPriceXof) / regularExcl) * 1000) / 10 : 0,
    totalExclTaxXof: breakdown.unitPriceXof * request.quantity, totalInclTaxXof: unitIncl * request.quantity,
    tierApplied: breakdown.tierApplied, groupDiscountXof: breakdown.groupDiscountXof, specificDiscountXof: breakdown.specificDiscountXof,
    appliedRule: breakdown.appliedRule?.id && breakdown.appliedRule.source ? { source: breakdown.appliedRule.source, id: breakdown.appliedRule.id } : null,
    floorApplied: breakdown.floorApplied, ecotaxXof: breakdown.ecotaxXof, breakdown,
  };
}

/** Variante publique (sans détail interne : plancher, marge). */
export function publicPrice(price: ResolvedPrice) {
  return {
    currency: price.currency, taxRatePercent: price.taxRatePercent, quantity: price.quantity,
    unitPriceExclTaxXof: price.unitPriceExclTaxXof, unitPriceInclTaxXof: price.unitPriceInclTaxXof,
    regularPriceExclTaxXof: price.regularPriceExclTaxXof, regularPriceInclTaxXof: price.regularPriceInclTaxXof,
    hasDiscount: price.hasDiscount, discountPercent: price.discountPercent, totalInclTaxXof: price.totalInclTaxXof, ecotaxXof: price.ecotaxXof,
  };
}

/* ─────────────────────────────  Prix spécifiques  ───────────────────────────── */

type SpecificRow = typeof specificPrices.$inferSelect;
const specificView = (row: SpecificRow) => ({
  id: row.id, productId: row.productId, variantId: row.variantId, customerId: row.customerId, customerGroupId: row.customerGroupId, countryCode: row.countryCode, currency: row.currency,
  fromQuantity: row.fromQuantity, reductionType: row.reductionType, reductionValue: Number(row.reductionValue), dateFrom: row.dateFrom?.toISOString() ?? null, dateTo: row.dateTo?.toISOString() ?? null,
  priority: row.priority, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

type SpecificInput = { variantId?: number | null; customerId?: string | null; customerGroupId?: number | null; countryCode?: string | null; currency?: string | null; fromQuantity?: number; reductionType?: "percent" | "amount" | "fixed_price"; reductionValue?: number; dateFrom?: Date | null; dateTo?: Date | null; priority?: number };

async function assertTargets(executor: Executor, productId: string, input: SpecificInput) {
  const issues: Array<{ path: string; message: string }> = [];
  if (input.variantId != null) {
    const [variant] = await executor.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, input.variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt))).limit(1);
    if (!variant) issues.push({ path: "variantId", message: "Déclinaison introuvable pour ce produit." });
  }
  if (input.customerId) {
    const [customer] = await executor.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), isNull(customers.deletedAt))).limit(1);
    if (!customer) issues.push({ path: "customerId", message: "Client introuvable." });
  }
  if (input.customerGroupId != null) {
    const [group] = await executor.select({ id: customerGroups.id }).from(customerGroups).where(and(eq(customerGroups.id, input.customerGroupId), isNull(customerGroups.deletedAt))).limit(1);
    if (!group) issues.push({ path: "customerGroupId", message: "Groupe de clients introuvable." });
  }
  if (issues.length) throw errors.validation(issues);
}

export async function listSpecificPrices(database: Db, productId: string) {
  const [product] = await database.select({ id: products.id }).from(products).where(and(eq(products.id, productId), isNull(products.deletedAt))).limit(1);
  if (!product) throw errors.notFound("Produit", productId);
  const rows = await database.select().from(specificPrices).where(eq(specificPrices.productId, productId)).orderBy(asc(specificPrices.fromQuantity), asc(specificPrices.createdAt));
  return rows.map(specificView);
}

export async function createSpecificPrice(database: Db, productId: string, input: SpecificInput & { reductionType: "percent" | "amount" | "fixed_price"; reductionValue: number }, context: Context) {
  return database.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(and(eq(products.id, productId), isNull(products.deletedAt))).limit(1);
    if (!product) throw errors.notFound("Produit", productId);
    await assertTargets(tx, productId, input);
    const [row] = await tx.insert(specificPrices).values({ ...input, productId, reductionValue: String(input.reductionValue), fromQuantity: input.fromQuantity ?? 1, priority: input.priority ?? 0, createdByEmployeeId: context.actor.employeeId, shopId: context.actor.shopId }).returning();
    await recordAudit(tx, { action: "specific_price.created", entityType: "specific_price", entityId: row.id, after: specificView(row), actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.updated", { productId, changedFields: ["specificPrices"] }, { aggregateId: productId, shopId: context.actor.shopId });
    return specificView(row);
  });
}

export async function updateSpecificPrice(database: Db, id: string, input: SpecificInput, context: Context) {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(specificPrices).where(eq(specificPrices.id, id)).limit(1).for("update");
    if (!before) throw errors.notFound("Prix spécifique", id);
    await assertTargets(tx, before.productId, input);
    const merged = { reductionType: input.reductionType ?? before.reductionType, reductionValue: input.reductionValue ?? Number(before.reductionValue), dateFrom: input.dateFrom === undefined ? before.dateFrom : input.dateFrom, dateTo: input.dateTo === undefined ? before.dateTo : input.dateTo };
    if (merged.reductionType === "percent" && merged.reductionValue > 100) throw errors.validation([{ path: "reductionValue", message: "Un pourcentage ne peut pas dépasser 100." }]);
    if (merged.dateFrom && merged.dateTo && merged.dateTo <= merged.dateFrom) throw errors.validation([{ path: "dateTo", message: "La date de fin doit suivre la date de début." }]);
    const { reductionValue, ...rest } = input;
    const [after] = await tx.update(specificPrices).set({ ...definedEntries(rest), ...(reductionValue !== undefined ? { reductionValue: String(reductionValue) } : {}), updatedAt: new Date() }).where(eq(specificPrices.id, id)).returning();
    await recordAudit(tx, { action: "specific_price.updated", entityType: "specific_price", entityId: id, before: specificView(before), after: specificView(after), actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.updated", { productId: before.productId, changedFields: ["specificPrices"] }, { aggregateId: before.productId, shopId: context.actor.shopId });
    return specificView(after);
  });
}

export async function deleteSpecificPrice(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const [before] = await tx.delete(specificPrices).where(eq(specificPrices.id, id)).returning();
    if (!before) throw errors.notFound("Prix spécifique", id);
    await recordAudit(tx, { action: "specific_price.deleted", entityType: "specific_price", entityId: id, before: specificView(before), actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.updated", { productId: before.productId, changedFields: ["specificPrices"] }, { aggregateId: before.productId, shopId: context.actor.shopId });
  });
}

/* ─────────────────────────────  Prix dégressifs  ───────────────────────────── */

export async function setPriceTiers(database: Db, productId: string, tiers: Array<{ variantId?: number | null; minimumQuantity: number; maximumQuantity?: number | null; unitPriceXof: number }>, context: Context) {
  return database.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(and(eq(products.id, productId), isNull(products.deletedAt))).limit(1).for("update");
    if (!product) throw errors.notFound("Produit", productId);
    const byTarget = new Map<string, typeof tiers>();
    for (const tier of tiers) byTarget.set(String(tier.variantId ?? ""), [...(byTarget.get(String(tier.variantId ?? "")) ?? []), tier]);
    for (const [target, list] of byTarget) {
      const sorted = [...list].sort((a, b) => a.minimumQuantity - b.minimumQuantity);
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        if (previous.minimumQuantity === sorted[index].minimumQuantity || previous.maximumQuantity == null || previous.maximumQuantity >= sorted[index].minimumQuantity) {
          throw errors.validation([{ path: "tiers", message: `Les paliers${target ? ` de la déclinaison ${target}` : ""} se chevauchent : chaque palier doit commencer après la fin du précédent.` }]);
        }
      }
    }
    const variantIds = [...new Set(tiers.map((tier) => tier.variantId).filter((id): id is number => id != null))];
    if (variantIds.length) {
      const found = await tx.select({ id: productVariants.id }).from(productVariants).where(and(inArray(productVariants.id, variantIds), eq(productVariants.productId, productId)));
      if (found.length !== variantIds.length) throw errors.validation([{ path: "tiers", message: "Déclinaison introuvable pour ce produit." }]);
    }
    const before = await tx.select().from(productPriceTiers).where(eq(productPriceTiers.productId, productId));
    await tx.delete(productPriceTiers).where(eq(productPriceTiers.productId, productId));
    if (tiers.length) await tx.insert(productPriceTiers).values(tiers.map((tier, sortOrder) => ({ productId, variantId: tier.variantId ?? null, minimumQuantity: tier.minimumQuantity, maximumQuantity: tier.maximumQuantity ?? null, unitPriceXof: tier.unitPriceXof, sortOrder })));
    await recordAudit(tx, { action: "product.price_tiers_updated", entityType: "product", entityId: productId, before: { tiers: before.map(({ minimumQuantity, maximumQuantity, unitPriceXof, variantId }) => ({ minimumQuantity, maximumQuantity, unitPriceXof, variantId })) }, after: { tiers }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.updated", { productId, changedFields: ["priceTiers"] }, { aggregateId: productId, shopId: context.actor.shopId });
    return { count: tiers.length };
  });
}

/* ─────────────────────────────  Règles de prix catalogue  ───────────────────────────── */

export const catalogRuleListSpec: ListSpec = {
  sortable: { createdAt: catalogPriceRules.createdAt, name: catalogPriceRules.name, dateTo: catalogPriceRules.dateTo, priority: catalogPriceRules.priority },
  filterable: { isActive: { column: catalogPriceRules.isActive, type: "boolean" }, reductionType: { column: catalogPriceRules.reductionType, type: "enum", values: ["percent", "amount", "fixed_price"] } },
  searchable: [catalogPriceRules.name],
  defaultSort: "-createdAt",
};

type RuleRow = typeof catalogPriceRules.$inferSelect;
const ruleView = (row: RuleRow) => ({
  id: row.id, name: row.name, isActive: row.isActive, customerGroupId: row.customerGroupId, countryCode: row.countryCode, currency: row.currency, fromQuantity: row.fromQuantity,
  reductionType: row.reductionType, reductionValue: Number(row.reductionValue), conditions: row.conditions, dateFrom: row.dateFrom?.toISOString() ?? null, dateTo: row.dateTo?.toISOString() ?? null,
  priority: row.priority, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listCatalogRules(database: Db, query: ListQuery) {
  const where = buildWhere(query, catalogRuleListSpec, [isNull(catalogPriceRules.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(catalogPriceRules).where(where).orderBy(...buildOrderBy(query, catalogRuleListSpec, catalogPriceRules.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(catalogPriceRules).where(where),
  ]);
  return { data: rows.map(ruleView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

async function findRule(executor: Executor, id: string) {
  const [row] = await executor.select().from(catalogPriceRules).where(and(eq(catalogPriceRules.id, id), isNull(catalogPriceRules.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Règle de prix catalogue", id);
  return row;
}

/** Nombre de produits (non supprimés) visés par les conditions d'une règle. */
async function matchingProducts(executor: Executor, conditions: CatalogPriceRuleConditions): Promise<number> {
  const rows = await executor.select({ id: products.id, categoryId: products.categoryId, brandId: products.brandId, supplierId: products.supplierId }).from(products).where(isNull(products.deletedAt));
  if (!rows.length) return 0;
  const links = await executor.select({ productId: productCategories.productId, categoryId: productCategories.categoryId }).from(productCategories);
  return rows.filter((row) => ruleMatchesProduct(conditions, { id: row.id, brandId: row.brandId, supplierId: row.supplierId, categoryIds: [row.categoryId, ...links.filter((link) => link.productId === row.id).map((link) => link.categoryId)] })).length;
}

export async function getCatalogRule(database: Db, id: string) {
  const row = await findRule(database, id);
  return { ...ruleView(row), matchingProductCount: await matchingProducts(database, row.conditions) };
}

type RuleInput = { name?: string; isActive?: boolean; customerGroupId?: number | null; countryCode?: string | null; currency?: string | null; fromQuantity?: number; reductionType?: "percent" | "amount" | "fixed_price"; reductionValue?: number; conditions?: CatalogPriceRuleConditions; dateFrom?: Date | null; dateTo?: Date | null; priority?: number };

export async function createCatalogRule(database: Db, input: RuleInput & { name: string; reductionType: "percent" | "amount" | "fixed_price"; reductionValue: number }, context: Context) {
  return database.transaction(async (tx) => {
    const [row] = await tx.insert(catalogPriceRules).values({ ...input, reductionValue: String(input.reductionValue), conditions: input.conditions ?? {}, createdByEmployeeId: context.actor.employeeId, shopId: context.actor.shopId }).returning();
    await recordAudit(tx, { action: "catalog_price_rule.created", entityType: "catalog_price_rule", entityId: row.id, after: ruleView(row), actor: context.actor, meta: context.meta });
    return { ...ruleView(row), matchingProductCount: await matchingProducts(tx, row.conditions) };
  });
}

export async function updateCatalogRule(database: Db, id: string, input: RuleInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findRule(tx, id);
    const merged = { reductionType: input.reductionType ?? before.reductionType, reductionValue: input.reductionValue ?? Number(before.reductionValue) };
    if (merged.reductionType === "percent" && merged.reductionValue > 100) throw errors.validation([{ path: "reductionValue", message: "Un pourcentage ne peut pas dépasser 100." }]);
    const { reductionValue, ...rest } = input;
    const [after] = await tx.update(catalogPriceRules).set({ ...definedEntries(rest), ...(reductionValue !== undefined ? { reductionValue: String(reductionValue) } : {}), updatedAt: new Date() }).where(eq(catalogPriceRules.id, id)).returning();
    await recordAudit(tx, { action: "catalog_price_rule.updated", entityType: "catalog_price_rule", entityId: id, before: ruleView(before), after: ruleView(after), actor: context.actor, meta: context.meta });
    return { ...ruleView(after), matchingProductCount: await matchingProducts(tx, after.conditions) };
  });
}

export async function deleteCatalogRule(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findRule(tx, id);
    await tx.update(catalogPriceRules).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(catalogPriceRules.id, id));
    await recordAudit(tx, { action: "catalog_price_rule.deleted", entityType: "catalog_price_rule", entityId: id, before: ruleView(before), actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Bons de réduction  ───────────────────────────── */

export const voucherListSpec: ListSpec = {
  sortable: { createdAt: promoCodes.createdAt, code: promoCodes.code, endsAt: promoCodes.endsAt, usageCount: promoCodes.usageCount },
  filterable: { isActive: { column: promoCodes.isActive, type: "boolean" }, discountType: { column: promoCodes.discountType, type: "enum", values: ["percent", "amount", "none"] }, freeShipping: { column: promoCodes.freeShipping, type: "boolean" }, endsAt: { column: promoCodes.endsAt, type: "date" } },
  searchable: [promoCodes.code, promoCodes.name],
  defaultSort: "-createdAt",
};

type VoucherRow = typeof promoCodes.$inferSelect;
const voucherView = (row: VoucherRow) => ({
  id: row.id, code: row.code, name: row.name, description: row.description, isActive: row.isActive, startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null,
  usageLimit: row.usageLimit, usageCount: row.usageCount, perCustomerLimit: row.perCustomerLimit, customerId: row.customerId, customerGroupId: row.customerGroupId,
  minimumSubtotalXof: row.minimumSubtotalXof, discountType: row.discountType, discountValue: row.discountValue, maximumDiscountXof: row.maximumDiscountXof,
  freeShipping: row.freeShipping, combinable: row.combinable, excludeDiscountedProducts: row.excludeDiscountedProducts, productIds: row.productIds, categoryIds: row.categoryIds,
  priority: row.priority, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export function toVoucherRule(row: VoucherRow): VoucherRule {
  return {
    id: row.id, code: row.code, isActive: row.isActive && !row.deletedAt, startsAt: row.startsAt, endsAt: row.endsAt, usageLimit: row.usageLimit, usageCount: row.usageCount,
    perCustomerLimit: row.perCustomerLimit, customerId: row.customerId, customerGroupId: row.customerGroupId, minimumSubtotalXof: row.minimumSubtotalXof,
    discountType: row.discountType === "percent" || row.discountType === "amount" ? row.discountType : "none", discountValue: row.discountValue, maximumDiscountXof: row.maximumDiscountXof,
    freeShipping: row.freeShipping, combinable: row.combinable, excludeDiscountedProducts: row.excludeDiscountedProducts, productIds: row.productIds, categoryIds: row.categoryIds, priority: row.priority,
  };
}

export async function listVouchers(database: Db, query: ListQuery) {
  const where = buildWhere(query, voucherListSpec, [isNull(promoCodes.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(promoCodes).where(where).orderBy(...buildOrderBy(query, voucherListSpec, promoCodes.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(promoCodes).where(where),
  ]);
  return { data: rows.map(voucherView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

async function findVoucher(executor: Executor, id: string) {
  const [row] = await executor.select().from(promoCodes).where(and(eq(promoCodes.id, id), isNull(promoCodes.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Bon de réduction", id);
  return row;
}

export async function getVoucher(database: Db, id: string) {
  const row = await findVoucher(database, id);
  const [{ value: redemptions }] = await database.select({ value: count() }).from(promoCodeRedemptions).where(eq(promoCodeRedemptions.promoCodeId, id));
  return { ...voucherView(row), redemptionCount: Number(redemptions) };
}

/** Code lisible sans caractères ambigus (0/O, 1/I). */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `MBM-${Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

type VoucherInput = Partial<Omit<ReturnType<typeof voucherView>, "id" | "createdAt" | "updatedAt" | "usageCount" | "startsAt" | "endsAt">> & { startsAt?: Date | null; endsAt?: Date | null };

export async function createVoucher(database: Db, input: VoucherInput, context: Context) {
  return database.transaction(async (tx) => {
    const code = input.code ? normalizeVoucherCode(input.code) : generateCode();
    const [taken] = await tx.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
    if (taken) throw errors.conflict(`Le code « ${code} » existe déjà.`, { field: "code" });
    const [row] = await tx.insert(promoCodes).values({ ...(input as Partial<typeof promoCodes.$inferInsert>), code, discountType: input.discountType ?? "percent", discountValue: input.discountValue ?? 0, shopId: context.actor.shopId }).returning();
    await recordAudit(tx, { action: "voucher.created", entityType: "voucher", entityId: row.id, after: voucherView(row), actor: context.actor, meta: context.meta });
    return voucherView(row);
  });
}

export async function updateVoucher(database: Db, id: string, input: VoucherInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findVoucher(tx, id);
    const values = definedEntries(input) as Partial<typeof promoCodes.$inferInsert>;
    if (values.code) {
      values.code = normalizeVoucherCode(values.code);
      const [taken] = await tx.select({ id: promoCodes.id }).from(promoCodes).where(and(eq(promoCodes.code, values.code), sql`${promoCodes.id} <> ${id}`)).limit(1);
      if (taken) throw errors.conflict(`Le code « ${values.code} » existe déjà.`, { field: "code" });
    }
    const merged = { ...before, ...values };
    if (merged.discountType === "percent" && merged.discountValue > 100) throw errors.validation([{ path: "discountValue", message: "Un pourcentage ne peut pas dépasser 100." }]);
    if (merged.discountType === "none" && !merged.freeShipping) throw errors.validation([{ path: "freeShipping", message: "Un bon sans remise doit au moins offrir la livraison." }]);
    const [after] = await tx.update(promoCodes).set({ ...values, updatedAt: new Date() }).where(eq(promoCodes.id, id)).returning();
    await recordAudit(tx, { action: "voucher.updated", entityType: "voucher", entityId: id, before: voucherView(before), after: voucherView(after), actor: context.actor, meta: context.meta });
    return voucherView(after);
  });
}

export async function deleteVoucher(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findVoucher(tx, id);
    await tx.update(promoCodes).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(promoCodes.id, id));
    await recordAudit(tx, { action: "voucher.deleted", entityType: "voucher", entityId: id, before: voucherView(before), actor: context.actor, meta: context.meta });
  });
}

/**
 * Simulation de bons sur un panier (boutique ou back-office) : prix réels du client, motifs de
 * refus explicites, cumul appliqué. N'enregistre aucune utilisation (faite à la commande).
 */
export async function checkVouchers(executor: Executor, input: { codes: string[]; lines: Array<{ productId: string; variantId?: number | null; quantity: number }>; country?: string; customerId?: string | null }) {
  let groupIds: number[] = [];
  let primaryGroup: number | null = null;
  if (input.customerId) {
    const [customer] = await executor.select({ groupId: customers.customerGroupId }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
    primaryGroup = customer?.groupId ?? null;
    const members = await executor.select({ groupId: customerGroupMembers.customerGroupId }).from(customerGroupMembers).where(eq(customerGroupMembers.customerId, input.customerId));
    groupIds = [...new Set([...(primaryGroup != null ? [primaryGroup] : []), ...members.map((member) => member.groupId)])];
  }
  const priced = [];
  for (const line of input.lines) {
    const price = await resolvePrice(executor, { productId: line.productId, variantId: line.variantId ?? null, quantity: line.quantity, customerId: input.customerId ?? null, customerGroupId: primaryGroup, countryCode: input.country });
    const [product] = await executor.select({ categoryId: products.categoryId }).from(products).where(eq(products.id, line.productId)).limit(1);
    priced.push({ line, price, categoryIds: await productCategoryIds(executor, line.productId, product.categoryId) });
  }
  const subtotal = priced.reduce((sum, entry) => sum + entry.price.totalInclTaxXof, 0);
  const codes = [...new Set(input.codes.map(normalizeVoucherCode))];
  const rows = await executor.select().from(promoCodes).where(and(inArray(promoCodes.code, codes), isNull(promoCodes.deletedAt)));
  const evaluations = [];
  const unknown = codes.filter((code) => !rows.some((row) => row.code === code)).map((code) => ({ valid: false as const, voucherId: "", code, reason: "unknown" as const, message: "Ce code de réduction n'existe pas." }));
  for (const row of rows) {
    const [{ value: used }] = input.customerId
      ? await executor.select({ value: count() }).from(promoCodeRedemptions).where(and(eq(promoCodeRedemptions.promoCodeId, row.id), eq(promoCodeRedemptions.customerId, input.customerId)))
      : [{ value: 0 }];
    evaluations.push(evaluateVoucher(toVoucherRule(row), {
      lines: priced.map((entry) => ({ productId: entry.line.productId, categoryIds: entry.categoryIds, unitPriceXof: entry.price.unitPriceInclTaxXof, quantity: entry.line.quantity, discounted: entry.price.breakdown.specificRuleApplied })),
      customerId: input.customerId ?? null, customerGroupIds: groupIds, customerUsageCount: Number(used),
    }));
  }
  const combined = combineVouchers(evaluations, subtotal);
  return {
    subtotalInclTaxXof: subtotal,
    discountXof: combined.discountXof,
    totalAfterDiscountXof: subtotal - combined.discountXof,
    freeShipping: combined.freeShipping,
    applied: combined.applied.map((entry) => ({ code: entry.code, discountXof: entry.discountXof, freeShipping: entry.freeShipping })),
    rejected: [...unknown, ...combined.rejected].map((entry) => ({ code: entry.code, reason: entry.reason, message: entry.message })),
  };
}
