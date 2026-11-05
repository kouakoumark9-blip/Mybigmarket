/**
 * Livraison (étape 5) : devis de transport, choix du transporteur au passage de commande,
 * transporteurs, zones et tranches, points relais, lots de groupage Chine → Afrique et suivi.
 *
 * Le calcul tarifaire reste dans `lib/shipping-quote.ts` (fonctions pures, testées) ; ce module lit
 * la base et applique les décisions. Une grille « d'exemple » n'est jamais facturée.
 */
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  orderEvents, orderStatusHistory, orders, pickupPoints, productPackaging, products, shipmentOrders, shipments, shippingDiscountTiers, shippingMethods,
  shippingRates, shippingZones, users,
} from "@/lib/db/schema";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-rules";
import type { PackageInput } from "@/lib/shipping-calc";
import { quoteShippingOptions, resolveZone, type DiscountTierInput, type MethodInput, type QuoteOption, type QuoteResponse, type ZoneInput } from "@/lib/shipping-quote";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { buildOrderBy, buildWhere, likePattern, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import type { Context } from "@/server/modules/catalog/shared";
import { applyOrderStatus, employeeActor } from "@/server/modules/orders/service";

export type ShippingLine = { productId: string; quantity: number };

/* ─────────────────────────────  Devis  ───────────────────────────── */

const toCentimeters = (millimeters: number) => Math.max(0, millimeters) / 10;

/** Colis d'un panier, relus en base (dimensions, poids, conditionnement, restrictions). */
export async function packagesForLines(executor: Executor, lines: ShippingLine[]) {
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  const productIds = [...merged.keys()];
  if (!productIds.length) return { packages: [] as PackageInput[], subtotalXof: 0, isFragile: false, preference: undefined, unknown: [] as string[], lines: [] as ShippingLine[] };
  const [productRows, packagingRows] = await Promise.all([
    executor.select({ id: products.id, priceXof: products.priceXof, weightGrams: products.weightGrams, lengthMm: products.lengthMm, widthMm: products.widthMm, heightMm: products.heightMm })
      .from(products).where(and(inArray(products.id, productIds), isNull(products.deletedAt), or(eq(products.status, "approved"), eq(products.status, "published")))),
    executor.select().from(productPackaging).where(inArray(productPackaging.productId, productIds)),
  ]);
  const byId = new Map(productRows.map((row) => [row.id, row]));
  const packagingByProduct = new Map(packagingRows.map((row) => [row.productId, row]));
  const unknown = productIds.filter((id) => !byId.has(id));
  let subtotalXof = 0;
  let isFragile = false;
  let preference: "air_only" | "sea_only" | "both" | "automatic" | undefined;
  const packages: PackageInput[] = [];
  for (const [productId, quantity] of merged) {
    const product = byId.get(productId);
    if (!product) continue;
    const packaging = packagingByProduct.get(productId);
    subtotalXof += product.priceXof * quantity;
    if (packaging?.fragile) isFragile = true;
    const unitsPerSale = Math.max(1, packaging?.unitsPerSale ?? 1);
    const weightGrams = packaging && Number(packaging.grossWeightKg) > 0 ? Math.round(Number(packaging.grossWeightKg) * 1000) * unitsPerSale : product.weightGrams;
    const dimensions = packaging && Number(packaging.lengthCm) > 0
      ? { lengthCm: Number(packaging.lengthCm), widthCm: Number(packaging.widthCm), heightCm: Number(packaging.heightCm) }
      : { lengthCm: toCentimeters(product.lengthMm), widthCm: toCentimeters(product.widthMm), heightCm: toCentimeters(product.heightMm) };
    if (!preference && packaging?.shippingPreference && packaging.shippingPreference !== "automatic") preference = packaging.shippingPreference;
    packages.push({ ...dimensions, weightGrams: Math.max(0, weightGrams), quantity });
  }
  return { packages, subtotalXof, isFragile, preference, unknown, lines: [...merged].map(([productId, quantity]) => ({ productId, quantity })) };
}

/** Transporteurs, zones, tranches actives et paliers de remise. */
export async function loadShippingCatalog(executor: Executor) {
  const [zoneRows, methodRows, rateRows, tierRows] = await Promise.all([
    executor.select().from(shippingZones).where(and(eq(shippingZones.isActive, true), isNull(shippingZones.deletedAt))),
    executor.select().from(shippingMethods).where(isNull(shippingMethods.deletedAt)),
    executor.select().from(shippingRates).where(and(eq(shippingRates.isActive, true), isNull(shippingRates.deletedAt))),
    executor.select().from(shippingDiscountTiers).where(eq(shippingDiscountTiers.isActive, true)),
  ]);
  const zones: ZoneInput[] = zoneRows.map((zone) => ({ id: zone.id, code: zone.code, name: zone.name, countryCodes: zone.countryCodes, regionCodes: zone.regionCodes, cityNames: zone.cityNames, isActive: zone.isActive, isDefault: zone.isDefault, sortOrder: zone.sortOrder, deletedAt: zone.deletedAt }));
  /** Transporteurs avec les seules tranches de la zone donnée (une grille par zone). */
  const methodsForZone = (zoneId: string): MethodInput[] => methodRows.map((method) => ({
    id: method.id, code: method.code, name: method.name, mode: method.mode, isActive: method.isActive, sampleRatesOnly: method.sampleRatesOnly, deletedAt: method.deletedAt,
    billableBasis: method.billableBasis, volumetricDivisor: method.volumetricDivisor, minimumBillableWeightKg: method.minimumBillableWeightKg, seaMinimumVolumeM3: method.seaMinimumVolumeM3,
    minimumChargeXof: method.minimumChargeXof, insurancePercent: method.insurancePercent, customsHandlingXof: method.customsHandlingXof, fragileSurchargeXof: method.fragileSurchargeXof,
    transitDaysMin: method.transitDaysMin, transitDaysMax: method.transitDaysMax, freeAboveXof: method.freeAboveXof, freeAboveWeightGrams: method.freeAboveWeightGrams,
    outOfRangeBehavior: method.outOfRangeBehavior === "use_highest" ? "use_highest" : "disable", maxPackageWeightGrams: method.maxPackageWeightGrams, maxPackageLengthCm: method.maxPackageLengthCm,
    deliveryTimeLabel: method.deliveryTimeLabel,
    rates: rateRows.filter((rate) => rate.shippingMethodId === method.id && rate.shippingZoneId === zoneId).map((rate) => ({ ...rate, sampleOnly: rate.sampleOnly || method.sampleRatesOnly })),
    discounts: tierRows.filter((tier) => tier.shippingMethodId === method.id && (!tier.shippingZoneId || tier.shippingZoneId === zoneId))
      .map((tier): DiscountTierInput => ({ shippingZoneId: null, minimumBillableUnits: tier.minimumBillableUnits, discountPercent: tier.discountPercent, isActive: tier.isActive, label: tier.label })),
  }));
  return { zones, methodRows, methodsForZone };
}

export type QuoteRequestInput = { countryCode: string; regionCode?: string | null; city?: string | null; lines: ShippingLine[]; subtotalXof?: number; isFragile?: boolean; preference?: "air_only" | "sea_only" | "both" | "automatic"; now?: Date };

/**
 * Devis pour des lignes de panier : la zone est résolue d'abord, puis chaque transporteur est chiffré
 * avec les seules tranches de cette zone. Le sous-total sert aux franchises (port offert).
 */
export async function quoteLines(executor: Executor, input: QuoteRequestInput, catalog?: Awaited<ReturnType<typeof loadShippingCatalog>>) {
  const loaded = await packagesForLines(executor, input.lines);
  const { zones, methodsForZone } = catalog ?? await loadShippingCatalog(executor);
  const request = { countryCode: input.countryCode.toUpperCase(), regionCode: input.regionCode ?? null, city: input.city ?? null };
  const zone = resolveZone(zones, request);
  const quote: QuoteResponse = quoteShippingOptions(zone ? methodsForZone(zone.id) : [], zones, {
    ...request, packages: loaded.packages, subtotalXof: input.subtotalXof ?? loaded.subtotalXof, isFragile: input.isFragile || loaded.isFragile,
    preference: input.preference ?? loaded.preference, forcedZoneCode: zone?.code ?? null, now: input.now,
  });
  return { quote, subtotalXof: input.subtotalXof ?? loaded.subtotalXof, unknown: loaded.unknown, lines: loaded.lines };
}

/** Option facturable d'un transporteur dans un devis. */
export const billableOption = (quote: QuoteResponse, methodCode: string): QuoteOption | null => quote.options.find((option) => option.methodCode === methodCode && option.billable) ?? null;

export type ShippingGroupPlan = { costXof: number; methodId: string | null; mode: "air" | "sea" | null; snapshot: Record<string, unknown> | null };

/**
 * Transport d'une commande par vendeur au passage en caisse :
 *   - un transporteur choisi doit être facturable pour chaque commande (sinon refus) ;
 *   - sans choix : refus si un transporteur facturable existe et que le réglage l'exige ;
 *     sinon transport « à confirmer » (0 FCFA), comme avant l'étape 5 ;
 *   - un bon « livraison offerte » ramène le transport à 0 FCFA.
 */
export async function planShipping(executor: Executor, input: {
  groups: Array<{ sellerId: string; lines: ShippingLine[]; totalXof: number }>; countryCode: string; city?: string | null; methodCode?: string | null;
  freeShipping: boolean; requireBillable: boolean;
}): Promise<ShippingGroupPlan[]> {
  const catalog = await loadShippingCatalog(executor);
  const quotes = [];
  for (const group of input.groups) quotes.push((await quoteLines(executor, { countryCode: input.countryCode, city: input.city, lines: group.lines, subtotalXof: group.totalXof }, catalog)).quote);
  if (!input.methodCode) {
    const billable = quotes.filter((quote) => quote.options.some((option) => option.billable));
    if (input.requireBillable && billable.length) {
      const codes = commonBillableMethods(quotes).map((method) => method.code);
      throw errors.rule("Choisissez un mode de transport.", { reason: "shipping_method_required", methods: codes });
    }
    return quotes.map((quote) => ({ costXof: 0, methodId: null, mode: null, snapshot: { pending: true, zone: quote.zone, note: "Transport à confirmer" } }));
  }
  return quotes.map((quote, index) => {
    const option = billableOption(quote, input.methodCode!);
    if (!option) throw errors.rule("Ce mode de transport n'est pas disponible pour tous les articles de la commande.", { reason: "shipping_method_unavailable", methodCode: input.methodCode, sellerId: input.groups[index].sellerId, unavailable: quote.unavailable.filter((entry) => entry.methodCode === input.methodCode) });
    const costXof = input.freeShipping ? 0 : option.totalXof;
    return { costXof, methodId: option.methodId, mode: option.mode, snapshot: { ...option, zone: quote.zone, freeShippingVoucher: input.freeShipping, chargedXof: costXof, quotedAt: new Date().toISOString() } };
  });
}

/** Transporteurs facturables pour toutes les commandes, avec le coût cumulé. */
export function commonBillableMethods(quotes: QuoteResponse[]) {
  if (!quotes.length) return [];
  const first = quotes[0].options.filter((option) => option.billable);
  return first.filter((option) => quotes.every((quote) => billableOption(quote, option.methodCode))).map((option) => {
    const all = quotes.map((quote) => billableOption(quote, option.methodCode)!);
    return {
      code: option.methodCode, name: option.methodName, mode: option.mode, totalXof: all.reduce((sum, entry) => sum + entry.totalXof, 0),
      transitDaysMin: Math.max(...all.map((entry) => entry.transitDaysMin)), transitDaysMax: Math.max(...all.map((entry) => entry.transitDaysMax)), deliveryTimeLabel: option.deliveryTimeLabel,
    };
  }).sort((a, b) => a.totalXof - b.totalXof);
}

/* ─────────────────────────────  Points relais  ───────────────────────────── */

const pickupView = (row: typeof pickupPoints.$inferSelect) => ({ id: row.id, name: row.name, city: row.city, address: row.address, phone: row.phone, openingHours: row.openingHours, isActive: row.isActive });

export async function listPickupPoints(executor: Executor, options: { city?: string; includeInactive?: boolean } = {}) {
  const rows = await executor.select().from(pickupPoints)
    .where(and(options.includeInactive ? undefined : eq(pickupPoints.isActive, true), options.city ? ilike(pickupPoints.city, likePattern(options.city)) : undefined))
    .orderBy(asc(pickupPoints.city), asc(pickupPoints.name));
  return rows.map(pickupView);
}

type PickupInput = { name: string; city: string; address: string; phone?: string | null; openingHours?: string | null; isActive?: boolean };

export async function createPickupPoint(database: Db, input: PickupInput, context: Context) {
  return database.transaction(async (tx) => {
    const [duplicate] = await tx.select({ id: pickupPoints.id }).from(pickupPoints).where(and(eq(pickupPoints.name, input.name), eq(pickupPoints.city, input.city))).limit(1);
    if (duplicate) throw errors.conflict("Un point relais de ce nom existe déjà dans cette ville.");
    const [row] = await tx.insert(pickupPoints).values({ name: input.name, city: input.city, address: input.address, phone: input.phone ?? null, openingHours: input.openingHours ?? null, isActive: input.isActive ?? true }).returning();
    await recordAudit(tx, { action: "pickup_point.created", entityType: "pickup_point", entityId: row.id, after: input, actor: context.actor, meta: context.meta });
    return pickupView(row);
  });
}

export async function updatePickupPoint(database: Db, id: number, input: Partial<PickupInput>, context: Context) {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(pickupPoints).where(eq(pickupPoints.id, id)).limit(1);
    if (!before) throw errors.notFound("Point relais", id);
    const [row] = await tx.update(pickupPoints).set(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))).where(eq(pickupPoints.id, id)).returning();
    await recordAudit(tx, { action: "pickup_point.updated", entityType: "pickup_point", entityId: id, before: pickupView(before), after: input, actor: context.actor, meta: context.meta });
    return pickupView(row);
  });
}

