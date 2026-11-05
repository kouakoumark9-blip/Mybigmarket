/**
 * Contexte boutique (fondation du multi-boutique).
 *
 * Résolution : en-tête `X-Shop-Code`, puis domaine de la requête, puis boutique par défaut.
 * Aujourd'hui une seule boutique existe ; toutes les données nouvelles portent déjà shopId,
 * ce qui permettra d'en héberger d'autres sans refonte.
 */
import { and, eq, isNull } from "drizzle-orm";
import { DEFAULT_SHOP_ID, employeeShops, shops } from "@/lib/db/schema";
import { hasPermission, type AdminPrincipal } from "@/server/core/auth/principal";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";

export type ShopContext = { id: string; code: string; name: string };

const DEFAULT_CONTEXT: ShopContext = { id: DEFAULT_SHOP_ID, code: "default", name: "mybigmarket" };
let cache: { at: number; shops: Array<ShopContext & { domain: string | null; isDefault: boolean }> } | null = null;
const CACHE_MS = 60_000;

export function clearShopCache() {
  cache = null;
}

async function activeShops(database: Db) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.shops;
  const rows = await database.select({ id: shops.id, code: shops.code, name: shops.name, domain: shops.domain, isDefault: shops.isDefault })
    .from(shops).where(and(eq(shops.isActive, true), isNull(shops.deletedAt)));
  cache = { at: Date.now(), shops: rows };
  return rows;
}

export async function resolveShop(database: Db, headers: Headers): Promise<ShopContext> {
  let list: Awaited<ReturnType<typeof activeShops>>;
  try {
    list = await activeShops(database);
  } catch {
    // Base pas encore migrée (table shops absente) : on reste sur la boutique par défaut.
    return DEFAULT_CONTEXT;
  }
  const code = headers.get("x-shop-code")?.trim().toLowerCase();
  if (code) {
    const byCode = list.find((shop) => shop.code === code);
    if (!byCode) throw errors.notFound("Boutique", code);
    return { id: byCode.id, code: byCode.code, name: byCode.name };
  }
  const host = (headers.get("x-forwarded-host") || headers.get("host") || "").split(":")[0].toLowerCase();
  const byDomain = host ? list.find((shop) => shop.domain?.toLowerCase() === host) : undefined;
  const chosen = byDomain ?? list.find((shop) => shop.isDefault) ?? list[0];
  return chosen ? { id: chosen.id, code: chosen.code, name: chosen.name } : DEFAULT_CONTEXT;
}

/**
 * Boutiques accessibles à un acteur de l'administration (null : toutes). SuperAdmin ou permission
 * « shops.manage » : toutes ; clé d'API : sa boutique ; employé : ses boutiques attribuées, ou la
 * boutique par défaut s'il n'en a aucune.
 */
export async function accessibleShopIds(database: Db, principal: AdminPrincipal): Promise<string[] | null> {
  if (principal.kind === "api_key") return [principal.shopId];
  if (principal.roleCode === "super_admin" || principal.permissions.has("*") || hasPermission(principal, "shops.manage") || !principal.employeeId) return null;
  try {
    const rows = await database.select({ shopId: employeeShops.shopId }).from(employeeShops).where(eq(employeeShops.employeeId, principal.employeeId));
    return rows.length ? rows.map((row) => row.shopId) : [DEFAULT_SHOP_ID];
  } catch {
    // Base pas encore migrée (table absente) : comportement historique, boutique par défaut seulement.
    return [DEFAULT_SHOP_ID];
  }
}

export async function canAccessShop(database: Db, principal: AdminPrincipal, shopId: string): Promise<boolean> {
  const ids = await accessibleShopIds(database, principal);
  return ids === null || ids.includes(shopId);
}
