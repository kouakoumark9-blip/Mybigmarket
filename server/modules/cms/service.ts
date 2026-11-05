/**
 * CMS et SEO (étape 6) : pages à blocs, menus, formulaires, bannières et redirections.
 *
 *   - Une page publiée est servie sur /pages/{slug} ; renommer une page publiée crée une redirection 301.
 *   - Les menus pointent vers des pages, catégories, produits, marques ou URL ; un lien vers un contenu
 *     non publié n'est pas servi.
 *   - Les formulaires valident chaque champ déclaré, piègent les robots (champ caché) et préviennent
 *     l'équipe par la file d'e-mails (événement form.submitted).
 *   - Les redirections ne forment jamais de boucle et sont aplaties (pas de chaîne A → B → C).
 */
import { createHash } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { banners, brands, categories, cmsPages, formSubmissions, forms, menuItems, menus, products, slugRedirects, DEFAULT_SHOP_ID } from "@/lib/db/schema";
import { blocksPlainText, blocksSchema, type Block } from "@/lib/cms/blocks";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { buildOrderBy, buildWhere, likePattern, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import type { Context } from "@/server/modules/catalog/shared";
import type { PricingContext } from "@/server/modules/pricing/service";
import { publicProductCondition, searchProducts } from "@/server/modules/storefront/service";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ─────────────────────────────  Pages  ───────────────────────────── */

type PageRow = typeof cmsPages.$inferSelect;
const pageView = (row: PageRow) => ({
  id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, status: row.status, blocks: row.blocks as Block[], metaTitle: row.metaTitle, metaDescription: row.metaDescription,
  publishedAt: row.publishedAt?.toISOString() ?? null, url: `/pages/${row.slug}`, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export const pageListSpec: ListSpec = {
  sortable: { updatedAt: cmsPages.updatedAt, title: cmsPages.title, publishedAt: cmsPages.publishedAt },
  filterable: { status: { column: cmsPages.status, type: "enum", values: ["draft", "published"] }, updatedAt: { column: cmsPages.updatedAt, type: "date" } },
  defaultSort: "-updatedAt",
  maxLimit: 200,
};

export async function listPages(database: Db, query: ListQuery) {
  const search = query.q ? or(ilike(cmsPages.title, likePattern(query.q)), ilike(cmsPages.slug, likePattern(query.q))) : undefined;
  const where = buildWhere({ ...query, q: undefined }, pageListSpec, [isNull(cmsPages.deletedAt), search]);
  const [rows, [total]] = await Promise.all([
    database.select().from(cmsPages).where(where).orderBy(...buildOrderBy(query, pageListSpec, cmsPages.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(cmsPages).where(where),
  ]);
  return { data: rows.map(({ blocks: _blocks, ...row }) => { void _blocks; return { ...pageView({ ...row, blocks: [] } as PageRow), blocks: undefined }; }), meta: listMeta(query, Number(total?.value ?? 0)) };
}

async function findPage(executor: Executor, id: string) {
  const [row] = await executor.select().from(cmsPages).where(and(eq(cmsPages.id, id), isNull(cmsPages.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Page", id);
  return row;
}

export const getPage = async (database: Db, id: string) => pageView(await findPage(database, id));

export type PageInput = { slug?: string; title?: string; excerpt?: string; blocks?: Block[]; metaTitle?: string | null; metaDescription?: string | null; status?: "draft" | "published" };

async function assertSlugFree(executor: Executor, slug: string, exceptId?: string) {
  const [taken] = await executor.select({ id: cmsPages.id }).from(cmsPages).where(eq(cmsPages.slug, slug)).limit(1);
  if (taken && taken.id !== exceptId) throw errors.conflict("Cette adresse de page existe déjà.", { slug });
}

export async function createPage(database: Db, input: PageInput & { slug: string; title: string }, context: Context) {
  return database.transaction(async (tx) => {
    await assertSlugFree(tx, input.slug);
    const blocks = input.blocks ?? [];
    const now = new Date();
    const [row] = await tx.insert(cmsPages).values({
      slug: input.slug, title: input.title, blocks, excerpt: input.excerpt ?? blocksPlainText(blocks).slice(0, 300), metaTitle: input.metaTitle ?? null, metaDescription: input.metaDescription ?? null,
      status: input.status ?? "draft", publishedAt: input.status === "published" ? now : null, updatedByEmployeeId: context.actor.employeeId,
    }).returning();
    await recordAudit(tx, { action: "cms_page.created", entityType: "cms_page", entityId: row.id, after: { slug: row.slug, status: row.status }, actor: context.actor, meta: context.meta });
    if (row.status === "published") await emitEvent(tx, "cms.page_published", { pageId: row.id, slug: row.slug }, { aggregateId: row.id, shopId: DEFAULT_SHOP_ID });
    return pageView(row);
  });
}

export async function updatePage(database: Db, id: string, input: PageInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findPage(tx, id);
    if (input.slug && input.slug !== before.slug) await assertSlugFree(tx, input.slug, id);
    const now = new Date();
    const publishing = input.status === "published" && before.status !== "published";
    const [row] = await tx.update(cmsPages).set({
      ...(input.slug ? { slug: input.slug } : {}), ...(input.title ? { title: input.title } : {}), ...(input.blocks ? { blocks: input.blocks } : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : input.blocks ? { excerpt: before.excerpt || blocksPlainText(input.blocks).slice(0, 300) } : {}),
      ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle } : {}), ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription } : {}),
      ...(input.status ? { status: input.status } : {}), ...(publishing ? { publishedAt: now } : {}), updatedAt: now, updatedByEmployeeId: context.actor.employeeId,
    }).where(eq(cmsPages.id, id)).returning();
    // Page publiée renommée : l'ancienne adresse redirige (301) vers la nouvelle.
    if (input.slug && input.slug !== before.slug && before.status === "published") {
      await saveRedirectInTx(tx, null, { oldPath: `/pages/${before.slug}`, newPath: `/pages/${input.slug}`, statusCode: 301, note: "Page renommée" });
    }
    await recordAudit(tx, { action: "cms_page.updated", entityType: "cms_page", entityId: id, before: { slug: before.slug, status: before.status }, after: { slug: row.slug, status: row.status }, actor: context.actor, meta: context.meta });
    if (publishing) await emitEvent(tx, "cms.page_published", { pageId: id, slug: row.slug }, { aggregateId: id, shopId: DEFAULT_SHOP_ID });
    return pageView(row);
  });
}

export async function deletePage(database: Db, id: string, input: { redirectTo?: string | null }, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findPage(tx, id);
    await tx.update(cmsPages).set({ deletedAt: new Date(), status: "draft", updatedAt: new Date() }).where(eq(cmsPages.id, id));
    if (input.redirectTo && before.status === "published") await saveRedirectInTx(tx, null, { oldPath: `/pages/${before.slug}`, newPath: input.redirectTo, statusCode: 301, note: "Page supprimée" });
    await recordAudit(tx, { action: "cms_page.deleted", entityType: "cms_page", entityId: id, before: { slug: before.slug }, details: { redirectTo: input.redirectTo ?? null }, actor: context.actor, meta: context.meta });
  });
}