/** Supprime un point relais ; s'il a déjà servi à une commande, il est seulement désactivé. */
export async function deletePickupPoint(database: Db, id: number, context: Context) {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(pickupPoints).where(eq(pickupPoints.id, id)).limit(1);
    if (!before) throw errors.notFound("Point relais", id);
    const [used] = await tx.select({ value: count() }).from(orders).where(eq(orders.pickupPointId, id));
    if (Number(used?.value ?? 0) > 0) {
      await tx.update(pickupPoints).set({ isActive: false }).where(eq(pickupPoints.id, id));
      await recordAudit(tx, { action: "pickup_point.deactivated", entityType: "pickup_point", entityId: id, details: { reason: "utilisé par des commandes" }, actor: context.actor, meta: context.meta });
      return { deleted: false, deactivated: true };
    }
    await tx.delete(pickupPoints).where(eq(pickupPoints.id, id));
    await recordAudit(tx, { action: "pickup_point.deleted", entityType: "pickup_point", entityId: id, before: pickupView(before), actor: context.actor, meta: context.meta });
    return { deleted: true, deactivated: false };
  });
}

/* ─────────────────────────────  Transporteurs, zones, tranches  ───────────────────────────── */

const decimal = (value: number | undefined) => (value === undefined ? undefined : String(value));

