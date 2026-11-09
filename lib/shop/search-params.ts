import type { ProductFilters, ProductSort } from "./types";

export type RawParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const int = (value: string) => { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; };
const SORTS: ProductSort[] = ["pertinence", "prix-croissant", "prix-decroissant", "nouveautes"];

/** Filtres lus dans l'adresse (?marque=&puissance=&min=&max=&stock=&tri=&page=&q=). */
export function readFilters(params: RawParams): ProductFilters & { page: number; sort: ProductSort } {
  const sort = one(params.tri) as ProductSort;
  const stock = one(params.stock);
  return {
    q: one(params.q).trim().slice(0, 80) || undefined,
    brand: /^[a-z0-9-]{1,60}$/.test(one(params.marque)) ? one(params.marque) : undefined,
    power: one(params.puissance).slice(0, 40) || undefined,
    minPrice: int(one(params.min)), maxPrice: int(one(params.max)),
    stock: stock === "en-stock" ? "in_stock" : stock === "sur-commande" ? "on_order" : undefined,
    sort: SORTS.includes(sort) ? sort : "pertinence",
    page: int(one(params.page)) ?? 1,
  };
}

/** Adresse de la page avec ces paramètres (les valeurs vides sont retirées). */
export function withParams(base: string, params: RawParams, changes: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) { const text = one(value as string | string[] | undefined); if (text) query.set(key, text); }
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

export const hasActiveFilters = (params: RawParams) => ["q", "marque", "puissance", "min", "max", "stock", "page"].some((key) => one(params[key]));