const publishedCondition = (): SQL => and(eq(cmsPages.status, "published"), isNull(cmsPages.deletedAt), or(isNull(cmsPages.publishedAt), lte(cmsPages.publishedAt, new Date())))!;

export async function publishedPages(executor: Executor) {
  return executor.select({ slug: cmsPages.slug, title: cmsPages.title, excerpt: cmsPages.excerpt, updatedAt: cmsPages.updatedAt }).from(cmsPages).where(publishedCondition()).orderBy(asc(cmsPages.title));
}

/** Page publiée avec ses blocs résolus (produits, bannières, formulaire). */
export async function publicPage(database: Db, slug: string, pricing: PricingContext) {
  const [row] = await database.select().from(cmsPages).where(and(eq(cmsPages.slug, slug), publishedCondition())).limit(1);
  if (!row) return null;
  const parsed = blocksSchema.safeParse(row.blocks);
  const blocks = parsed.success ? parsed.data : [];
  const resolved = [];
  for (const block of blocks) {
    if (block.type === "products") {
      const result = await searchProducts(database, { page: 1, limit: block.limit, sort: "relevance", ...(block.categorySlug ? { category: block.categorySlug } : { ids: block.productIds }) }, pricing).catch(() => ({ data: [] }));
      resolved.push({ ...block, items: result.data });
    } else if (block.type === "banners") {
      resolved.push({ ...block, items: await publicBanners(database, block.placement) });
    } else if (block.type === "form") {
      resolved.push({ ...block, form: await publicForm(database, block.code).catch(() => null) });
    } else resolved.push(block);
  }
  return { ...pageView(row), blocks: resolved };
}