export type MethodInputBody = {
  code?: string; mode?: "air" | "sea"; name?: string; isActive?: boolean; sampleRatesOnly?: boolean; volumetricDivisor?: number; minimumBillableWeightKg?: number;
  maximumRecommendedWeightKg?: number; seaMinimumVolumeM3?: number; minimumChargeXof?: number; insurancePercent?: number; customsHandlingXof?: number; fragileSurchargeXof?: number;
  transitDaysMin?: number; transitDaysMax?: number; configurationNote?: string; billableBasis?: "weight" | "volume" | "both"; freeAboveXof?: number; freeAboveWeightGrams?: number;
  outOfRangeBehavior?: "disable" | "use_highest"; maxPackageWeightGrams?: number; maxPackageLengthCm?: number; deliveryTimeLabel?: string; trackingUrlPattern?: string;
};

function methodValues(input: MethodInputBody) {
  const values = {
    ...input,
    minimumBillableWeightKg: decimal(input.minimumBillableWeightKg), maximumRecommendedWeightKg: decimal(input.maximumRecommendedWeightKg),
    seaMinimumVolumeM3: decimal(input.seaMinimumVolumeM3), insurancePercent: decimal(input.insurancePercent),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export async function listShippingMethods(executor: Executor) {
  const [methods, zones, rates] = await Promise.all([
    executor.select().from(shippingMethods).where(isNull(shippingMethods.deletedAt)).orderBy(asc(shippingMethods.code)),
    executor.select().from(shippingZones).where(isNull(shippingZones.deletedAt)),
    executor.select({ methodId: shippingRates.shippingMethodId, zoneId: shippingRates.shippingZoneId, sampleOnly: shippingRates.sampleOnly }).from(shippingRates).where(and(eq(shippingRates.isActive, true), isNull(shippingRates.deletedAt))),
  ]);
  return methods.map((method) => {
    const own = rates.filter((rate) => rate.methodId === method.id);
    const zoneIds = [...new Set(own.map((rate) => rate.zoneId))];
    return {
      ...method, deletedAt: undefined, createdAt: method.createdAt.toISOString(), updatedAt: method.updatedAt.toISOString(),
      zones: zoneIds.map((zoneId) => ({ id: zoneId, code: zones.find((zone) => zone.id === zoneId)?.code ?? null, tiers: own.filter((rate) => rate.zoneId === zoneId).length })),
      billable: method.isActive && !method.sampleRatesOnly && own.some((rate) => !rate.sampleOnly),
    };
  });
}

export async function getShippingMethod(executor: Executor, id: string) {
  const [method] = await executor.select().from(shippingMethods).where(and(eq(shippingMethods.id, id), isNull(shippingMethods.deletedAt))).limit(1);
  if (!method) throw errors.notFound("Transporteur", id);
  const rates = await executor.select().from(shippingRates).where(and(eq(shippingRates.shippingMethodId, id), isNull(shippingRates.deletedAt))).orderBy(asc(shippingRates.shippingZoneId), asc(shippingRates.sortOrder));
  return { ...method, deletedAt: undefined, rates: rates.map((rate) => ({ ...rate, deletedAt: undefined })) };
}

export async function createShippingMethod(database: Db, input: MethodInputBody & { code: string; mode: "air" | "sea"; name: string; transitDaysMin: number; transitDaysMax: number }, context: Context) {
  if (input.transitDaysMax < input.transitDaysMin) throw errors.validation([{ path: "transitDaysMax", message: "Le délai maximum doit être supérieur ou égal au minimum." }]);
  return database.transaction(async (tx) => {
    const [existing] = await tx.select({ id: shippingMethods.id }).from(shippingMethods).where(eq(shippingMethods.code, input.code)).limit(1);
    if (existing) throw errors.conflict("Ce code de transporteur existe déjà.");
    const [row] = await tx.insert(shippingMethods).values(methodValues(input) as unknown as typeof shippingMethods.$inferInsert).returning();
    await recordAudit(tx, { action: "shipping_method.created", entityType: "shipping_method", entityId: row.id, after: input, actor: context.actor, meta: context.meta });
    return getShippingMethod(tx, row.id);
  });
}

export async function updateShippingMethod(database: Db, id: string, input: MethodInputBody, context: Context) {
  return database.transaction(async (tx) => {
    const before = await getShippingMethod(tx, id);
    const min = input.transitDaysMin ?? before.transitDaysMin;
    const max = input.transitDaysMax ?? before.transitDaysMax;
    if (max < min) throw errors.validation([{ path: "transitDaysMax", message: "Le délai maximum doit être supérieur ou égal au minimum." }]);
    if (input.code && input.code !== before.code) {
      const [taken] = await tx.select({ id: shippingMethods.id }).from(shippingMethods).where(eq(shippingMethods.code, input.code)).limit(1);
      if (taken) throw errors.conflict("Ce code de transporteur existe déjà.");
    }
    await tx.update(shippingMethods).set({ ...methodValues(input), updatedAt: new Date() }).where(eq(shippingMethods.id, id));
    await recordAudit(tx, { action: "shipping_method.updated", entityType: "shipping_method", entityId: id, before: { isActive: before.isActive, sampleRatesOnly: before.sampleRatesOnly }, after: input, actor: context.actor, meta: context.meta });
    return getShippingMethod(tx, id);
  });
}

export async function deleteShippingMethod(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    await getShippingMethod(tx, id);
    await tx.update(shippingMethods).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(shippingMethods.id, id));
    await recordAudit(tx, { action: "shipping_method.deleted", entityType: "shipping_method", entityId: id, actor: context.actor, meta: context.meta });
  });
}

