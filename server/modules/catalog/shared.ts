/**
 * Outils communs aux modules catalogue, prix et stocks : contexte d'appel, slugs uniques,
 * validateurs partagés et conversion des erreurs du grand livre de stock.
 */
import { z } from "zod";
import { and, eq, isNull, ne, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { slugifyProduct } from "@/lib/catalog-rules";
import { StockLedgerError } from "@/lib/stock-ledger";
import type { Executor } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import type { AdminPrincipal } from "@/server/core/auth/principal";
import type { RequestMeta } from "@/server/core/http/request-context";

export type Context = { actor: AdminPrincipal; meta?: RequestMeta };

/** Contexte d'audit à partir du contexte de route admin. */
export const actorContext = (ctx: { admin: AdminPrincipal; meta: RequestMeta }): Context => ({ actor: ctx.admin, meta: ctx.meta });

export const intIdParams = z.object({ id: z.coerce.number().int().positive("Identifiant invalide.") });
export const uuidParams = z.object({ id: z.string().uuid("Identifiant invalide.") });

export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug : lettres minuscules, chiffres et tirets.").max(200);
export const metaTitle = z.string().trim().max(190);
export const metaDescription = z.string().trim().max(320);
export const urlSchema = z.string().trim().max(2000).refine((value) => value.startsWith("https://") || value.startsWith("/"), "URL HTTPS ou chemin relatif attendu.");
export const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Code pays ISO à 2 lettres.");
export const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Code devise ISO à 3 lettres.");

/** Booléen de requête (`?active=true`). */
export const queryBoolean = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

/**
 * Slug unique pour une table : part du slug demandé (ou du nom), ajoute -2, -3… si déjà pris.
 * Les lignes supprimées logiquement gardent leur slug (restauration possible).
 */
export async function uniqueSlug(
  executor: Executor,
  table: PgTable,
  columns: { slug: AnyPgColumn; id: AnyPgColumn },
  source: string,
  options: { excludeId?: string | number; maxLength?: number; explicit?: boolean } = {},
): Promise<string> {
  const base = slugifyProduct(source, options.maxLength ?? 160);
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const conditions: SQL[] = [eq(columns.slug, candidate)];
    if (options.excludeId !== undefined) conditions.push(ne(columns.id, options.excludeId));
    const [taken] = await executor.select({ id: columns.id }).from(table).where(and(...conditions)).limit(1);
    if (!taken) return candidate;
    if (options.explicit) throw errors.conflict(`Le slug « ${candidate} » est déjà utilisé.`, { field: "slug" });
  }
  throw errors.conflict("Impossible de générer un slug unique.");
}

/** Erreur du grand livre de stock → erreur API uniforme. */
export function fromLedgerError(error: unknown): never {
  if (error instanceof StockLedgerError) {
    if (error.code === "NOT_FOUND") throw new AppError("NOT_FOUND", error.message, error.details);
    if (error.code === "INSUFFICIENT_STOCK") throw errors.rule(error.message, { reason: "insufficient_stock", ...error.details });
    throw errors.validation([{ path: "stock", message: error.message }], error.message);
  }
  throw error;
}

/** Copie des seules clés définies (PATCH partiel). */
export function definedEntries<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Sous-ensemble d'un enregistrement pour l'audit (état avant/après). */
export function pick<T extends Record<string, unknown>>(row: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
}

export const notDeleted = (column: AnyPgColumn) => isNull(column);

export const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
