/**
 * Listes standardisées : ?page, ?limit, ?sort, ?filter[champ], ?q.
 *
 *   ?page=2&limit=50
 *   ?sort=-createdAt,email            (préfixe « - » = décroissant)
 *   ?filter[status]=active             (égalité)
 *   ?filter[status][in]=active,locked  (liste)
 *   ?filter[createdAt][gte]=2026-01-01 (gte, lte, gt, lt, ne, like)
 *   ?q=dupont                          (recherche libre, colonnes déclarées par la ressource)
 *
 * Chaque ressource déclare les champs triables et filtrables : un champ inconnu
 * est refusé (400) au lieu d'être ignoré silencieusement.
 */
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { errors } from "@/server/core/errors";

export const FILTER_OPERATORS = ["eq", "ne", "in", "gt", "gte", "lt", "lte", "like", "null"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export type FieldType = "string" | "number" | "boolean" | "date" | "uuid" | "enum";

export type FieldSpec = { column: AnyPgColumn; type: FieldType; values?: readonly string[] };

export type ListSpec = {
  sortable: Record<string, AnyPgColumn>;
  filterable: Record<string, FieldSpec>;
  searchable?: AnyPgColumn[];
  defaultSort?: string;
  maxLimit?: number;
  defaultLimit?: number;
};

export type SortTerm = { field: string; direction: "asc" | "desc" };
export type FilterTerm = { field: string; operator: FilterOperator; value: unknown };
export type ListQuery = { page: number; limit: number; offset: number; sort: SortTerm[]; filters: FilterTerm[]; q?: string };

export type ListMeta = { page: number; limit: number; total: number; totalPages: number; sort: string; filters: Record<string, unknown> };
export type ListResult<T> = { data: T[]; meta: ListMeta };

const FILTER_KEY = /^filter\[([A-Za-z][A-Za-z0-9_.]*)\](?:\[([a-z]+)\])?$/;

function coerce(field: string, spec: FieldSpec, raw: string): unknown {
  const fail = () => errors.validation([{ path: `filter.${field}`, message: `Valeur invalide pour ${field} : ${raw}` }]);
  switch (spec.type) {
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw fail();
      return value;
    }
    case "boolean":
      if (raw === "true" || raw === "1") return true;
      if (raw === "false" || raw === "0") return false;
      throw fail();
    case "date": {
      const value = new Date(raw);
      if (Number.isNaN(value.getTime())) throw fail();
      return value;
    }
    case "uuid":
      if (!z.string().uuid().safeParse(raw).success) throw fail();
      return raw;
    case "enum":
      if (spec.values && !spec.values.includes(raw)) throw errors.validation([{ path: `filter.${field}`, message: `Valeur autorisée : ${spec.values.join(", ")}` }]);
      return raw;
    default:
      return raw.slice(0, 200);
  }
}