export type RateBody = {
  minimumBillableUnits: number; maximumBillableUnits: number | null; rateXofPerUnit: number; minimumChargeXof?: number; label?: string; handlingFeeXof?: number; customsFeeXof?: number;
  transitDaysMin?: number | null; transitDaysMax?: number | null; validFrom?: string | null; validTo?: string | null; sampleOnly?: boolean;
};

/**
 * Remplace la grille d'un transporteur pour une zone. Les tranches sont triées et ne doivent ni se
 * chevaucher ni laisser de trou ; une seule tranche ouverte (sans maximum), en dernier.
 */
export async function replaceRates(database: Db, methodId: string, input: { zoneId: string; rates: RateBody[] }, context: Context) {
  const sorted = [...input.rates].sort((a, b) => a.minimumBillableUnits - b.minimumBillableUnits);
  sorted.forEach((rate, index) => {
    if (rate.maximumBillableUnits !== null && rate.maximumBillableUnits <= rate.minimumBillableUnits) throw errors.validation([{ path: `rates.${index}.maximumBillableUnits`, message: "Le maximum doit dépasser le minimum." }]);
    if (rate.maximumBillableUnits === null && index !== sorted.length - 1) throw errors.validation([{ path: `rates.${index}.maximumBillableUnits`, message: "Seule la dernière tranche peut être ouverte." }]);
    const next = sorted[index + 1];
    if (next && rate.maximumBillableUnits !== null && next.minimumBillableUnits !== rate.maximumBillableUnits) throw errors.validation([{ path: `rates.${index + 1}.minimumBillableUnits`, message: `La tranche doit commencer à ${rate.maximumBillableUnits} (ni trou ni chevauchement).` }]);
  });
  return database.transaction(async (tx) => {
    await getShippingMethod(tx, methodId);
    const [zone] = await tx.select({ id: shippingZones.id }).from(shippingZones).where(and(eq(shippingZones.id, input.zoneId), isNull(shippingZones.deletedAt))).limit(1);
    if (!zone) throw errors.notFound("Zone", input.zoneId);
    const now = new Date();
    await tx.update(shippingRates).set({ deletedAt: now, isActive: false, updatedAt: now }).where(and(eq(shippingRates.shippingMethodId, methodId), eq(shippingRates.shippingZoneId, input.zoneId), isNull(shippingRates.deletedAt)));
    if (sorted.length) {
      await tx.insert(shippingRates).values(sorted.map((rate, index) => ({
        shippingMethodId: methodId, shippingZoneId: input.zoneId, minimumBillableUnits: String(rate.minimumBillableUnits), maximumBillableUnits: rate.maximumBillableUnits === null ? null : String(rate.maximumBillableUnits),
        rateXofPerUnit: rate.rateXofPerUnit, minimumChargeXof: rate.minimumChargeXof ?? 0, sortOrder: index, sampleOnly: rate.sampleOnly ?? false, label: rate.label ?? "",
        handlingFeeXof: rate.handlingFeeXof ?? 0, customsFeeXof: rate.customsFeeXof ?? 0, transitDaysMin: rate.transitDaysMin ?? null, transitDaysMax: rate.transitDaysMax ?? null,
        validFrom: rate.validFrom ? new Date(rate.validFrom) : null, validTo: rate.validTo ? new Date(rate.validTo) : null, isActive: true,
      })));
    }
    await recordAudit(tx, { action: "shipping_rates.replaced", entityType: "shipping_method", entityId: methodId, after: { zoneId: input.zoneId, tiers: sorted.length }, actor: context.actor, meta: context.meta });
    return getShippingMethod(tx, methodId);
  });
}

