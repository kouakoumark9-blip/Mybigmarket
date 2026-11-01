import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  products,
  productPackaging,
  shippingDiscountTiers,
  shippingMethods,
  shippingQuotes,
  shippingRates,
  shippingZones,
} from "@/lib/db/schema";
import { quoteShippingOptions, cartFingerprint, type MethodInput, type DiscountTierInput, type ZoneInput } from "@/lib/shipping-quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Devis de transport public (module 4).
 *
 * Le client envoie son panier ; le serveur relit les produits, les dimensions,
 * les transporteurs et les grilles en base. Aucun prix n'est accepté depuis la
 * requête : le sous-total, le poids et le volume sont recalculés ici.
 * Les transporteurs d'exemple restent exposés mais marqués `billable: false`,
 * ce qui interdit de les facturer.
 */

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(10000),
});

const requestSchema = z.object({
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  regionCode: z.string().trim().max(40).optional(),
  city: z.string().trim().max(120).optional(),
  lines: z.array(lineSchema).min(1).max(50),
  isFragile: z.boolean().optional(),
  preference: z.enum(["air_only", "sea_only", "both", "automatic"]).optional(),
  /** Choix explicite du client, pour re-vérifier un pointage de commande. */
  methodCode: z.string().trim().max(30).optional(),
});

/** Limitation de débit en mémoire : suffisant par instance, à doubler d'un cache partagé en production multi-régions. */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string, now: number): { limited: boolean; retryAfter: number } {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5000) {
      for (const [candidate, value] of hits) if (value.resetAt <= now) hits.delete(candidate);
    }
    return { limited: false, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS) return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  return { limited: false, retryAfter: 0 };
}

const clientKey = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown").slice(0, 64);
};

const toCentimeters = (millimeters: number) => Math.max(0, millimeters) / 10;

