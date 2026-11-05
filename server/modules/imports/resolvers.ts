/**
 * Résolution des références d'un import (catégorie, marque) à partir d'un instantané chargé une
 * fois pour tout le lot : identifiant, slug, nom (sans accents ni casse) ou chemin « Parent > Enfant ».
 */
import { and, isNull, sql } from "drizzle-orm";
import { foldText } from "@/lib/search";
import { brands, categories } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import type { Context } from "@/server/modules/catalog/shared";
import { createBrand, createCategory } from "@/server/modules/catalog/taxonomy/service";

export type CategoryRef = { id: number; name: string; slug: string; parentId: number | null };
export type BrandRef = { id: number; name: string; slug: string };
export type Resolution<T> = { found: T } | { missing: true } | { error: string };

export class CategoryIndex {
  readonly byId = new Map<number, CategoryRef>();
  readonly bySlug = new Map<string, CategoryRef>();
  private readonly byName = new Map<string, CategoryRef[]>();

  constructor(rows: CategoryRef[]) {
    for (const row of rows) {
      this.byId.set(row.id, row);
      this.bySlug.set(row.slug, row);
      const key = foldText(row.name);
      this.byName.set(key, [...(this.byName.get(key) ?? []), row]);
    }
  }

  named(name: string): CategoryRef[] {
    return this.byName.get(foldText(name)) ?? [];
  }

  resolve(value: string): Resolution<CategoryRef> {
    const text = value.trim();
    if (/^\d+$/.test(text)) {
      const found = this.byId.get(Number(text));
      return found ? { found } : { error: `Catégorie n° ${text} introuvable.` };
    }
    if (text.includes(">")) {
      const segments = text.split(">").map((segment) => segment.trim()).filter(Boolean);
      let candidates = this.named(segments[0]);
      for (const segment of segments.slice(1)) {
        const parentIds = new Set(candidates.map((candidate) => candidate.id));
        candidates = this.named(segment).filter((candidate) => candidate.parentId !== null && parentIds.has(candidate.parentId));
      }
      if (candidates.length === 1) return { found: candidates[0] };
      return candidates.length ? { error: `Chemin de catégorie ambigu « ${text} ».` } : { missing: true };
    }
    const bySlug = this.bySlug.get(text.toLowerCase());
    if (bySlug) return { found: bySlug };
    const named = this.named(text);
    if (named.length === 1) return { found: named[0] };
    if (named.length > 1) return { error: `Plusieurs catégories s'appellent « ${text} » : indiquez le slug ou le chemin « Parent > ${text} ».` };
    return { missing: true };
  }
}

export class BrandIndex {
  readonly byId = new Map<number, BrandRef>();
  private readonly bySlug = new Map<string, BrandRef>();
  private readonly byName = new Map<string, BrandRef[]>();

  constructor(rows: BrandRef[]) {
    for (const row of rows) {
      this.byId.set(row.id, row);
      this.bySlug.set(row.slug, row);
      const key = foldText(row.name);
      this.byName.set(key, [...(this.byName.get(key) ?? []), row]);
    }
  }

  resolve(value: string): Resolution<BrandRef> {
    const text = value.trim();
    if (/^\d+$/.test(text)) {
      const found = this.byId.get(Number(text));
      return found ? { found } : { error: `Marque n° ${text} introuvable.` };
    }
    const bySlug = this.bySlug.get(text.toLowerCase());
    if (bySlug) return { found: bySlug };
    const named = this.byName.get(foldText(text)) ?? [];
    if (named.length === 1) return { found: named[0] };
    if (named.length > 1) return { error: `Plusieurs marques s'appellent « ${text} » : indiquez le slug.` };
    return { missing: true };
  }
}

export async function loadCategoryIndex(executor: Executor): Promise<CategoryIndex> {
  const rows = await executor.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId }).from(categories).where(isNull(categories.deletedAt));
  return new CategoryIndex(rows);
}

export async function loadBrandIndex(executor: Executor): Promise<BrandIndex> {
  const rows = await executor.select({ id: brands.id, name: brands.name, slug: brands.slug }).from(brands).where(isNull(brands.deletedAt));
  return new BrandIndex(rows);
}

/**
 * Catégorie de premier niveau créée à la volée (option de l'import produits). Relue juste avant
 * l'écriture : deux lignes qui demandent la même catégorie n'en créent qu'une.
 */
export async function ensureTopCategory(database: Db, name: string, context: Context): Promise<number> {
  const [existing] = await database.select({ id: categories.id }).from(categories)
    .where(and(isNull(categories.deletedAt), isNull(categories.parentId), sql`public.mbm_unaccent(lower(${categories.name})) = ${foldText(name)}`)).limit(1);
  if (existing) return existing.id;
  return (await createCategory(database, { name: name.trim().slice(0, 100) }, context)).id;
}

export async function ensureBrand(database: Db, name: string, context: Context): Promise<number> {
  const [existing] = await database.select({ id: brands.id }).from(brands)
    .where(and(isNull(brands.deletedAt), sql`public.mbm_unaccent(lower(${brands.name})) = ${foldText(name)}`)).limit(1);
  if (existing) return existing.id;
  return (await createBrand(database, { name: name.trim().slice(0, 120) }, context)).id;
}