type ZoneBody = { code?: string; name?: string; countryCodes?: string[]; regionCodes?: string[]; cityNames?: string[]; isActive?: boolean; isDefault?: boolean; sortOrder?: number; notes?: string };
const zoneView = (row: typeof shippingZones.$inferSelect) => ({ id: row.id, code: row.code, name: row.name, countryCodes: row.countryCodes, regionCodes: row.regionCodes, cityNames: row.cityNames, isActive: row.isActive, isDefault: row.isDefault, sortOrder: row.sortOrder, notes: row.notes });

export async function listZones(executor: Executor) {
  const rows = await executor.select().from(shippingZones).where(isNull(shippingZones.deletedAt)).orderBy(asc(shippingZones.sortOrder), asc(shippingZones.code));
  return rows.map(zoneView);
}

export async function saveZone(database: Db, id: string | null, input: ZoneBody, context: Context) {
  return database.transaction(async (tx) => {
    const normalized = { ...input, countryCodes: input.countryCodes?.map((code) => code.toUpperCase()) };
    if (normalized.code) {
      const [taken] = await tx.select({ id: shippingZones.id }).from(shippingZones).where(eq(shippingZones.code, normalized.code)).limit(1);
      if (taken && taken.id !== id) throw errors.conflict("Ce code de zone existe déjà.");
    }
    if (normalized.isDefault) await tx.update(shippingZones).set({ isDefault: false }).where(eq(shippingZones.isDefault, true));
    const values = Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
    let row;
    if (id) {
      const [before] = await tx.select().from(shippingZones).where(and(eq(shippingZones.id, id), isNull(shippingZones.deletedAt))).limit(1);
      if (!before) throw errors.notFound("Zone", id);
      [row] = await tx.update(shippingZones).set(values).where(eq(shippingZones.id, id)).returning();
    } else {
      if (!normalized.code || !normalized.name) throw errors.validation([{ path: "code", message: "Code et nom obligatoires." }]);
      [row] = await tx.insert(shippingZones).values(values as unknown as typeof shippingZones.$inferInsert).returning();
    }
    await recordAudit(tx, { action: id ? "shipping_zone.updated" : "shipping_zone.created", entityType: "shipping_zone", entityId: row.id, after: normalized, actor: context.actor, meta: context.meta });
    return zoneView(row);
  });
}

export async function deleteZone(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const [row] = await tx.update(shippingZones).set({ deletedAt: new Date(), isActive: false }).where(and(eq(shippingZones.id, id), isNull(shippingZones.deletedAt))).returning({ id: shippingZones.id });
    if (!row) throw errors.notFound("Zone", id);
    await recordAudit(tx, { action: "shipping_zone.deleted", entityType: "shipping_zone", entityId: id, actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Suivi d'une commande  ───────────────────────────── */

export const trackingUrlFor = (pattern: string | null | undefined, trackingNumber: string | null | undefined) =>
  pattern && trackingNumber && pattern.includes("{tracking}") ? pattern.replace("{tracking}", encodeURIComponent(trackingNumber)) : null;

const label = (status: string) => ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

/** Suivi d'une commande : étapes datées, transporteur, numéro et lien de suivi, lot de groupage. */
export async function orderTracking(executor: Executor, order: typeof orders.$inferSelect, options: { detailed: boolean }) {
  const [history, method, shipmentRow, pickup] = await Promise.all([
    executor.select({ toStatus: orderStatusHistory.toStatus, createdAt: orderStatusHistory.createdAt }).from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.createdAt)),
    order.shippingMethodId ? executor.select().from(shippingMethods).where(eq(shippingMethods.id, order.shippingMethodId)).limit(1) : Promise.resolve([]),
    order.shipmentId ? executor.select({ shipment: shipments, link: shipmentOrders }).from(shipments).leftJoin(shipmentOrders, and(eq(shipmentOrders.shipmentId, shipments.id), eq(shipmentOrders.orderId, order.id))).where(eq(shipments.id, order.shipmentId)).limit(1) : Promise.resolve([]),
    order.pickupPointId ? executor.select().from(pickupPoints).where(eq(pickupPoints.id, order.pickupPointId)).limit(1) : Promise.resolve([]),
  ]);
  const carrier = method[0];
  const batch = shipmentRow[0];
  const trackingNumber = order.trackingNumber ?? batch?.link?.trackingNumber ?? batch?.shipment.trackingNumber ?? null;
  const address = (order.deliveryAddress ?? {}) as Record<string, string>;
  return {
    reference: order.reference, status: order.status, statusLabel: label(order.status),
    timeline: history.map((entry) => ({ status: entry.toStatus, label: label(entry.toStatus), at: entry.createdAt.toISOString() })),
    carrier: carrier ? { code: carrier.code, name: carrier.name, mode: carrier.mode, deliveryTimeLabel: carrier.deliveryTimeLabel || null } : order.shippingMode ? { code: null, name: null, mode: order.shippingMode, deliveryTimeLabel: null } : null,
    trackingNumber,
    trackingUrl: order.trackingUrl ?? batch?.link?.trackingUrl ?? trackingUrlFor(carrier?.trackingUrlPattern, trackingNumber) ?? batch?.shipment.trackingUrl ?? null,
    shipment: batch ? { batchRef: batch.shipment.batchRef, status: batch.shipment.status, mode: batch.shipment.mode, departedAt: batch.shipment.departedAt?.toISOString() ?? null, expectedArrivalAt: batch.shipment.expectedArrivalAt?.toISOString() ?? null, arrivedAt: batch.shipment.arrivedAt?.toISOString() ?? null } : null,
    delivery: {
      method: order.deliveryMethod,
      city: options.detailed ? address.city ?? pickup[0]?.city ?? null : pickup[0]?.city ?? address.city ?? null,
      pickupPoint: pickup[0] ? { name: pickup[0].name, city: pickup[0].city, ...(options.detailed ? { address: pickup[0].address, openingHours: pickup[0].openingHours } : {}) } : null,
    },
    milestones: { paidAt: order.paidAt?.toISOString() ?? null, shippedAt: order.shippedAt?.toISOString() ?? null, deliveredAt: order.deliveredAt?.toISOString() ?? null },
  };
}

export async function customerOrderTracking(database: Db, userId: string, idOrReference: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrReference);
  const [order] = await database.select().from(orders).where(and(eq(orders.buyerId, userId), isNull(orders.deletedAt), isUuid ? eq(orders.id, idOrReference) : eq(orders.reference, idOrReference))).limit(1);
  if (!order) throw errors.notFound("Commande", idOrReference);
  return orderTracking(database, order, { detailed: true });
}