/* ─────────────────────────────  Menus  ───────────────────────────── */

export const LINK_TYPES = ["url", "page", "category", "product", "brand"] as const;
export type MenuItemInput = { label: string; linkType: (typeof LINK_TYPES)[number]; target: string; opensNewTab?: boolean; isActive?: boolean; children?: MenuItemInput[] };

type ItemRow = typeof menuItems.$inferSelect;

async function hrefResolver(executor: Executor, items: ItemRow[], publicOnly: boolean) {
  const targets = (type: string) => [...new Set(items.filter((item) => item.linkType === type).map((item) => item.target))];
  const [pages, cats, prods, brandRows] = await Promise.all([
    targets("page").length ? executor.select({ slug: cmsPages.slug }).from(cmsPages).where(and(inArray(cmsPages.slug, targets("page")), publicOnly ? publishedCondition() : isNull(cmsPages.deletedAt))) : [],
    targets("category").length ? executor.select({ slug: categories.slug }).from(categories).where(and(inArray(categories.slug, targets("category")), publicOnly ? eq(categories.isActive, true) : undefined, isNull(categories.deletedAt))) : [],
    targets("product").length ? executor.select({ slug: products.slug }).from(products).where(and(inArray(products.slug, targets("product")), publicOnly ? publicProductCondition() : undefined)) : [],
    targets("brand").length ? executor.select({ slug: brands.slug }).from(brands).where(and(inArray(brands.slug, targets("brand")), publicOnly ? eq(brands.isActive, true) : undefined, isNull(brands.deletedAt))) : [],
  ]);
  const known = { page: new Set(pages.map((row) => row.slug)), category: new Set(cats.map((row) => row.slug)), product: new Set(prods.map((row) => row.slug)), brand: new Set(brandRows.map((row) => row.slug)) };
  return (item: ItemRow): string | null => {
    switch (item.linkType) {
      case "url": return item.target;
      case "page": return known.page.has(item.target) ? `/pages/${item.target}` : null;
      case "category": return known.category.has(item.target) ? `/produits?categorie=${encodeURIComponent(item.target)}` : null;
      case "product": return known.product.has(item.target) ? `/produits/${item.target}` : null;
      case "brand": return known.brand.has(item.target) ? `/produits?marque=${encodeURIComponent(item.target)}` : null;
      default: return null;
    }
  };
}

async function menuTree(executor: Executor, menu: typeof menus.$inferSelect, publicOnly: boolean) {
  const rows = await executor.select().from(menuItems).where(and(eq(menuItems.menuId, menu.id), publicOnly ? eq(menuItems.isActive, true) : undefined)).orderBy(asc(menuItems.position), asc(menuItems.id));
  const resolve = await hrefResolver(executor, rows, publicOnly);
  const node = (item: ItemRow) => ({ id: item.id, label: item.label, linkType: item.linkType, target: item.target, href: resolve(item), opensNewTab: item.opensNewTab, isActive: item.isActive });
  const tree = rows.filter((item) => item.parentId === null).map((item) => ({ ...node(item), children: rows.filter((child) => child.parentId === item.id).map(node).filter((child) => !publicOnly || child.href) }));
  return { code: menu.code, name: menu.name, isActive: menu.isActive, items: publicOnly ? tree.filter((item) => item.href || item.children.length) : tree };
}

export async function listMenus(database: Db) {
  const rows = await database.select().from(menus).orderBy(asc(menus.code));
  return Promise.all(rows.map((menu) => menuTree(database, menu, false)));
}

export async function publicMenu(database: Db, code: string) {
  const [menu] = await database.select().from(menus).where(and(eq(menus.code, code), eq(menus.isActive, true))).limit(1);
  if (!menu) throw errors.notFound("Menu", code);
  return menuTree(database, menu, true);
}

