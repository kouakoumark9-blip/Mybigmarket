/**
 * Contexte boutique (fondation du multi-boutique).
 *
 * Résolution : en-tête `X-Shop-Code`, puis domaine de la requête, puis boutique par défaut.
 * Aujourd'hui une seule boutique existe ; toutes les données nouvelles portent déjà shopId,
 * ce qui permettra d'en héberger d'autres sans refonte.
 */
import { and, eq, isNull } from "drizzle-orm";
import { DEFAULT_SHOP_ID, shops } from "@/lib/db/schema";
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
