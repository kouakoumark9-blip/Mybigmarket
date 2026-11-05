import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { shippingQuotes } from "@/lib/db/schema";
import { cartFingerprint } from "@/lib/shipping-quote";
import type { Db } from "@/server/core/db";
import { quoteLines } from "@/server/modules/shipping/service";
import { enforceRateLimit } from "@/server/core/rate-limit";

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

const clientKey = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown").slice(0, 64);
};

export async function POST(request: Request) {
  const now = new Date();
  // Compteur partagé entre toutes les instances (PostgreSQL ou Upstash), comme l'API v1.
  if (process.env.DATABASE_URL) {
    try {
      await enforceRateLimit(() => getDb() as unknown as Db, "shop.quote", clientKey(request));
    } catch (error) {
      const retryAfter = (error as { headers?: Record<string, string> }).headers?.["retry-after"] ?? "60";
      return NextResponse.json(
        { error: "rate_limited", message: "Trop de demandes de devis. Merci de patienter un instant." },
        { status: 429, headers: { "Retry-After": retryAfter } },
      );
    }
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

  const db = getDb();
  // Lecture des colis et des grilles, puis devis par zone : `server/modules/shipping/service.ts`.
  const priced = await quoteLines(db as unknown as Db, {
    countryCode: input.countryCode, regionCode: input.regionCode ?? null, city: input.city ?? null, lines, isFragile: input.isFragile, preference: input.preference, now,
  });
  if (priced.unknown.length) {
    return NextResponse.json(
      { error: "product_unavailable", message: "Un article du panier n'est plus disponible à la vente.", productIds: priced.unknown.slice(0, 10) },
      { status: 409 },
    );
  }
  const result = priced.quote;
  const subtotalXof = priced.subtotalXof;

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