/** Crée ou remplace un menu et ses entrées (deux niveaux au plus), en une transaction. */
export async function saveMenu(database: Db, code: string, input: { name: string; isActive?: boolean; items: MenuItemInput[] }, context: Context) {
  const total = input.items.reduce((sum, item) => sum + 1 + (item.children?.length ?? 0), 0);
  if (total > 120) throw errors.validation([{ path: "items", message: "120 entrées au maximum." }]);
  if (input.items.some((item) => item.children?.some((child) => child.children?.length))) throw errors.validation([{ path: "items", message: "Deux niveaux au maximum." }]);
  return database.transaction(async (tx) => {
    const [menu] = await tx.insert(menus).values({ code, name: input.name, isActive: input.isActive ?? true }).onConflictDoUpdate({ target: menus.code, set: { name: input.name, isActive: input.isActive ?? true, updatedAt: new Date() } }).returning();
    await tx.delete(menuItems).where(eq(menuItems.menuId, menu.id));
    for (const [position, item] of input.items.entries()) {
      const [parent] = await tx.insert(menuItems).values({ menuId: menu.id, label: item.label, linkType: item.linkType, target: item.target, position, isActive: item.isActive ?? true, opensNewTab: item.opensNewTab ?? false }).returning({ id: menuItems.id });
      for (const [childPosition, child] of (item.children ?? []).entries()) {
        await tx.insert(menuItems).values({ menuId: menu.id, parentId: parent.id, label: child.label, linkType: child.linkType, target: child.target, position: childPosition, isActive: child.isActive ?? true, opensNewTab: child.opensNewTab ?? false });
      }
    }
    await recordAudit(tx, { action: "menu.saved", entityType: "menu", entityId: code, after: { items: total }, actor: context.actor, meta: context.meta });
    return menuTree(tx, menu, false);
  });
}

/* ─────────────────────────────  Formulaires  ───────────────────────────── */

export const fieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/), label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "email", "tel", "textarea", "select", "checkbox", "number"]), required: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(10_000).optional(), options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
}).strict().refine((field) => field.type !== "select" || Boolean(field.options?.length), "Une liste déroulante a besoin d'options.");
export type FormField = z.infer<typeof fieldSchema>;

const formView = (row: typeof forms.$inferSelect) => ({ id: row.id, code: row.code, title: row.title, description: row.description, fields: row.fields as FormField[], notifyEmail: row.notifyEmail, successMessage: row.successMessage, isActive: row.isActive, updatedAt: row.updatedAt.toISOString() });

export async function listForms(database: Db) {
  const rows = await database.select().from(forms).where(isNull(forms.deletedAt)).orderBy(asc(forms.code));
  const counts = await database.select({ formId: formSubmissions.formId, total: count(), unread: sql<number>`count(*) filter (where ${formSubmissions.status} = 'new')::int` }).from(formSubmissions).groupBy(formSubmissions.formId);
  return rows.map((row) => ({ ...formView(row), submissions: Number(counts.find((entry) => entry.formId === row.id)?.total ?? 0), unread: Number(counts.find((entry) => entry.formId === row.id)?.unread ?? 0) }));
}

