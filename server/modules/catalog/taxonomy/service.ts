/**
 * Taxonomie du catalogue : catégories (arbre illimité), marques, fournisseurs, groupes et
 * valeurs d'attributs, caractéristiques et leurs valeurs.
 *
 * Règles :
 * - une catégorie ne peut pas devenir sa propre descendante (pas de cycle) ;
 * - supprimer une catégorie rattache ses sous-catégories et ses produits à la catégorie parente
 *   (ou à la catégorie de remplacement indiquée) : aucun produit ne reste orphelin ;
 * - les suppressions sont logiques (corbeille), sauf pour les valeurs d'attributs et de
 *   caractéristiques, refusées si elles sont encore utilisées ;
 * - chaque écriture est journalisée (avant/après) dans la même transaction.
 */
import { and, asc, count, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { attributeGroups, attributeValues, brands, categories, featureValues, features, productCategories, productCombinationAttributes, productFeatureValues, products, suppliers } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { definedEntries, uniqueSlug, type Context } from "@/server/modules/catalog/shared";

/* ─────────────────────────────  Catégories  ───────────────────────────── */

export const categoryListSpec: ListSpec = {
  sortable: { sortOrder: categories.sortOrder, name: categories.name, id: categories.id, createdAt: categories.createdAt },
  filterable: { parentId: { column: categories.parentId, type: "number" }, isActive: { column: categories.isActive, type: "boolean" } },
  searchable: [categories.name, categories.slug],
  defaultSort: "sortOrder,name",
  maxLimit: 200,
};

type CategoryRow = typeof categories.$inferSelect;

export type CategoryView = {
  id: number; name: string; slug: string; parentId: number | null; description: string | null; isActive: boolean; sortOrder: number;
  imageUrl: string | null; bannerUrl: string | null; metaTitle: string | null; metaDescription: string | null; createdAt: string; updatedAt: string;
};

export type CategoryNode = CategoryView & { depth: number; path: string[]; productCount: number; children: CategoryNode[] };

export function toCategoryView(row: CategoryRow): CategoryView {
  return {
    id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, description: row.description, isActive: row.isActive, sortOrder: row.sortOrder,
    imageUrl: row.imageUrl, bannerUrl: row.bannerUrl, metaTitle: row.metaTitle, metaDescription: row.metaDescription,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCategories(database: Db, query: ListQuery) {
  const where = buildWhere(query, categoryListSpec, [isNull(categories.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(categories).where(where).orderBy(...buildOrderBy(query, categoryListSpec, categories.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(categories).where(where),
  ]);
  return { data: rows.map(toCategoryView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

/** Arbre complet (catégories non supprimées), avec profondeur, chemin et nombre de produits. */
export async function categoryTree(executor: Executor, options: { activeOnly?: boolean; productCounts?: Map<number, number> } = {}): Promise<CategoryNode[]> {
  const rows = await executor.select().from(categories).where(isNull(categories.deletedAt)).orderBy(asc(categories.sortOrder), asc(categories.name));
  let countById = options.productCounts;
  if (!countById) {
    const counts = await executor.select({ categoryId: products.categoryId, value: count() }).from(products).where(isNull(products.deletedAt)).groupBy(products.categoryId);
    countById = new Map(counts.map((row) => [row.categoryId, Number(row.value)]));
  }
  const nodes = new Map<number, CategoryNode>(rows.map((row) => [row.id, { ...toCategoryView(row), depth: 0, path: [], productCount: countById!.get(row.id) ?? 0, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId != null ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  // Boutique : une catégorie inactive masque toute sa branche (ses enfants ne remontent pas à la racine).
  if (options.activeOnly) {
    const prune = (list: CategoryNode[]): CategoryNode[] => list.filter((node) => node.isActive).map((node) => ({ ...node, children: prune(node.children) }));
    roots.splice(0, roots.length, ...prune(roots));
  }
  const walk = (list: CategoryNode[], depth: number, path: string[]) => {
    for (const node of list) {
      node.depth = depth;
      node.path = [...path, node.slug];
      walk(node.children, depth + 1, node.path);
    }
  };
  walk(roots, 0, []);
  return roots;
}

/** Identifiants de la catégorie et de toutes ses descendantes. */
export async function categoryWithDescendants(executor: Executor, id: number): Promise<number[]> {
  const result = await executor.execute(sql`with recursive tree as (
      select id from categories where id = ${id} and deleted_at is null
      union select c.id from categories c join tree t on c.parent_id = t.id where c.deleted_at is null
    ) select id from tree`);
  const rows = (Array.isArray(result) ? result : (result as { rows: Array<{ id: number }> }).rows) as Array<{ id: number }>;
  return rows.map((row) => Number(row.id));
}

async function findCategory(executor: Executor, id: number, lock = false) {
  const query = executor.select().from(categories).where(and(eq(categories.id, id), isNull(categories.deletedAt))).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

export async function getCategory(database: Db, id: number) {
  const row = await findCategory(database, id);
  if (!row) throw errors.notFound("Catégorie", id);
  const [children, productCount] = await Promise.all([
    database.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories).where(and(eq(categories.parentId, id), isNull(categories.deletedAt))).orderBy(asc(categories.sortOrder)),
    database.select({ value: count() }).from(products).where(and(eq(products.categoryId, id), isNull(products.deletedAt))),
  ]);
  const breadcrumb: Array<{ id: number; name: string; slug: string }> = [];
  let cursor: CategoryRow | null = row;
  for (let guard = 0; cursor && guard < 50; guard += 1) {
    breadcrumb.unshift({ id: cursor.id, name: cursor.name, slug: cursor.slug });
    cursor = cursor.parentId ? await findCategory(database, cursor.parentId) : null;
  }
  return { ...toCategoryView(row), breadcrumb, children, productCount: Number(productCount[0]?.value ?? 0) };
}

async function assertParent(executor: Executor, parentId: number | null | undefined, selfId?: number) {
  if (parentId == null) return;
  if (!(await findCategory(executor, parentId))) throw errors.validation([{ path: "parentId", message: "Catégorie parente introuvable." }]);
  if (selfId !== undefined && (await categoryWithDescendants(executor, selfId)).includes(parentId)) {
    throw errors.rule("Une catégorie ne peut pas être déplacée sous elle-même ou sous l'une de ses sous-catégories.", { parentId });
  }
}

async function nextSortOrder(executor: Executor, parentId: number | null) {
  const [row] = await executor.select({ value: max(categories.sortOrder) }).from(categories).where(and(parentId == null ? isNull(categories.parentId) : eq(categories.parentId, parentId), isNull(categories.deletedAt)));
  return (row?.value ?? -1) + 1;
}

type CategoryInput = { name?: string; slug?: string; parentId?: number | null; description?: string; isActive?: boolean; sortOrder?: number; imageUrl?: string | null; bannerUrl?: string | null; metaTitle?: string | null; metaDescription?: string | null };

export async function createCategory(database: Db, input: CategoryInput & { name: string }, context: Context) {
  return database.transaction(async (tx) => {
    await assertParent(tx, input.parentId);
    const slug = await uniqueSlug(tx, categories, { slug: categories.slug, id: categories.id }, input.slug ?? input.name, { explicit: Boolean(input.slug), maxLength: 110 });
    const [created] = await tx.insert(categories).values({
      name: input.name, slug, parentId: input.parentId ?? null, description: input.description ?? null, isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? (await nextSortOrder(tx, input.parentId ?? null)), imageUrl: input.imageUrl ?? null, bannerUrl: input.bannerUrl ?? null,
      metaTitle: input.metaTitle ?? null, metaDescription: input.metaDescription ?? null,
    }).returning();
    await recordAudit(tx, { action: "category.created", entityType: "category", entityId: created.id, after: toCategoryView(created), actor: context.actor, meta: context.meta });
    return toCategoryView(created);
  });
}

export async function updateCategory(database: Db, id: number, input: CategoryInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findCategory(tx, id, true);
    if (!before) throw errors.notFound("Catégorie", id);
    if (input.parentId !== undefined && input.parentId !== before.parentId) await assertParent(tx, input.parentId, id);
    const slug = input.slug && input.slug !== before.slug ? await uniqueSlug(tx, categories, { slug: categories.slug, id: categories.id }, input.slug, { excludeId: id, explicit: true, maxLength: 110 }) : undefined;
    const [after] = await tx.update(categories).set({ ...definedEntries({ ...input, slug }), updatedAt: new Date() }).where(eq(categories.id, id)).returning();
    await recordAudit(tx, { action: "category.updated", entityType: "category", entityId: id, before: toCategoryView(before), after: toCategoryView(after), actor: context.actor, meta: context.meta });
    return toCategoryView(after);
  });
}

/** Déplace une catégorie (changement de parent et/ou de position parmi ses sœurs). */
export async function moveCategory(database: Db, id: number, input: { parentId: number | null; position?: number }, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findCategory(tx, id, true);
    if (!before) throw errors.notFound("Catégorie", id);
    await assertParent(tx, input.parentId, id);
    const siblings = await tx.select({ id: categories.id }).from(categories)
      .where(and(input.parentId == null ? isNull(categories.parentId) : eq(categories.parentId, input.parentId), ne(categories.id, id), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const order = siblings.map((sibling) => sibling.id);
    order.splice(Math.min(input.position ?? order.length, order.length), 0, id);
    for (const [index, siblingId] of order.entries()) {
      await tx.update(categories).set(siblingId === id ? { parentId: input.parentId, sortOrder: index, updatedAt: new Date() } : { sortOrder: index }).where(eq(categories.id, siblingId));
    }
    const [after] = await tx.select().from(categories).where(eq(categories.id, id));
    await recordAudit(tx, { action: "category.moved", entityType: "category", entityId: id, before: { parentId: before.parentId, sortOrder: before.sortOrder }, after: { parentId: after.parentId, sortOrder: after.sortOrder }, actor: context.actor, meta: context.meta });
    return toCategoryView(after);
  });
}

export async function deleteCategory(database: Db, id: number, options: { moveProductsTo?: number }, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findCategory(tx, id, true);
    if (!before) throw errors.notFound("Catégorie", id);
    const target = options.moveProductsTo ?? before.parentId;
    const [{ value: productCount }] = await tx.select({ value: count() }).from(products).where(eq(products.categoryId, id));
    if (Number(productCount) > 0) {
      if (target == null) throw errors.rule("Cette catégorie racine contient des produits : indiquez une catégorie de remplacement (moveProductsTo).", { productCount: Number(productCount) });
      if (target === id || (await categoryWithDescendants(tx, id)).includes(target)) throw errors.rule("La catégorie de remplacement ne peut pas être la catégorie supprimée ni l'une de ses sous-catégories.");
      if (!(await findCategory(tx, target))) throw errors.validation([{ path: "moveProductsTo", message: "Catégorie de remplacement introuvable." }]);
      await tx.update(products).set({ categoryId: target, updatedAt: new Date() }).where(eq(products.categoryId, id));
    }
    // Les associations secondaires (catégories multiples) sont retirées ; les sous-catégories remontent d'un niveau.
    await tx.delete(productCategories).where(eq(productCategories.categoryId, id));
    await tx.update(categories).set({ parentId: before.parentId, updatedAt: new Date() }).where(and(eq(categories.parentId, id), isNull(categories.deletedAt)));
    await tx.update(categories).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(categories.id, id));
    await recordAudit(tx, { action: "category.deleted", entityType: "category", entityId: id, before: toCategoryView(before), details: { productsMovedTo: Number(productCount) > 0 ? target : null, productCount: Number(productCount) }, actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Marques  ───────────────────────────── */

export const brandListSpec: ListSpec = {
  sortable: { name: brands.name, createdAt: brands.createdAt, id: brands.id },
  filterable: { isActive: { column: brands.isActive, type: "boolean" } },
  searchable: [brands.name, brands.slug],
  defaultSort: "name",
  maxLimit: 200,
};

type BrandRow = typeof brands.$inferSelect;
const brandView = (row: BrandRow) => ({
  id: row.id, name: row.name, slug: row.slug, logoUrl: row.logoUrl, description: row.description, isActive: row.isActive,
  metaTitle: row.metaTitle, metaDescription: row.metaDescription, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listBrands(database: Db, query: ListQuery) {
  const where = buildWhere(query, brandListSpec, [isNull(brands.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(brands).where(where).orderBy(...buildOrderBy(query, brandListSpec, brands.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(brands).where(where),
  ]);
  return { data: rows.map(brandView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

async function findBrand(executor: Executor, id: number) {
  const [row] = await executor.select().from(brands).where(and(eq(brands.id, id), isNull(brands.deletedAt))).limit(1);
  return row ?? null;
}

export async function getBrand(database: Db, id: number) {
  const row = await findBrand(database, id);
  if (!row) throw errors.notFound("Marque", id);
  const [{ value }] = await database.select({ value: count() }).from(products).where(and(eq(products.brandId, id), isNull(products.deletedAt)));
  return { ...brandView(row), productCount: Number(value) };
}

type BrandInput = { name?: string; slug?: string; logoUrl?: string | null; description?: string | null; isActive?: boolean; metaTitle?: string | null; metaDescription?: string | null };

export async function createBrand(database: Db, input: BrandInput & { name: string }, context: Context) {
  return database.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, brands, { slug: brands.slug, id: brands.id }, input.slug ?? input.name, { explicit: Boolean(input.slug), maxLength: 130 });
    const [created] = await tx.insert(brands).values({ ...input, slug, isActive: input.isActive ?? true }).returning();
    await recordAudit(tx, { action: "brand.created", entityType: "brand", entityId: created.id, after: brandView(created), actor: context.actor, meta: context.meta });
    return brandView(created);
  });
}

export async function updateBrand(database: Db, id: number, input: BrandInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findBrand(tx, id);
    if (!before) throw errors.notFound("Marque", id);
    const slug = input.slug && input.slug !== before.slug ? await uniqueSlug(tx, brands, { slug: brands.slug, id: brands.id }, input.slug, { excludeId: id, explicit: true, maxLength: 130 }) : undefined;
    const [after] = await tx.update(brands).set({ ...definedEntries({ ...input, slug }), updatedAt: new Date() }).where(eq(brands.id, id)).returning();
    await recordAudit(tx, { action: "brand.updated", entityType: "brand", entityId: id, before: brandView(before), after: brandView(after), actor: context.actor, meta: context.meta });
    return brandView(after);
  });
}

export async function deleteBrand(database: Db, id: number, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findBrand(tx, id);
    if (!before) throw errors.notFound("Marque", id);
    await tx.update(brands).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(brands.id, id));
    await recordAudit(tx, { action: "brand.deleted", entityType: "brand", entityId: id, before: brandView(before), actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Fournisseurs  ───────────────────────────── */

export const supplierListSpec: ListSpec = {
  sortable: { companyName: suppliers.companyName, createdAt: suppliers.createdAt, countryCode: suppliers.countryCode },
  filterable: { isActive: { column: suppliers.isActive, type: "boolean" }, countryCode: { column: suppliers.countryCode, type: "string" }, profileStatus: { column: suppliers.profileStatus, type: "enum", values: ["unverified", "pending", "verified"] } },
  searchable: [suppliers.companyName, suppliers.slug, suppliers.city],
  defaultSort: "companyName",
  maxLimit: 200,
};

type SupplierRow = typeof suppliers.$inferSelect;
const supplierView = (row: SupplierRow) => ({
  id: row.id, companyName: row.companyName, slug: row.slug, countryCode: row.countryCode, city: row.city, contactEmail: row.contactEmail,
  description: row.description, logoUrl: row.logoUrl, yearsActive: row.yearsActive, mainMarkets: row.mainMarkets, profileStatus: row.profileStatus,
  isActive: row.isActive, ratingAverage: row.ratingAverage == null ? null : Number(row.ratingAverage), reviewCount: row.reviewCount,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listSuppliers(database: Db, query: ListQuery) {
  const where = buildWhere(query, supplierListSpec, [isNull(suppliers.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(suppliers).where(where).orderBy(...buildOrderBy(query, supplierListSpec, suppliers.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(suppliers).where(where),
  ]);
  return { data: rows.map(supplierView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

async function findSupplier(executor: Executor, id: string) {
  const [row] = await executor.select().from(suppliers).where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt))).limit(1);
  return row ?? null;
}

export async function getSupplier(database: Db, id: string) {
  const row = await findSupplier(database, id);
  if (!row) throw errors.notFound("Fournisseur", id);
  const [{ value }] = await database.select({ value: count() }).from(products).where(and(eq(products.supplierId, id), isNull(products.deletedAt)));
  return { ...supplierView(row), productCount: Number(value) };
}

type SupplierInput = { companyName?: string; slug?: string; countryCode?: string; city?: string | null; contactEmail?: string | null; description?: string | null; logoUrl?: string | null; yearsActive?: number | null; mainMarkets?: string[]; profileStatus?: "unverified" | "pending" | "verified"; isActive?: boolean };

export async function createSupplier(database: Db, input: SupplierInput & { companyName: string; countryCode: string }, context: Context) {
  return database.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, suppliers, { slug: suppliers.slug, id: suppliers.id }, input.slug ?? input.companyName, { explicit: Boolean(input.slug), maxLength: 170 });
    const [created] = await tx.insert(suppliers).values({ ...input, slug, mainMarkets: input.mainMarkets ?? [], isActive: input.isActive ?? true }).returning();
    await recordAudit(tx, { action: "supplier.created", entityType: "supplier", entityId: created.id, after: supplierView(created), actor: context.actor, meta: context.meta });
    return supplierView(created);
  });
}

export async function updateSupplier(database: Db, id: string, input: SupplierInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findSupplier(tx, id);
    if (!before) throw errors.notFound("Fournisseur", id);
    const slug = input.slug && input.slug !== before.slug ? await uniqueSlug(tx, suppliers, { slug: suppliers.slug, id: suppliers.id }, input.slug, { excludeId: id, explicit: true, maxLength: 170 }) : undefined;
    const [after] = await tx.update(suppliers).set({ ...definedEntries({ ...input, slug }), updatedAt: new Date() }).where(eq(suppliers.id, id)).returning();
    await recordAudit(tx, { action: "supplier.updated", entityType: "supplier", entityId: id, before: supplierView(before), after: supplierView(after), actor: context.actor, meta: context.meta });
    return supplierView(after);
  });
}

export async function deleteSupplier(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findSupplier(tx, id);
    if (!before) throw errors.notFound("Fournisseur", id);
    await tx.update(suppliers).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(suppliers.id, id));
    await recordAudit(tx, { action: "supplier.deleted", entityType: "supplier", entityId: id, before: supplierView(before), actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Attributs  ───────────────────────────── */

type ValueRow = typeof attributeValues.$inferSelect;
const valueView = (row: ValueRow) => ({ id: row.id, code: row.code, name: row.name, colorHex: row.colorHex, textureUrl: row.textureUrl, position: row.position, isActive: row.isActive });
type GroupRow = typeof attributeGroups.$inferSelect;
const groupView = (row: GroupRow, values: ValueRow[]) => ({
  id: row.id, code: row.code, name: row.name, displayType: row.displayType, position: row.position, isActive: row.isActive,
  values: values.filter((value) => value.groupId === row.id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map(valueView),
});

export async function listAttributeGroups(executor: Executor, options: { activeOnly?: boolean } = {}) {
  const groups = await executor.select().from(attributeGroups).where(options.activeOnly ? eq(attributeGroups.isActive, true) : undefined).orderBy(asc(attributeGroups.position), asc(attributeGroups.name));
  const values = groups.length ? await executor.select().from(attributeValues).where(and(inArray(attributeValues.groupId, groups.map((group) => group.id)), options.activeOnly ? eq(attributeValues.isActive, true) : undefined)) : [];
  return groups.map((group) => groupView(group, values));
}

async function getGroup(executor: Executor, id: string) {
  const [group] = await executor.select().from(attributeGroups).where(eq(attributeGroups.id, id)).limit(1);
  if (!group) throw errors.notFound("Groupe d'attributs", id);
  const values = await executor.select().from(attributeValues).where(eq(attributeValues.groupId, id));
  return groupView(group, values);
}

export async function getAttributeGroup(database: Db, id: string) {
  return getGroup(database, id);
}

type GroupInput = { code: string; name: string; displayType?: "color" | "texture" | "select" | "radio"; position?: number; isActive?: boolean; values?: Array<{ code: string; name: string; colorHex?: string | null; textureUrl?: string | null; position?: number }> };

export async function createAttributeGroup(database: Db, input: GroupInput, context: Context) {
  return database.transaction(async (tx) => {
    const [group] = await tx.insert(attributeGroups).values({ code: input.code, name: input.name, displayType: input.displayType ?? "select", position: input.position ?? 0, isActive: input.isActive ?? true }).returning();
    if (input.values?.length) {
      await tx.insert(attributeValues).values(input.values.map((value, index) => ({ groupId: group.id, code: value.code, name: value.name, colorHex: value.colorHex ?? null, textureUrl: value.textureUrl ?? null, position: value.position ?? index })));
    }
    const view = await getGroup(tx, group.id);
    await recordAudit(tx, { action: "attribute_group.created", entityType: "attribute_group", entityId: group.id, after: view, actor: context.actor, meta: context.meta });
    return view;
  });
}

export async function updateAttributeGroup(database: Db, id: string, input: Partial<Omit<GroupInput, "code" | "values">>, context: Context) {
  return database.transaction(async (tx) => {
    const before = await getGroup(tx, id);
    await tx.update(attributeGroups).set({ ...definedEntries(input), updatedAt: new Date() }).where(eq(attributeGroups.id, id));
    const after = await getGroup(tx, id);
    await recordAudit(tx, { action: "attribute_group.updated", entityType: "attribute_group", entityId: id, before: { ...before, values: undefined }, after: { ...after, values: undefined }, actor: context.actor, meta: context.meta });
    return after;
  });
}

async function assertValuesUnused(executor: Executor, valueIds: string[], label: string) {
  if (!valueIds.length) return;
  const [{ value }] = await executor.select({ value: count() }).from(productCombinationAttributes).where(inArray(productCombinationAttributes.attributeValueId, valueIds));
  if (Number(value) > 0) throw errors.rule(`${label} est utilisé par ${value} déclinaison(s) : désactivez-le plutôt que de le supprimer.`, { combinations: Number(value) });
}

export async function deleteAttributeGroup(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await getGroup(tx, id);
    await assertValuesUnused(tx, before.values.map((value) => value.id), "Ce groupe d'attributs");
    await tx.delete(attributeGroups).where(eq(attributeGroups.id, id));
    await recordAudit(tx, { action: "attribute_group.deleted", entityType: "attribute_group", entityId: id, before, actor: context.actor, meta: context.meta });
  });
}

type ValueInput = { code?: string; name?: string; colorHex?: string | null; textureUrl?: string | null; position?: number; isActive?: boolean };

export async function addAttributeValue(database: Db, groupId: string, input: ValueInput & { code: string; name: string }, context: Context) {
  return database.transaction(async (tx) => {
    await getGroup(tx, groupId);
    const [{ value: nextPosition }] = await tx.select({ value: max(attributeValues.position) }).from(attributeValues).where(eq(attributeValues.groupId, groupId));
    const [created] = await tx.insert(attributeValues).values({ groupId, code: input.code, name: input.name, colorHex: input.colorHex ?? null, textureUrl: input.textureUrl ?? null, position: input.position ?? (nextPosition ?? -1) + 1, isActive: input.isActive ?? true }).returning();
    await recordAudit(tx, { action: "attribute_value.created", entityType: "attribute_value", entityId: created.id, after: valueView(created), details: { groupId }, actor: context.actor, meta: context.meta });
    return valueView(created);
  });
}

export async function updateAttributeValue(database: Db, groupId: string, valueId: string, input: ValueInput, context: Context) {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(attributeValues).where(and(eq(attributeValues.id, valueId), eq(attributeValues.groupId, groupId))).limit(1);
    if (!before) throw errors.notFound("Valeur d'attribut", valueId);
    const [after] = await tx.update(attributeValues).set(definedEntries(input)).where(eq(attributeValues.id, valueId)).returning();
    await recordAudit(tx, { action: "attribute_value.updated", entityType: "attribute_value", entityId: valueId, before: valueView(before), after: valueView(after), actor: context.actor, meta: context.meta });
    return valueView(after);
  });
}

export async function deleteAttributeValue(database: Db, groupId: string, valueId: string, context: Context) {
  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(attributeValues).where(and(eq(attributeValues.id, valueId), eq(attributeValues.groupId, groupId))).limit(1);
    if (!before) throw errors.notFound("Valeur d'attribut", valueId);
    await assertValuesUnused(tx, [valueId], "Cette valeur");
    await tx.delete(attributeValues).where(eq(attributeValues.id, valueId));
    await recordAudit(tx, { action: "attribute_value.deleted", entityType: "attribute_value", entityId: valueId, before: valueView(before), actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Caractéristiques  ───────────────────────────── */

type FeatureRow = typeof features.$inferSelect;
type FeatureValueRow = typeof featureValues.$inferSelect;
const featureView = (row: FeatureRow, values: FeatureValueRow[]) => ({
  id: row.id, code: row.code, name: row.name, position: row.position, isActive: row.isActive,
  values: values.filter((value) => value.featureId === row.id).sort((a, b) => a.position - b.position).map((value) => ({ id: value.id, value: value.value, position: value.position })),
});

export async function listFeatures(executor: Executor, options: { activeOnly?: boolean } = {}) {
  const rows = await executor.select().from(features).where(options.activeOnly ? eq(features.isActive, true) : undefined).orderBy(asc(features.position), asc(features.name));
  const values = rows.length ? await executor.select().from(featureValues).where(inArray(featureValues.featureId, rows.map((row) => row.id))) : [];
  return rows.map((row) => featureView(row, values));
}

async function getFeatureView(executor: Executor, id: string) {
  const [row] = await executor.select().from(features).where(eq(features.id, id)).limit(1);
  if (!row) throw errors.notFound("Caractéristique", id);
  return featureView(row, await executor.select().from(featureValues).where(eq(featureValues.featureId, id)));
}

export async function getFeature(database: Db, id: string) {
  return getFeatureView(database, id);
}

export async function createFeature(database: Db, input: { code: string; name: string; position?: number; isActive?: boolean; values?: string[] }, context: Context) {
  return database.transaction(async (tx) => {
    const [row] = await tx.insert(features).values({ code: input.code, name: input.name, position: input.position ?? 0, isActive: input.isActive ?? true }).returning();
    const unique = [...new Set(input.values ?? [])];
    if (unique.length) await tx.insert(featureValues).values(unique.map((value, position) => ({ featureId: row.id, value, position })));
    const view = await getFeatureView(tx, row.id);
    await recordAudit(tx, { action: "feature.created", entityType: "feature", entityId: row.id, after: view, actor: context.actor, meta: context.meta });
    return view;
  });
}

export async function updateFeature(database: Db, id: string, input: { name?: string; position?: number; isActive?: boolean }, context: Context) {
  return database.transaction(async (tx) => {
    const before = await getFeatureView(tx, id);
    await tx.update(features).set(definedEntries(input)).where(eq(features.id, id));
    const after = await getFeatureView(tx, id);
    await recordAudit(tx, { action: "feature.updated", entityType: "feature", entityId: id, before: { ...before, values: undefined }, after: { ...after, values: undefined }, actor: context.actor, meta: context.meta });
    return after;
  });
}

export async function deleteFeature(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await getFeatureView(tx, id);
    const [{ value }] = await tx.select({ value: count() }).from(productFeatureValues).where(eq(productFeatureValues.featureId, id));
    if (Number(value) > 0) throw errors.rule(`Cette caractéristique est renseignée sur ${value} produit(s) : désactivez-la plutôt que de la supprimer.`, { products: Number(value) });
    await tx.delete(features).where(eq(features.id, id));
    await recordAudit(tx, { action: "feature.deleted", entityType: "feature", entityId: id, before, actor: context.actor, meta: context.meta });
  });
}

export async function addFeatureValue(database: Db, featureId: string, input: { value: string; position?: number }, context: Context) {
  return database.transaction(async (tx) => {
    await getFeatureView(tx, featureId);
    const [{ value: last }] = await tx.select({ value: max(featureValues.position) }).from(featureValues).where(eq(featureValues.featureId, featureId));
    const [created] = await tx.insert(featureValues).values({ featureId, value: input.value, position: input.position ?? (last ?? -1) + 1 }).returning();
    await recordAudit(tx, { action: "feature_value.created", entityType: "feature_value", entityId: created.id, after: { featureId, value: created.value }, actor: context.actor, meta: context.meta });
    return { id: created.id, value: created.value, position: created.position };
  });
}

export async function updateFeatureValue(database: Db, featureId: string, valueId: string, input: { value: string; position?: number }, context: Context) {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(featureValues).where(and(eq(featureValues.id, valueId), eq(featureValues.featureId, featureId))).limit(1);
    if (!before) throw errors.notFound("Valeur de caractéristique", valueId);
    const [after] = await tx.update(featureValues).set(definedEntries(input)).where(eq(featureValues.id, valueId)).returning();
    await recordAudit(tx, { action: "feature_value.updated", entityType: "feature_value", entityId: valueId, before: { value: before.value, position: before.position }, after: { value: after.value, position: after.position }, actor: context.actor, meta: context.meta });
    return { id: after.id, value: after.value, position: after.position };
  });
}

export async function deleteFeatureValue(database: Db, featureId: string, valueId: string, context: Context) {
  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(featureValues).where(and(eq(featureValues.id, valueId), eq(featureValues.featureId, featureId))).limit(1);
    if (!before) throw errors.notFound("Valeur de caractéristique", valueId);
    const [{ value }] = await tx.select({ value: count() }).from(productFeatureValues).where(eq(productFeatureValues.featureValueId, valueId));
    if (Number(value) > 0) throw errors.rule(`Cette valeur est utilisée par ${value} produit(s).`, { products: Number(value) });
    await tx.delete(featureValues).where(eq(featureValues.id, valueId));
    await recordAudit(tx, { action: "feature_value.deleted", entityType: "feature_value", entityId: valueId, before: { featureId, value: before.value }, actor: context.actor, meta: context.meta });
  });
}
