/**
 * Exports CSV (étape 7). Les exports du catalogue reprennent exactement les colonnes de l'import :
 * un fichier exporté, modifié dans un tableur puis réimporté, met les fiches à jour (aller-retour).
 * Les exports de données personnelles (clients, commandes) sont journalisés dans l'audit.
 * Les fichiers sont paginés (5 000 lignes) pour rester sous la limite de réponse des fonctions.
 */
import { and, asc, count, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { ORDER_STATUS_LABELS } from "@/lib/order-rules";
import { brands, categories, customerGroups, customers, orders, products, users } from "@/lib/db/schema";
import { recordAudit } from "@/server/core/audit";
import { toCsv } from "@/server/core/csv";
import type { Db } from "@/server/core/db";
import type { Context } from "@/server/modules/catalog/shared";
import { PRODUCT_COLUMNS } from "@/server/modules/imports/entities/products";
import { BRAND_COLUMNS, CATEGORY_COLUMNS } from "@/server/modules/imports/entities/taxonomy";

export const EXPORT_PAGE_SIZE = 5000;
export type ExportPage = { csv: string; total: number; page: number; totalPages: number };

const STATUS_FR: Record<string, string> = { draft: "brouillon", pending_review: "en_attente", approved: "approuve", published: "publie", rejected: "refuse", archived: "archive" };
const VISIBILITY_FR: Record<string, string> = { everywhere: "partout", catalog: "catalogue", search: "recherche", nowhere: "nulle_part" };
const CONDITION_FR: Record<string, string> = { new: "neuf", used: "occasion", refurbished: "reconditionne" };
const yesNo = (value: boolean | null | undefined) => (value ? "oui" : "non");
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : "");
const rowsOf = <T>(result: unknown) => (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];

function page(total: number, requested: number) {
  const totalPages = Math.max(1, Math.ceil(total / EXPORT_PAGE_SIZE));
  return { page: Math.min(requested, totalPages), totalPages, offset: (Math.min(requested, totalPages) - 1) * EXPORT_PAGE_SIZE };
}

/* ─────────────────────────────  Catalogue  ───────────────────────────── */

export type ProductExportFilter = { status?: string; categoryId?: number; sellerId?: string; withStock?: boolean; page: number };

export async function exportProducts(database: Db, filter: ProductExportFilter): Promise<ExportPage> {
  const conditions: SQL[] = [isNull(products.deletedAt)];
  if (filter.status) conditions.push(eq(products.status, filter.status as typeof products.$inferSelect.status));
  if (filter.categoryId) conditions.push(eq(products.categoryId, filter.categoryId));
  if (filter.sellerId) conditions.push(eq(products.sellerId, filter.sellerId));
  const where = and(...conditions);
  const [{ value }] = await database.select({ value: count() }).from(products).where(where);
  const paging = page(Number(value), filter.page);
  const rows = await database.select({
    product: products, categorySlug: categories.slug, brandSlug: brands.slug, sellerEmail: users.email,
    tags: sql<string | null>`(select string_agg(t.tag, '|' order by t.tag) from product_tags t where t.product_id = ${products.id})`,
    extraCategories: sql<string | null>`(select string_agg(c2.slug, '|' order by c2.slug) from product_categories pc join categories c2 on c2.id = pc.category_id where pc.product_id = ${products.id} and pc.category_id <> ${products.categoryId})`,
  }).from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId)).leftJoin(brands, eq(brands.id, products.brandId)).leftJoin(users, eq(users.id, products.sellerId))
    .where(where).orderBy(asc(products.createdAt), asc(products.id)).limit(EXPORT_PAGE_SIZE).offset(paging.offset);
  const columns = PRODUCT_COLUMNS.map((column) => column.key).filter((key) => filter.withStock || key !== "quantite");
  const valueOf = (row: (typeof rows)[number], key: string): unknown => {
    const p = row.product;
    switch (key) {
      case "reference": return p.reference;
      case "titre": return p.title;
      case "prix": return p.priceXof;
      case "categorie": return row.categorySlug;
      case "categories_supplementaires": return row.extraCategories;
      case "marque": return row.brandSlug;
      case "vendeur": return row.sellerEmail;
      case "quantite": return p.quantity;
      case "statut": return STATUS_FR[p.status] ?? p.status;
      case "visibilite": return VISIBILITY_FR[p.visibility] ?? p.visibility;
      case "etat": return CONDITION_FR[p.condition] ?? p.condition;
      case "resume": return p.shortDescription;
      case "description": return p.description;
      case "ean13": return p.ean13;
      case "sku": return p.sku;
      case "poids_g": return p.weightGrams;
      case "quantite_minimale": return p.minimumQuantity;
      case "delai_jours": return p.leadTimeDays;
      case "prix_achat": return p.purchasePriceXof;
      case "etiquettes": return row.tags;
      case "mis_en_avant": return yesNo(p.isFeatured);
      case "meta_titre": return p.seoTitle;
      case "meta_description": return p.seoDescription;
      case "slug": return p.slug;
      default: return "";
    }
  };
  return { csv: toCsv(columns, rows.map((row) => columns.map((key) => valueOf(row, key)))), total: Number(value), page: paging.page, totalPages: paging.totalPages };
}