async function findForm(executor: Executor, codeOrId: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(codeOrId);
  const [row] = await executor.select().from(forms).where(and(isUuid ? eq(forms.id, codeOrId) : eq(forms.code, codeOrId), isNull(forms.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Formulaire", codeOrId);
  return row;
}

export const getForm = async (database: Db, codeOrId: string) => formView(await findForm(database, codeOrId));

export async function saveForm(database: Db, code: string, input: { title: string; description?: string; fields: FormField[]; notifyEmail?: string | null; successMessage?: string; isActive?: boolean }, context: Context) {
  const names = input.fields.map((field) => field.name);
  if (new Set(names).size !== names.length) throw errors.validation([{ path: "fields", message: "Deux champs portent le même nom." }]);
  if (names.includes("website")) throw errors.validation([{ path: "fields", message: "« website » est réservé (piège anti-robots)." }]);
  const values = { title: input.title, description: input.description ?? "", fields: input.fields, notifyEmail: input.notifyEmail ?? null, successMessage: input.successMessage ?? "Merci, votre message a bien été envoyé.", isActive: input.isActive ?? true, updatedAt: new Date(), deletedAt: null };
  const [row] = await database.insert(forms).values({ code, ...values }).onConflictDoUpdate({ target: forms.code, set: values }).returning();
  await recordAudit(database, { action: "form.saved", entityType: "form", entityId: code, after: { fields: names }, actor: context.actor, meta: context.meta });
  return formView(row);
}

export async function deleteForm(database: Db, code: string, context: Context) {
  const form = await findForm(database, code);
  await database.update(forms).set({ deletedAt: new Date(), isActive: false }).where(eq(forms.id, form.id));
  await recordAudit(database, { action: "form.deleted", entityType: "form", entityId: code, actor: context.actor, meta: context.meta });
}

export async function publicForm(database: Db, code: string) {
  const form = await findForm(database, code);
  if (!form.isActive) throw errors.notFound("Formulaire", code);
  return { code: form.code, title: form.title, description: form.description, fields: form.fields as FormField[], honeypot: "website" };
}

function fieldValue(field: FormField, raw: unknown): { value?: string | boolean | number; error?: string } {
  const empty = raw === undefined || raw === null || raw === "" || raw === false;
  if (empty) return field.required ? { error: "Champ obligatoire." } : {};
  if (field.type === "checkbox") return raw === true || raw === "on" || raw === "true" ? { value: true } : { error: "Valeur invalide." };
  if (field.type === "number") { const number = Number(raw); return Number.isFinite(number) ? { value: number } : { error: "Nombre attendu." }; }
  if (typeof raw !== "string") return { error: "Texte attendu." };
  const text = raw.trim();
  const max = field.maxLength ?? (field.type === "textarea" ? 4000 : 300);
  if (text.length > max) return { error: `${max} caractères au maximum.` };
  if (field.type === "email" && !z.string().email().safeParse(text).success) return { error: "Adresse e-mail invalide." };
  if (field.type === "tel" && !/^\+?[\d\s().-]{6,32}$/.test(text)) return { error: "Numéro de téléphone invalide." };
  if (field.type === "select" && !field.options?.includes(text)) return { error: "Choix invalide." };
  return { value: text };
}

/**
 * Réponse à un formulaire. Le champ caché « website » piège les robots : rempli, la réponse est
 * ignorée en silence (le robot reçoit le même message de succès).
 */
export async function submitForm(database: Db, code: string, data: Record<string, unknown>, origin: { userId?: string | null; ip?: string | null }) {
  const form = await findForm(database, code);
  if (!form.isActive) throw errors.notFound("Formulaire", code);
  const fields = form.fields as FormField[];
  if (typeof data.website === "string" && data.website.trim()) return { message: form.successMessage };
  const issues: Array<{ path: string; message: string }> = [];
  const clean: Record<string, unknown> = {};
  for (const field of fields) {
    const result = fieldValue(field, data[field.name]);
    if (result.error) issues.push({ path: field.name, message: result.error });
    else if (result.value !== undefined) clean[field.name] = result.value;
  }
  const unknown = Object.keys(data).filter((key) => key !== "website" && !fields.some((field) => field.name === key));
  if (unknown.length) issues.push({ path: unknown[0], message: "Champ inconnu." });
  if (issues.length) throw errors.validation(issues);
  const emailField = fields.find((field) => field.type === "email");
  const salt = process.env.ADMIN_API_JWT_SECRET || "mbm-formulaires";
  await database.transaction(async (tx) => {
    const [submission] = await tx.insert(formSubmissions).values({
      formId: form.id, data: clean, email: emailField ? String(clean[emailField.name] ?? "") || null : null, userId: origin.userId ?? null,
      ipHash: origin.ip ? createHash("sha256").update(`${salt}:${origin.ip}`).digest("hex") : null,
    }).returning({ id: formSubmissions.id });
    await emitEvent(tx, "form.submitted", { formId: form.id, submissionId: submission.id, code: form.code }, { aggregateId: submission.id, shopId: DEFAULT_SHOP_ID });
  });
  return { message: form.successMessage };
}

export const submissionListSpec: ListSpec = {
  sortable: { createdAt: formSubmissions.createdAt },
  filterable: { status: { column: formSubmissions.status, type: "enum", values: ["new", "read", "archived"] }, createdAt: { column: formSubmissions.createdAt, type: "date" } },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

export async function listSubmissions(database: Db, code: string, query: ListQuery) {
  const form = await findForm(database, code);
  const where = buildWhere(query, submissionListSpec, [eq(formSubmissions.formId, form.id)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(formSubmissions).where(where).orderBy(...buildOrderBy(query, submissionListSpec, formSubmissions.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(formSubmissions).where(where),
  ]);
  return { data: rows.map((row) => ({ id: row.id, data: row.data, email: row.email, status: row.status, createdAt: row.createdAt.toISOString() })), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function setSubmissionStatus(database: Db, id: string, status: "new" | "read" | "archived", context: Context) {
  const [row] = await database.update(formSubmissions).set({ status }).where(eq(formSubmissions.id, id)).returning({ id: formSubmissions.id });
  if (!row) throw errors.notFound("Réponse", id);
  await recordAudit(database, { action: "form_submission.status_changed", entityType: "form_submission", entityId: id, after: { status }, actor: context.actor, meta: context.meta });
  return { id, status };
}

/* ─────────────────────────────  Bannières  ───────────────────────────── */

type BannerRow = typeof banners.$inferSelect;
const bannerView = (row: BannerRow) => ({ id: row.id, name: row.name, imageUrl: row.imageUrl, alt: row.alt, targetUrl: row.targetUrl, placement: row.placement, startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null, sortOrder: row.sortOrder, isActive: row.isActive });
export type BannerInput = { name?: string; imageUrl?: string; alt?: string; targetUrl?: string | null; placement?: string; startsAt?: string | null; endsAt?: string | null; sortOrder?: number; isActive?: boolean };

const bannerValues = (input: BannerInput) => Object.fromEntries(Object.entries({
  ...input, startsAt: input.startsAt === undefined ? undefined : input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt === undefined ? undefined : input.endsAt ? new Date(input.endsAt) : null,
}).filter(([, value]) => value !== undefined));

export async function listBanners(database: Db, placement?: string) {
  return (await database.select().from(banners).where(placement ? eq(banners.placement, placement) : undefined).orderBy(asc(banners.placement), asc(banners.sortOrder))).map(bannerView);
}

export async function saveBanner(database: Db, id: string | null, input: BannerInput, context: Context) {
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) throw errors.validation([{ path: "endsAt", message: "La fin doit suivre le début." }]);
  let row: BannerRow;
  if (id) {
    [row] = await database.update(banners).set({ ...bannerValues(input), updatedAt: new Date() }).where(eq(banners.id, id)).returning();
    if (!row) throw errors.notFound("Bannière", id);
  } else {
    [row] = await database.insert(banners).values(bannerValues(input) as typeof banners.$inferInsert).returning();
  }
  await recordAudit(database, { action: id ? "banner.updated" : "banner.created", entityType: "banner", entityId: row.id, after: input, actor: context.actor, meta: context.meta });
  return bannerView(row);
}

export async function deleteBanner(database: Db, id: string, context: Context) {
  const [row] = await database.delete(banners).where(eq(banners.id, id)).returning({ id: banners.id });
  if (!row) throw errors.notFound("Bannière", id);
  await recordAudit(database, { action: "banner.deleted", entityType: "banner", entityId: id, actor: context.actor, meta: context.meta });
}

/** Bannières actives d'un emplacement, dans leur période d'affichage. */
export async function publicBanners(executor: Executor, placement: string, now = new Date()) {
  const rows = await executor.select().from(banners).where(and(eq(banners.placement, placement), eq(banners.isActive, true), or(isNull(banners.startsAt), lte(banners.startsAt, now)), or(isNull(banners.endsAt), sql`${banners.endsAt} > ${now.toISOString()}::timestamptz`)))
    .orderBy(asc(banners.sortOrder), asc(banners.name));
  return rows.map(({ id, name, imageUrl, alt, targetUrl }) => ({ id, name, imageUrl, alt, targetUrl }));
}

/* ─────────────────────────────  Redirections  ───────────────────────────── */

/** Chemin normalisé : commence par « / », sans requête ni fragment, sans « / » final. */
export function normalizePath(path: string): string {
  const clean = path.trim().split(/[?#]/)[0];
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

const PROTECTED = /^\/(api|_next|admin)(\/|$)/;

export type RedirectInput = { oldPath: string; newPath: string; statusCode?: 301 | 302; note?: string };
type RedirectRow = typeof slugRedirects.$inferSelect;
const redirectView = (row: RedirectRow) => ({ id: row.id, oldPath: row.oldPath, newPath: row.newPath, statusCode: row.statusCode, hits: row.hits, lastHitAt: row.lastHitAt?.toISOString() ?? null, note: row.note, productId: row.productId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

async function saveRedirectInTx(tx: Executor, id: string | null, input: RedirectInput) {
  const oldPath = normalizePath(input.oldPath);
  const newPath = /^https:\/\//i.test(input.newPath.trim()) ? input.newPath.trim() : normalizePath(input.newPath);
  if (oldPath === "/" || PROTECTED.test(oldPath)) throw errors.validation([{ path: "oldPath", message: "Cette adresse ne peut pas être redirigée." }]);
  if (oldPath === newPath) throw errors.validation([{ path: "newPath", message: "La redirection pointe sur elle-même." }]);
  // Boucle : en suivant les redirections depuis la cible, on ne doit jamais revenir à l'adresse d'origine.
  let cursor = newPath;
  for (let hop = 0; hop < 20 && cursor.startsWith("/"); hop++) {
    const [next] = await tx.select({ id: slugRedirects.id, newPath: slugRedirects.newPath }).from(slugRedirects).where(eq(slugRedirects.oldPath, cursor)).limit(1);
    if (!next || next.id === id) break;
    if (next.newPath === oldPath) throw errors.rule("Cette redirection créerait une boucle.", { oldPath, newPath });
    cursor = next.newPath;
  }
  const finalTarget = cursor;
  const [existing] = await tx.select({ id: slugRedirects.id }).from(slugRedirects).where(eq(slugRedirects.oldPath, oldPath)).limit(1);
  if (existing && existing.id !== id) {
    if (id) throw errors.conflict("Cette adresse est déjà redirigée.", { oldPath });
  }
  const values = { oldPath, newPath: finalTarget, statusCode: input.statusCode ?? 301, note: input.note ?? "", updatedAt: new Date() };
  const [row] = id
    ? await tx.update(slugRedirects).set(values).where(eq(slugRedirects.id, id)).returning()
    : await tx.insert(slugRedirects).values(values).onConflictDoUpdate({ target: slugRedirects.oldPath, set: values }).returning();
  if (!row) throw errors.notFound("Redirection", id ?? oldPath);
  // Aplatissement : ce qui pointait vers l'ancienne adresse pointe désormais vers la cible finale.
  await tx.update(slugRedirects).set({ newPath: finalTarget, updatedAt: new Date() }).where(and(eq(slugRedirects.newPath, oldPath), sql`${slugRedirects.id} <> ${row.id}`));
  return row;
}

export const redirectListSpec: ListSpec = {
  sortable: { createdAt: slugRedirects.createdAt, hits: slugRedirects.hits, oldPath: slugRedirects.oldPath },
  filterable: { statusCode: { column: slugRedirects.statusCode, type: "number" }, createdAt: { column: slugRedirects.createdAt, type: "date" } },
  defaultSort: "-createdAt",
  maxLimit: 500,
};

export async function listRedirects(database: Db, query: ListQuery) {
  const search = query.q ? or(ilike(slugRedirects.oldPath, likePattern(query.q)), ilike(slugRedirects.newPath, likePattern(query.q))) : undefined;
  const where = buildWhere({ ...query, q: undefined }, redirectListSpec, [search]);
  const [rows, [total]] = await Promise.all([
    database.select().from(slugRedirects).where(where).orderBy(...buildOrderBy(query, redirectListSpec, slugRedirects.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(slugRedirects).where(where),
  ]);
  return { data: rows.map(redirectView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function saveRedirect(database: Db, id: string | null, input: RedirectInput, context: Context) {
  const row = await database.transaction((tx) => saveRedirectInTx(tx, id, input));
  await recordAudit(database, { action: id ? "redirect.updated" : "redirect.created", entityType: "redirect", entityId: row.id, after: { oldPath: row.oldPath, newPath: row.newPath, statusCode: row.statusCode }, actor: context.actor, meta: context.meta });
  return redirectView(row);
}

export async function deleteRedirect(database: Db, id: string, context: Context) {
  const [row] = await database.delete(slugRedirects).where(eq(slugRedirects.id, id)).returning();
  if (!row) throw errors.notFound("Redirection", id);
  await recordAudit(database, { action: "redirect.deleted", entityType: "redirect", entityId: id, before: { oldPath: row.oldPath, newPath: row.newPath }, actor: context.actor, meta: context.meta });
}

/** Redirection d'une adresse inconnue ; compte l'utilisation. */
export async function resolveRedirect(database: Db, path: string): Promise<{ location: string; permanent: boolean } | null> {
  const oldPath = normalizePath(path);
  const [row] = await database.update(slugRedirects).set({ hits: sql`${slugRedirects.hits} + 1`, lastHitAt: new Date() }).where(eq(slugRedirects.oldPath, oldPath)).returning({ newPath: slugRedirects.newPath, statusCode: slugRedirects.statusCode });
  return row ? { location: row.newPath, permanent: row.statusCode !== 302 } : null;
}