/** Suivi sans compte : référence et e-mail de l'acheteur. Réponse identique si l'un des deux est faux. */
export async function guestOrderTracking(database: Db, input: { reference: string; email: string }) {
  const [row] = await database.select({ order: orders }).from(orders).innerJoin(users, eq(users.id, orders.buyerId))
    .where(and(eq(orders.reference, input.reference.trim().toUpperCase()), sql`lower(${users.email}) = ${input.email.trim().toLowerCase()}`, isNull(orders.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Commande");
  return orderTracking(database, row.order, { detailed: false });
}

/** Transporteur, numéro et lien de suivi d'une commande (back-office). */
export async function setOrderShipping(database: Db, orderId: string, input: { shippingMethodId?: string | null; trackingNumber?: string | null; trackingUrl?: string | null }, context: Context) {
  return database.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), isNull(orders.deletedAt))).limit(1).for("update");
    if (!order) throw errors.notFound("Commande", orderId);
    let mode = order.shippingMode;
    if (input.shippingMethodId) {
      const method = await getShippingMethod(tx, input.shippingMethodId);
      mode = method.mode;
    }
    const methodId = input.shippingMethodId === undefined ? order.shippingMethodId : input.shippingMethodId;
    const trackingNumber = input.trackingNumber === undefined ? order.trackingNumber : input.trackingNumber;
    let trackingUrl = input.trackingUrl === undefined ? order.trackingUrl : input.trackingUrl;
    if (!trackingUrl && methodId && trackingNumber) {
      const [method] = await tx.select({ pattern: shippingMethods.trackingUrlPattern }).from(shippingMethods).where(eq(shippingMethods.id, methodId)).limit(1);
      trackingUrl = trackingUrlFor(method?.pattern, trackingNumber);
    }
    await tx.update(orders).set({ shippingMethodId: methodId, shippingMode: mode, trackingNumber, trackingUrl, updatedAt: new Date(), version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
    if (trackingNumber && trackingNumber !== order.trackingNumber) await tx.insert(orderEvents).values({ orderId, status: order.status, note: `Numéro de suivi : ${trackingNumber}.` });
    await recordAudit(tx, { action: "order.shipping_updated", entityType: "order", entityId: orderId, before: { shippingMethodId: order.shippingMethodId, trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl }, after: { shippingMethodId: methodId, trackingNumber, trackingUrl }, actor: context.actor, meta: context.meta });
    const [updated] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return orderTracking(tx, updated, { detailed: true });
  });
}

/* ─────────────────────────────  Lots de groupage (expéditions)  ───────────────────────────── */

export type ShipmentStatus = "draft" | "collecting" | "shipped" | "arrived_abidjan" | "closed" | "cancelled";
export const SHIPMENT_STATUSES: ShipmentStatus[] = ["draft", "collecting", "shipped", "arrived_abidjan", "closed", "cancelled"];
const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  draft: ["collecting", "cancelled"], collecting: ["shipped", "cancelled"], shipped: ["arrived_abidjan"], arrived_abidjan: ["closed"], closed: [], cancelled: [],
};
export const SHIPMENT_LABELS: Record<ShipmentStatus, string> = { draft: "Brouillon", collecting: "En constitution", shipped: "Parti de Chine", arrived_abidjan: "Arrivé à Abidjan", closed: "Clôturé", cancelled: "Annulé" };
/** Statuts de commande admis dans un lot : confirmée par le vendeur ou déjà au point de collecte. */
const BATCHABLE: OrderStatus[] = ["seller_confirmed", "received_collection_point"];