/** Catégories, parents avant enfants : le fichier se réimporte tel quel. */
export async function exportCategories(database: Db): Promise<ExportPage> {
  const result = await database.execute(sql`with recursive tree as (
      select c.id, c.parent_id, 0 as depth, lpad(c.sort_order::text, 8, '0') || c.id::text as path from categories c where c.parent_id is null and c.deleted_at is null
      union all
      select c.id, c.parent_id, t.depth + 1, t.path || '/' || lpad(c.sort_order::text, 8, '0') || c.id::text from categories c join tree t on c.parent_id = t.id where c.deleted_at is null
    )
    select c.name, c.slug, p.slug as parent_slug, c.description, c.is_active, c.sort_order, c.meta_title, c.meta_description, c.image_url
    from tree t join categories c on c.id = t.id left join categories p on p.id = c.parent_id order by t.depth, t.path`);
  const rows = rowsOf<{ name: string; slug: string; parent_slug: string | null; description: string | null; is_active: boolean; sort_order: number; meta_title: string | null; meta_description: string | null; image_url: string | null }>(result);
  const columns = CATEGORY_COLUMNS.map((column) => column.key);
  const values = (row: (typeof rows)[number]): Record<string, unknown> => ({
    nom: row.name, slug: row.slug, description: row.description, actif: yesNo(row.is_active), meta_titre: row.meta_title, meta_description: row.meta_description,
    parent: row.parent_slug, position: row.sort_order, image: row.image_url,
  });
  return { csv: toCsv(columns, rows.map((row) => { const entry = values(row); return columns.map((key) => entry[key]); })), total: rows.length, page: 1, totalPages: 1 };
}

export async function exportBrands(database: Db): Promise<ExportPage> {
  const rows = await database.select().from(brands).where(isNull(brands.deletedAt)).orderBy(asc(brands.name));
  const columns = BRAND_COLUMNS.map((column) => column.key);
  const values = (row: (typeof rows)[number]): Record<string, unknown> => ({
    nom: row.name, slug: row.slug, description: row.description, actif: yesNo(row.isActive), meta_titre: row.metaTitle, meta_description: row.metaDescription, logo: row.logoUrl,
  });
  return { csv: toCsv(columns, rows.map((row) => { const entry = values(row); return columns.map((key) => entry[key]); })), total: rows.length, page: 1, totalPages: 1 };
}

/* ─────────────────────────────  Données personnelles  ───────────────────────────── */

const VALID_ORDER_STATUSES = ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"] as const;

