/**
 * Multi-boutique (étape 8) : création et réglage des boutiques, accès des employés.
 *
 * Contexte boutique d'une requête : en-tête `X-Shop-Code`, sinon domaine, sinon boutique par défaut
 * (server/core/shop.ts). Côté administration, un employé n'agit que dans les boutiques auxquelles
 * il a accès : toutes pour un SuperAdmin ou avec la permission « shops.manage » ; sinon celles qui
 * lui sont attribuées, ou la boutique par défaut s'il n'en a aucune.
 *
 * Données propres à chaque boutique : paramètres, tickets et modèles de réponse, propositions et
 * quotas de l'assistant IA, imports, statistiques, entrepôts, prix spécifiques et règles de prix.
 * Le catalogue des vendeurs et les commandes de la place de marché sont communs.
 */
import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { employeeShops, employees, settings, shops } from "@/lib/db/schema";
import type { AdminPrincipal } from "@/server/core/auth/principal";
import { recordAudit } from "@/server/core/audit";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { accessibleShopIds, clearShopCache } from "@/server/core/shop";

export { accessibleShopIds, canAccessShop } from "@/server/core/shop";
import type { Context } from "@/server/modules/catalog/shared";

type ShopRow = typeof shops.$inferSelect;
const shopView = (row: ShopRow, employeeCount?: number) => ({
  id: row.id, code: row.code, name: row.name, domain: row.domain, isDefault: row.isDefault, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt,
  ...(employeeCount === undefined ? {} : { assignedEmployees: employeeCount }),
});

export async function listShops(database: Db, principal: AdminPrincipal) {
  const ids = await accessibleShopIds(database, principal);
  const rows = await database.select().from(shops).where(and(isNull(shops.deletedAt), ids ? inArray(shops.id, ids) : undefined)).orderBy(asc(shops.code));
  const counts = await database.select({ shopId: employeeShops.shopId, value: count() }).from(employeeShops).groupBy(employeeShops.shopId);
  return rows.map((row) => shopView(row, Number(counts.find((entry) => entry.shopId === row.id)?.value ?? 0)));
}

async function findShop(database: Db, id: string) {
  const [row] = await database.select().from(shops).where(and(eq(shops.id, id), isNull(shops.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Boutique", id);
  return row;
}

export type ShopInput = { code?: string; name?: string; domain?: string | null; isActive?: boolean; isDefault?: boolean };

export async function createShop(database: Db, input: ShopInput & { code: string; name: string; copySettingsFrom?: string }, context: Context) {
  const created = await database.transaction(async (tx) => {
    const [row] = await tx.insert(shops).values({ code: input.code, name: input.name, domain: input.domain || null, isActive: input.isActive ?? true }).onConflictDoNothing().returning();
    if (!row) throw errors.conflict("Code ou domaine déjà utilisé par une autre boutique.");
    if (input.copySettingsFrom) {
      const [source] = await tx.select({ id: shops.id }).from(shops).where(and(eq(shops.code, input.copySettingsFrom), isNull(shops.deletedAt))).limit(1);
      if (!source) throw errors.validation([{ path: "copySettingsFrom", message: `Boutique « ${input.copySettingsFrom} » introuvable.` }]);
      const rows = await tx.select().from(settings).where(eq(settings.shopId, source.id));
      if (rows.length) await tx.insert(settings).values(rows.map(({ id: _id, ...setting }) => { void _id; return { ...setting, shopId: row.id, updatedByEmployeeId: context.actor.employeeId, updatedAt: new Date() }; }));
      // Le nom de la nouvelle boutique remplace celui copié.
      await tx.update(settings).set({ value: input.name }).where(and(eq(settings.shopId, row.id), eq(settings.key, "store.name")));
    }
    await recordAudit(tx, { action: "shop.created", entityType: "shop", entityId: row.id, after: shopView(row), details: { copySettingsFrom: input.copySettingsFrom ?? null }, actor: context.actor, meta: context.meta });
    return row;
  });
  clearShopCache();
  return shopView(created);
}

export async function updateShop(database: Db, id: string, input: ShopInput, context: Context) {
  const updated = await database.transaction(async (tx) => {
    const before = await findShop(tx as unknown as Db, id);
    if (input.isActive === false && (before.isDefault || input.isDefault)) throw errors.rule("La boutique par défaut ne peut pas être désactivée : désignez-en une autre d'abord.");
    if (input.isDefault === false && before.isDefault) throw errors.rule("Désignez une autre boutique par défaut plutôt que de retirer ce rôle.");
    if (input.isDefault) await tx.update(shops).set({ isDefault: false, updatedAt: new Date() }).where(and(ne(shops.id, id), eq(shops.isDefault, true)));
    const values = Object.fromEntries(Object.entries({ name: input.name, domain: input.domain === "" ? null : input.domain, isActive: input.isActive, isDefault: input.isDefault }).filter(([, value]) => value !== undefined));
    const [after] = await tx.update(shops).set({ ...values, updatedAt: new Date() }).where(eq(shops.id, id)).returning().catch((error) => {
      throw (error as { cause?: { code?: string } })?.cause?.code === "23505" || (error as { code?: string })?.code === "23505" ? errors.conflict("Domaine déjà utilisé par une autre boutique.") : error;
    });
    await recordAudit(tx, { action: "shop.updated", entityType: "shop", entityId: id, before: shopView(before), after: shopView(after), actor: context.actor, meta: context.meta });
    return after;
  });
  clearShopCache();
  return shopView(updated);
}

export async function shopEmployees(database: Db, shopId: string) {
  await findShop(database, shopId);
  const rows = await database.select({ id: employees.id, email: employees.email, firstName: employees.firstName, lastName: employees.lastName }).from(employeeShops)
    .innerJoin(employees, eq(employees.id, employeeShops.employeeId)).where(eq(employeeShops.shopId, shopId)).orderBy(asc(employees.email));
  return rows.map((row) => ({ id: row.id, email: row.email, name: `${row.firstName} ${row.lastName}`.trim() }));
}

/** Remplace la liste des employés attribués à une boutique. */
export async function setShopEmployees(database: Db, shopId: string, employeeIds: string[], context: Context) {
  await findShop(database, shopId);
  const unique = [...new Set(employeeIds)];
  await database.transaction(async (tx) => {
    if (unique.length) {
      const found = await tx.select({ id: employees.id }).from(employees).where(and(inArray(employees.id, unique), isNull(employees.deletedAt)));
      const missing = unique.filter((employeeId) => !found.some((row) => row.id === employeeId));
      if (missing.length) throw errors.validation([{ path: "employeeIds", message: `Employé(s) introuvable(s) : ${missing.join(", ")}.` }]);
    }
    const before = await tx.select({ employeeId: employeeShops.employeeId }).from(employeeShops).where(eq(employeeShops.shopId, shopId));
    await tx.delete(employeeShops).where(eq(employeeShops.shopId, shopId));
    if (unique.length) await tx.insert(employeeShops).values(unique.map((employeeId) => ({ employeeId, shopId })));
    await recordAudit(tx, { action: "shop.employees_updated", entityType: "shop", entityId: shopId, before: { employeeIds: before.map((row) => row.employeeId) }, after: { employeeIds: unique }, actor: context.actor, meta: context.meta });
  });
  return shopEmployees(database, shopId);
}