export async function POST(request: Request) {
  const now = new Date();
  const limited = rateLimited(clientKey(request), now.getTime());
  if (limited.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Trop de demandes de devis. Merci de patienter un instant." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "Pays, ville ou lignes du panier invalides.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Fusionne les lignes en double pour éviter de gonfler artificiellement le panier.
  const merged = new Map<string, number>();
  for (const line of input.lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  const lines = [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  const productIds = lines.map((line) => line.productId);

  const db = getDb();
  const productRows = await db
    .select({
      id: products.id,
      title: products.title,
      priceXof: products.priceXof,
      quantity: products.quantity,
      weightGrams: products.weightGrams,
      lengthMm: products.lengthMm,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
    })
    .from(products)
    .where(and(
      inArray(products.id, productIds),
      isNull(products.deletedAt),
      or(eq(products.status, "approved"), eq(products.status, "published")),
    ));

  const packagingRows = await db
    .select({
      productId: productPackaging.productId,
      unitsPerSale: productPackaging.unitsPerSale,
      lengthCm: productPackaging.lengthCm,
      widthCm: productPackaging.widthCm,
      heightCm: productPackaging.heightCm,
      grossWeightKg: productPackaging.grossWeightKg,
      shippingPreference: productPackaging.shippingPreference,
      fragile: productPackaging.fragile,
    })
    .from(productPackaging)
    .where(inArray(productPackaging.productId, productIds));
  const packagingByProduct = new Map(packagingRows.map((row) => [row.productId, row]));

  const byId = new Map(productRows.map((row) => [row.id, row]));
  const unknown = lines.filter((line) => !byId.has(line.productId)).map((line) => line.productId);
  if (unknown.length) {
    return NextResponse.json(
      { error: "product_unavailable", message: "Un article du panier n'est plus disponible à la vente.", productIds: unknown.slice(0, 10) },
      { status: 409 },
    );
  }

  // Recalcul serveur : le sous-total et les colis ne viennent jamais du client.
  let subtotalXof = 0;
  let isFragile = input.isFragile === true;
  let preference = input.preference;
  const packages = lines.map((line) => {
    const product = byId.get(line.productId)!;
    const packaging = packagingByProduct.get(line.productId);
    subtotalXof += product.priceXof * line.quantity;
    if (packaging?.fragile) isFragile = true;
    const unitsPerSale = Math.max(1, packaging?.unitsPerSale ?? 1);
    const weightGrams = packaging && Number(packaging.grossWeightKg) > 0
      ? Math.round(Number(packaging.grossWeightKg) * 1000) * unitsPerSale
      : product.weightGrams;
    const dimensions = packaging && Number(packaging.lengthCm) > 0
      ? { lengthCm: Number(packaging.lengthCm), widthCm: Number(packaging.widthCm), heightCm: Number(packaging.heightCm) }
      : { lengthCm: toCentimeters(product.lengthMm), widthCm: toCentimeters(product.widthMm), heightCm: toCentimeters(product.heightMm) };
    if (!preference && packaging?.shippingPreference && packaging.shippingPreference !== "automatic") {
      preference = packaging.shippingPreference;
    }
    return { ...dimensions, weightGrams: Math.max(0, weightGrams), quantity: line.quantity };
  });

  const [zoneRows, methodRows, rateRows, tierRows] = await Promise.all([
    db.select({
      id: shippingZones.id, code: shippingZones.code, name: shippingZones.name,
      countryCodes: shippingZones.countryCodes, regionCodes: shippingZones.regionCodes,
      cityNames: shippingZones.cityNames, isActive: shippingZones.isActive,
      isDefault: shippingZones.isDefault, sortOrder: shippingZones.sortOrder, deletedAt: shippingZones.deletedAt,
    }).from(shippingZones).where(and(eq(shippingZones.isActive, true), isNull(shippingZones.deletedAt))),
    db.select().from(shippingMethods).where(isNull(shippingMethods.deletedAt)),
    db.select().from(shippingRates).where(and(eq(shippingRates.isActive, true), isNull(shippingRates.deletedAt))),
    db.select().from(shippingDiscountTiers).where(eq(shippingDiscountTiers.isActive, true)),
  ]);

  const ratesByMethod = new Map<string, typeof rateRows>();
  for (const rate of rateRows) {
    const list = ratesByMethod.get(rate.shippingMethodId) ?? [];
    list.push(rate);
    ratesByMethod.set(rate.shippingMethodId, list);
  }
  const tiersByMethod = new Map<string, DiscountTierInput[]>();
  for (const tier of tierRows) {
    const list = tiersByMethod.get(tier.shippingMethodId) ?? [];
    list.push({
      shippingZoneId: tier.shippingZoneId,
      minimumBillableUnits: tier.minimumBillableUnits,
      discountPercent: tier.discountPercent,
      isActive: tier.isActive,
      label: tier.label,
    });
    tiersByMethod.set(tier.shippingMethodId, list);
  }

  const methods: MethodInput[] = methodRows.map((method) => ({
    id: method.id,
    code: method.code,
    name: method.name,
    mode: method.mode,
    isActive: method.isActive,
    sampleRatesOnly: method.sampleRatesOnly,
    deletedAt: method.deletedAt,
    billableBasis: method.billableBasis,
    volumetricDivisor: method.volumetricDivisor,
    minimumBillableWeightKg: method.minimumBillableWeightKg,
    seaMinimumVolumeM3: method.seaMinimumVolumeM3,
    minimumChargeXof: method.minimumChargeXof,
    insurancePercent: method.insurancePercent,
    customsHandlingXof: method.customsHandlingXof,
    fragileSurchargeXof: method.fragileSurchargeXof,
    transitDaysMin: method.transitDaysMin,
    transitDaysMax: method.transitDaysMax,
    freeAboveXof: method.freeAboveXof,
    freeAboveWeightGrams: method.freeAboveWeightGrams,
    outOfRangeBehavior: method.outOfRangeBehavior === "use_highest" ? "use_highest" : "disable",
    maxPackageWeightGrams: method.maxPackageWeightGrams,
    maxPackageLengthCm: method.maxPackageLengthCm,
    deliveryTimeLabel: method.deliveryTimeLabel,
    rates: ratesByMethod.get(method.id) ?? [],
    discounts: tiersByMethod.get(method.id) ?? [],
  }));

  const zones: ZoneInput[] = zoneRows.map((zone) => ({ ...zone }));
  const result = quoteShippingOptions(methods, zones, {
    countryCode: input.countryCode,
    regionCode: input.regionCode ?? null,
    city: input.city ?? null,
    packages,
    subtotalXof,
    isFragile,
    preference,
    now,
  });

  // Sélection éventuelle d'un transporteur précis (revérification avant commande).
  let selected = null;
  if (input.methodCode) {
    selected = result.options.find((option) => option.methodCode === input.methodCode) ?? null;
    if (!selected) {
      return NextResponse.json(
        { error: "method_unavailable", message: "Cette option de transport n'est plus disponible pour ce panier.", quote: result },
        { status: 409 },
      );
    }
  }

  // Trace du devis : 30 minutes de validité, purgée par la tâche planifiée.
  try {
    await db.insert(shippingQuotes).values({
      cartFingerprint: cartFingerprint(lines),
      countryCode: input.countryCode,
      regionCode: input.regionCode ?? null,
      subtotalXof,
      totalWeightGrams: result.totals.weightGrams,
      totalVolumeCm3: result.totals.volumeCm3,
      requestPayload: { lines, countryCode: input.countryCode, regionCode: input.regionCode ?? null, city: input.city ?? null },
      responsePayload: { options: result.options.map((option) => ({ code: option.methodCode, totalXof: option.totalXof, mode: option.mode })) },
      optionCount: result.options.length,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    });
  } catch {
    // Le devis reste valable même si la trace échoue : on ne bloque jamais le client ici.
  }

  return NextResponse.json(
    {
      available: result.available,
      zone: result.zone,
      totals: result.totals,
      subtotalXof,
      options: result.options,
      unavailable: result.unavailable,
      cheapestMethodCode: result.cheapestMethodCode,
      fastestMethodCode: result.fastestMethodCode,
      recommendedMode: result.recommendedMode,
      sampleOnly: result.sampleOnly,
      selected,
      quotedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "method_not_allowed", message: "Utilise POST avec le pays et les lignes du panier." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