export async function exportCustomers(database: Db, filter: { groupId?: number; segment?: string; page: number }, context: Context): Promise<ExportPage> {
  const conditions: SQL[] = [isNull(customers.deletedAt), isNull(customers.anonymizedAt)];
  if (filter.groupId) conditions.push(eq(customers.customerGroupId, filter.groupId));
  if (filter.segment) conditions.push(eq(customers.segment, filter.segment));
  const where = and(...conditions);
  const [{ value }] = await database.select({ value: count() }).from(customers).where(where);
  const paging = page(Number(value), filter.page);
  const rows = await database.select({
    customer: customers, email: users.email, name: users.name, phone: users.phone, group: customerGroups.name,
    ordersCount: sql<number>`(select count(*)::int from orders o where o.buyer_id = ${customers.userId} and o.deleted_at is null and o.status in (${sql.join(VALID_ORDER_STATUSES.map((status) => sql`${status}`), sql`, `)}))`,
    totalXof: sql<number>`(select coalesce(sum(o.total_xof), 0)::bigint from orders o where o.buyer_id = ${customers.userId} and o.deleted_at is null and o.status in (${sql.join(VALID_ORDER_STATUSES.map((status) => sql`${status}`), sql`, `)}))`,
  }).from(customers).innerJoin(users, eq(users.id, customers.userId)).leftJoin(customerGroups, eq(customerGroups.id, customers.customerGroupId))
    .where(where).orderBy(asc(customers.createdAt), asc(customers.id)).limit(EXPORT_PAGE_SIZE).offset(paging.offset);
  await recordAudit(database, { action: "customers.exported", entityType: "customer", entityId: "export", details: { rows: rows.length, page: paging.page, filter }, actor: context.actor, meta: context.meta });
  return {
    csv: toCsv(["identifiant", "email", "nom", "telephone", "societe", "groupe", "segment", "langue", "inscrit_le", "derniere_activite", "newsletter", "offres_commerciales", "commandes_valides", "total_commandes_xof"],
      rows.map((row) => [row.customer.id, row.email, row.name, row.phone, row.customer.companyName, row.group ?? row.customer.customerGroup, row.customer.segment, row.customer.preferredLanguage,
        day(row.customer.createdAt), day(row.customer.lastActivityAt), yesNo(Boolean(row.customer.newsletterConsentAt) && !row.customer.newsletterOptOutAt), yesNo(Boolean(row.customer.marketingConsentAt)),
        Number(row.ordersCount), Number(row.totalXof)])),
    total: Number(value), page: paging.page, totalPages: paging.totalPages,
  };
}

export async function exportOrders(database: Db, filter: { from?: string; to?: string; status?: string; page: number }, context: Context): Promise<ExportPage> {
  const conditions: SQL[] = [isNull(orders.deletedAt)];
  if (filter.from) conditions.push(gte(orders.createdAt, new Date(`${filter.from}T00:00:00.000Z`)));
  if (filter.to) conditions.push(lte(orders.createdAt, new Date(`${filter.to}T23:59:59.999Z`)));
  if (filter.status) conditions.push(eq(orders.status, filter.status as typeof orders.$inferSelect.status));
  const where = and(...conditions);
  const [{ value }] = await database.select({ value: count() }).from(orders).where(where);
  const paging = page(Number(value), filter.page);
  const rows = await database.select({
    order: orders, email: users.email, name: users.name, phone: users.phone,
    items: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = ${orders.id})`,
  }).from(orders).innerJoin(users, eq(users.id, orders.buyerId)).where(where).orderBy(asc(orders.createdAt), asc(orders.id)).limit(EXPORT_PAGE_SIZE).offset(paging.offset);
  await recordAudit(database, { action: "orders.exported", entityType: "order", entityId: "export", details: { rows: rows.length, page: paging.page, filter }, actor: context.actor, meta: context.meta });
  return {
    csv: toCsv(["reference", "date", "statut", "client", "email", "telephone", "articles", "sous_total_xof", "remise_xof", "taxes_xof", "livraison_xof", "total_xof", "mode_livraison", "suivi", "paye_le", "expedie_le", "livre_le"],
      rows.map(({ order, email, name, phone, items }) => [order.reference ?? order.id, order.createdAt.toISOString(), ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status,
        name, email, phone, Number(items), order.subtotalXof, order.discountXof, order.taxXof, order.shippingCostXof, order.totalXof, order.deliveryMethod, order.trackingNumber,
        day(order.paidAt), day(order.shippedAt), day(order.deliveredAt)])),
    total: Number(value), page: paging.page, totalPages: paging.totalPages,
  };
}