export const shipmentListSpec: ListSpec = {
  sortable: { createdAt: shipments.createdAt, departedAt: shipments.departedAt },
  filterable: { status: { column: shipments.status, type: "enum", values: SHIPMENT_STATUSES }, mode: { column: shipments.mode, type: "enum", values: ["air", "sea"] }, createdAt: { column: shipments.createdAt, type: "date" } },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

const shipmentView = (row: typeof shipments.$inferSelect, orderCount?: number) => ({
  id: row.id, batchRef: row.batchRef, status: row.status, statusLabel: SHIPMENT_LABELS[row.status as ShipmentStatus], nextStatuses: SHIPMENT_TRANSITIONS[row.status as ShipmentStatus],
  mode: row.mode, carrierName: row.carrierName, origin: row.origin, destination: row.destination, trackingNumber: row.trackingNumber, trackingUrl: row.trackingUrl,
  expectedArrivalAt: row.expectedArrivalAt?.toISOString() ?? null, departedAt: row.departedAt?.toISOString() ?? null, arrivedAt: row.arrivedAt?.toISOString() ?? null,
  note: row.note, orderCount, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listShipments(database: Db, query: ListQuery) {
  const search = query.q ? or(ilike(shipments.batchRef, likePattern(query.q)), ilike(shipments.trackingNumber, likePattern(query.q))) : undefined;
  const where = buildWhere({ ...query, q: undefined }, shipmentListSpec, [search]);
  const [rows, [total]] = await Promise.all([
    database.select().from(shipments).where(where).orderBy(...buildOrderBy(query, shipmentListSpec, shipments.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(shipments).where(where),
  ]);
  const counts = rows.length ? await database.select({ shipmentId: shipmentOrders.shipmentId, value: count() }).from(shipmentOrders).where(inArray(shipmentOrders.shipmentId, rows.map((row) => row.id))).groupBy(shipmentOrders.shipmentId) : [];
  return { data: rows.map((row) => shipmentView(row, Number(counts.find((entry) => entry.shipmentId === row.id)?.value ?? 0))), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function getShipment(executor: Executor, id: number) {
  const [row] = await executor.select().from(shipments).where(eq(shipments.id, id)).limit(1);
  if (!row) throw errors.notFound("Lot", id);
  const lines = await executor.select({ link: shipmentOrders, order: { id: orders.id, reference: orders.reference, status: orders.status, totalXof: orders.totalXof, deliveryMethod: orders.deliveryMethod } })
    .from(shipmentOrders).innerJoin(orders, eq(orders.id, shipmentOrders.orderId)).where(eq(shipmentOrders.shipmentId, id)).orderBy(asc(orders.reference));
  return {
    ...shipmentView(row, lines.length),
    orders: lines.map(({ link, order }) => ({ ...order, statusLabel: label(order.status), trackingNumber: link.trackingNumber, trackingUrl: link.trackingUrl, dispatchedAt: link.dispatchedAt?.toISOString() ?? null, deliveredAt: link.deliveredAt?.toISOString() ?? null })),
  };
}

type ShipmentBody = { batchRef?: string; mode?: "air" | "sea" | null; carrierName?: string | null; origin?: string; destination?: string; trackingNumber?: string | null; trackingUrl?: string | null; expectedArrivalAt?: string | null; note?: string };
const shipmentValues = (input: ShipmentBody) => Object.fromEntries(Object.entries({ ...input, expectedArrivalAt: input.expectedArrivalAt === undefined ? undefined : input.expectedArrivalAt ? new Date(input.expectedArrivalAt) : null }).filter(([, value]) => value !== undefined));

export async function createShipment(database: Db, input: ShipmentBody, context: Context) {
  return database.transaction(async (tx) => {
    let batchRef = input.batchRef?.trim().toUpperCase();
    if (!batchRef) {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const [{ value }] = await tx.select({ value: count() }).from(shipments).where(ilike(shipments.batchRef, `LOT-${day}-%`));
      batchRef = `LOT-${day}-${String(Number(value) + 1).padStart(2, "0")}`;
    }
    const [taken] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.batchRef, batchRef)).limit(1);
    if (taken) throw errors.conflict("Cette référence de lot existe déjà.");
    const [row] = await tx.insert(shipments).values({ ...shipmentValues(input), batchRef } as typeof shipments.$inferInsert).returning();
    await recordAudit(tx, { action: "shipment.created", entityType: "shipment", entityId: row.id, after: { ...input, batchRef }, actor: context.actor, meta: context.meta });
    return getShipment(tx, row.id);
  });
}

export async function updateShipment(database: Db, id: number, input: ShipmentBody, context: Context) {
  return database.transaction(async (tx) => {
    const before = await getShipment(tx, id);
    if (input.batchRef && input.batchRef.toUpperCase() !== before.batchRef) {
      const [taken] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.batchRef, input.batchRef.toUpperCase())).limit(1);
      if (taken) throw errors.conflict("Cette référence de lot existe déjà.");
    }
    await tx.update(shipments).set({ ...shipmentValues({ ...input, batchRef: input.batchRef?.toUpperCase() }), updatedAt: new Date() }).where(eq(shipments.id, id));
    await recordAudit(tx, { action: "shipment.updated", entityType: "shipment", entityId: id, after: input, actor: context.actor, meta: context.meta });
    return getShipment(tx, id);
  });
}

/**
 * Ajoute des commandes à un lot en constitution. Une commande confirmée par le vendeur passe « reçue au
 * point de collecte ». Une commande n'appartient qu'à un lot ouvert à la fois.
 */
export async function addOrdersToShipment(database: Db, id: number, input: { orderIds: string[]; trackingNumber?: string | null }, context: Context) {
  return database.transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id)).limit(1).for("update");
    if (!shipment) throw errors.notFound("Lot", id);
    if (!["draft", "collecting"].includes(shipment.status)) throw errors.rule("On n'ajoute des commandes qu'à un lot en brouillon ou en constitution.");
    const actor = employeeActor(context);
    for (const orderId of [...new Set(input.orderIds)]) {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), isNull(orders.deletedAt))).limit(1).for("update");
      if (!order) throw errors.notFound("Commande", orderId);
      if (!BATCHABLE.includes(order.status as OrderStatus)) throw errors.rule(`La commande ${order.reference ?? orderId} (« ${label(order.status)} ») doit être confirmée par le vendeur avant d'entrer dans un lot.`, { orderId, status: order.status });
      const [existing] = await tx.select({ link: shipmentOrders, status: shipments.status, batchRef: shipments.batchRef }).from(shipmentOrders).innerJoin(shipments, eq(shipments.id, shipmentOrders.shipmentId)).where(eq(shipmentOrders.orderId, orderId)).limit(1);
      if (existing && existing.link.shipmentId === id) continue;
      if (existing && existing.status !== "cancelled") throw errors.conflict(`La commande ${order.reference ?? orderId} est déjà dans le lot ${existing.batchRef}.`);
      if (existing) await tx.delete(shipmentOrders).where(eq(shipmentOrders.id, existing.link.id));
      await tx.insert(shipmentOrders).values({ shipmentId: id, orderId, shippingMethodId: order.shippingMethodId, mode: order.shippingMode ?? shipment.mode, quotedCostXof: order.shippingCostXof, trackingNumber: input.trackingNumber ?? null });
      await tx.update(orders).set({ shipmentId: id, updatedAt: new Date() }).where(eq(orders.id, orderId));
      if (order.status === "seller_confirmed") await applyOrderStatus(tx, order, { status: "received_collection_point", note: `Reçue au point de collecte (lot ${shipment.batchRef}).` }, actor);
    }
    if (shipment.status === "draft") await tx.update(shipments).set({ status: "collecting", updatedAt: new Date() }).where(eq(shipments.id, id));
    await recordAudit(tx, { action: "shipment.orders_added", entityType: "shipment", entityId: id, after: { orderIds: input.orderIds }, actor: context.actor, meta: context.meta });
    return getShipment(tx, id);
  });
}