export function parseListQuery(params: URLSearchParams, spec: ListSpec): ListQuery {
  const maxLimit = spec.maxLimit ?? 100;
  const page = Number(params.get("page") ?? 1);
  const limit = Number(params.get("limit") ?? spec.defaultLimit ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) throw errors.validation([{ path: "page", message: "page doit être un entier ≥ 1." }]);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw errors.validation([{ path: "limit", message: `limit doit être compris entre 1 et ${maxLimit}.` }]);

  const sortParam = params.get("sort") ?? spec.defaultSort ?? "";
  const sort: SortTerm[] = sortParam.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const direction = part.startsWith("-") ? "desc" : "asc";
    const field = part.replace(/^[-+]/, "");
    if (!spec.sortable[field]) throw errors.validation([{ path: "sort", message: `Tri impossible sur « ${field} ». Champs triables : ${Object.keys(spec.sortable).join(", ")}.` }]);
    return { field, direction } as SortTerm;
  });

  const filters: FilterTerm[] = [];
  for (const [key, raw] of params.entries()) {
    const match = FILTER_KEY.exec(key);
    if (!match) continue;
    const [, field, op = "eq"] = match;
    const fieldSpec = spec.filterable[field];
    if (!fieldSpec) throw errors.validation([{ path: `filter.${field}`, message: `Filtre impossible sur « ${field} ». Champs filtrables : ${Object.keys(spec.filterable).join(", ") || "aucun"}.` }]);
    if (!(FILTER_OPERATORS as readonly string[]).includes(op)) throw errors.validation([{ path: `filter.${field}`, message: `Opérateur inconnu « ${op} ».` }]);
    const operator = op as FilterOperator;
    if (operator === "in") {
      const values = raw.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 50).map((value) => coerce(field, fieldSpec, value));
      filters.push({ field, operator, value: values });
    } else if (operator === "null") {
      filters.push({ field, operator, value: raw === "true" || raw === "1" });
    } else if (operator === "like") {
      filters.push({ field, operator, value: raw.slice(0, 120) });
    } else {
      filters.push({ field, operator, value: coerce(field, fieldSpec, raw) });
    }
  }

  const q = params.get("q")?.trim().slice(0, 120) || undefined;
  return { page, limit, offset: (page - 1) * limit, sort, filters, q };
}

/** Échappe %, _ et \ pour une recherche ILIKE sûre. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function buildWhere(query: ListQuery, spec: ListSpec, extra: Array<SQL | undefined> = []): SQL | undefined {
  const conditions: Array<SQL | undefined> = [...extra];
  for (const filter of query.filters) {
    const column = spec.filterable[filter.field].column;
    switch (filter.operator) {
      case "eq": conditions.push(eq(column, filter.value)); break;
      case "ne": conditions.push(ne(column, filter.value)); break;
      case "gt": conditions.push(gt(column, filter.value)); break;
      case "gte": conditions.push(gte(column, filter.value)); break;
      case "lt": conditions.push(lt(column, filter.value)); break;
      case "lte": conditions.push(lte(column, filter.value)); break;
      case "in": conditions.push((filter.value as unknown[]).length ? inArray(column, filter.value as unknown[]) : sql`false`); break;
      case "like": conditions.push(ilike(column, likePattern(String(filter.value)))); break;
      case "null": conditions.push(filter.value ? isNull(column) : isNotNull(column)); break;
    }
  }
  if (query.q && spec.searchable?.length) conditions.push(or(...spec.searchable.map((column) => ilike(column, likePattern(query.q!)))));
  const defined = conditions.filter((condition): condition is SQL => Boolean(condition));
  return defined.length ? and(...defined) : undefined;
}

export function buildOrderBy(query: ListQuery, spec: ListSpec, tieBreaker?: AnyPgColumn): SQL[] {
  const terms = query.sort.map((term) => (term.direction === "desc" ? desc(spec.sortable[term.field]) : asc(spec.sortable[term.field])));
  if (tieBreaker) terms.push(asc(tieBreaker));
  return terms;
}

export function listMeta(query: ListQuery, total: number): ListMeta {
  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    sort: query.sort.map((term) => `${term.direction === "desc" ? "-" : ""}${term.field}`).join(","),
    filters: Object.fromEntries(query.filters.map((filter) => [filter.operator === "eq" ? filter.field : `${filter.field}[${filter.operator}]`, filter.value instanceof Date ? filter.value.toISOString() : filter.value])),
  };
}

/** Paramètres documentés dans OpenAPI pour une liste. */
export function listParameters(spec: ListSpec) {
  return {
    sortable: Object.keys(spec.sortable),
    filterable: Object.fromEntries(Object.entries(spec.filterable).map(([key, value]) => [key, value.type === "enum" ? { type: value.type, values: value.values } : { type: value.type }])),
    searchable: Boolean(spec.searchable?.length),
    maxLimit: spec.maxLimit ?? 100,
  };
}