export async function removeOrderFromShipment(database: Db, id: number, orderId: string, context: Context) {
  return database.transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id)).limit(1).for("update");
    if (!shipment) throw errors.notFound("Lot", id);
    if (!["draft", "collecting"].includes(shipment.status)) throw errors.rule("Un lot parti ne se modifie plus.");
    const [link] = await tx.delete(shipmentOrders).where(and(eq(shipmentOrders.shipmentId, id), eq(shipmentOrders.orderId, orderId))).returning();
    if (!link) throw errors.notFound("Commande du lot", orderId);
    await tx.update(orders).set({ shipmentId: null, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await recordAudit(tx, { action: "shipment.order_removed", entityType: "shipment", entityId: id, details: { orderId }, actor: context.actor, meta: context.meta });
    return getShipment(tx, id);
  });
}

/**
 * Change le statut d'un lot et le répercute sur ses commandes, avec les effets habituels (stock
 * consommé au départ, historique, événements) : départ → « expédiée », arrivée → « arrivée à Abidjan ».
 * Les commandes annulées, en litige ou remboursées sont laissées telles quelles.
 */
export async function changeShipmentStatus(database: Db, id: number, input: { status: ShipmentStatus; note?: string | null }, context: Context) {
  return database.transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id)).limit(1).for("update");
    if (!shipment) throw errors.notFound("Lot", id);
    const from = shipment.status as ShipmentStatus;
    if (!SHIPMENT_TRANSITIONS[from].includes(input.status)) throw errors.rule(`Un lot « ${SHIPMENT_LABELS[from]} » ne peut pas passer à « ${SHIPMENT_LABELS[input.status]} ».`, { from, to: input.status });
    const links = await tx.select().from(shipmentOrders).where(eq(shipmentOrders.shipmentId, id));
    if (input.status === "shipped" && !links.length) throw errors.rule("Le lot ne contient aucune commande.");
    const now = new Date();
    const actor = employeeActor(context);
    const touched: string[] = [];
    const target: Partial<Record<ShipmentStatus, { from: OrderStatus[]; to: OrderStatus; note: string }>> = {
      shipped: { from: ["seller_confirmed", "received_collection_point"], to: "shipped", note: `Parti de Chine dans le lot ${shipment.batchRef}.` },
      arrived_abidjan: { from: ["shipped"], to: "arrived_abidjan", note: `Arrivé à Abidjan (lot ${shipment.batchRef}).` },
    };
    const step = target[input.status];
    if (step) {
      for (const link of links) {
        const [order] = await tx.select().from(orders).where(eq(orders.id, link.orderId)).limit(1).for("update");
        if (!order || !step.from.includes(order.status as OrderStatus)) continue;
        await applyOrderStatus(tx, order, { status: step.to, note: input.note ?? step.note, trackingNumber: input.status === "shipped" ? link.trackingNumber ?? shipment.trackingNumber : null }, actor);
        if (input.status === "shipped") {
          await tx.update(shipmentOrders).set({ dispatchedAt: now }).where(eq(shipmentOrders.id, link.id));
          if (!order.trackingUrl && (link.trackingUrl || shipment.trackingUrl)) await tx.update(orders).set({ trackingUrl: link.trackingUrl ?? shipment.trackingUrl }).where(eq(orders.id, order.id));
        }
        touched.push(order.id);
      }
    }
    if (input.status === "cancelled") {
      await tx.update(orders).set({ shipmentId: null, updatedAt: now }).where(eq(orders.shipmentId, id));
    }
    await tx.update(shipments).set({
      status: input.status, updatedAt: now, ...(input.status === "shipped" ? { departedAt: now } : {}), ...(input.status === "arrived_abidjan" ? { arrivedAt: now } : {}),
      ...(input.note ? { note: input.note } : {}),
    }).where(eq(shipments.id, id));
    await recordAudit(tx, { action: "shipment.status_changed", entityType: "shipment", entityId: id, before: { status: from }, after: { status: input.status, orders: touched.length }, details: { note: input.note ?? null }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "shipment.status_changed", { shipmentId: id, batchRef: shipment.batchRef, from, to: input.status, orderIds: touched }, { aggregateId: String(id), shopId: context.actor.shopId });
    return getShipment(tx, id);
  });
}

