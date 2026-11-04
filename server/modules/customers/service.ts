/**
 * Clients (administration) : liste et recherche, fiche, groupes de clients, anonymisation
 * (droit à l'effacement : on anonymise, on ne supprime pas, et seulement sans commande en cours)
 * et export des données.
 */
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { anonymizedIdentity, canAnonymizeCustomer } from "@/lib/customer-rules";
import { customerAddresses, customerGroupMembers, customerGroups, customers, orders, users } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { buildOrderBy, buildWhere, likePattern, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { definedEntries, type Context } from "@/server/modules/catalog/shared";

export const customerListSpec: ListSpec = {
  sortable: { createdAt: customers.createdAt, lastActivityAt: customers.lastActivityAt, name: users.name },
  filterable: { customerGroupId: { column: customers.customerGroupId, type: "number" }, segment: { column: customers.segment, type: "enum", values: ["individual", "business", "reseller"] }, createdAt: { column: customers.createdAt, type: "date" } },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

export async function listCustomers(database: Db, query: ListQuery) {
  const search = query.q ? or(ilike(users.email, likePattern(query.q)), ilike(users.name, likePattern(query.q)), ilike(users.phone, likePattern(query.q)), ilike(customers.companyName, likePattern(query.q))) : undefined;
  const where = buildWhere({ ...query, q: undefined }, customerListSpec, [isNull(customers.deletedAt), search]);
  const [rows, [total]] = await Promise.all([
    database.select({ customer: customers, name: users.name, email: users.email, phone: users.phone, groupName: customerGroups.name }).from(customers).innerJoin(users, eq(users.id, customers.userId)).leftJoin(customerGroups, eq(customerGroups.id, customers.customerGroupId))
      .where(where).orderBy(...buildOrderBy(query, customerListSpec, customers.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(where),
  ]);
  const ids = rows.map((row) => row.customer.userId);
  const stats = ids.length ? await database.select({ buyerId: orders.buyerId, orders: sql<number>`count(*)::int`, spent: sql<number>`coalesce(sum(${orders.totalXof}) filter (where ${orders.status} not in ('awaiting_payment', 'cancelled', 'refunded')), 0)::int` }).from(orders).where(inArray(orders.buyerId, ids)).groupBy(orders.buyerId) : [];
  return {
    data: rows.map((row) => {
      const stat = stats.find((entry) => entry.buyerId === row.customer.userId);
      return { id: row.customer.id, userId: row.customer.userId, name: row.name, email: row.email, phone: row.phone, companyName: row.customer.companyName, segment: row.customer.segment, group: row.groupName, orderCount: Number(stat?.orders ?? 0), totalSpentXof: Number(stat?.spent ?? 0), lastActivityAt: row.customer.lastActivityAt?.toISOString() ?? null, createdAt: row.customer.createdAt.toISOString() };
    }),
    meta: listMeta(query, Number(total?.value ?? 0)),
  };
}

async function findCustomer(executor: Executor, id: string) {
  const [row] = await executor.select({ customer: customers, user: users }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(and(eq(customers.id, id), isNull(customers.deletedAt))).limit(1);
  if (!row) throw errors.notFound("Client", id);
  return row;
}

export async function getCustomer(database: Db, id: string) {
  const { customer, user } = await findCustomer(database, id);
  const [addresses, recentOrders, groups, [stat]] = await Promise.all([
    database.select().from(customerAddresses).where(and(eq(customerAddresses.customerId, id), isNull(customerAddresses.deletedAt))).orderBy(desc(customerAddresses.isDefaultShipping)),
    database.select({ id: orders.id, reference: orders.reference, status: orders.status, totalXof: orders.totalXof, createdAt: orders.createdAt }).from(orders).where(eq(orders.buyerId, user.id)).orderBy(desc(orders.createdAt)).limit(10),
    database.select({ id: customerGroups.id, name: customerGroups.name }).from(customerGroupMembers).innerJoin(customerGroups, eq(customerGroups.id, customerGroupMembers.customerGroupId)).where(eq(customerGroupMembers.customerId, id)),
    database.select({ orders: sql<number>`count(*)::int`, spent: sql<number>`coalesce(sum(${orders.totalXof}) filter (where ${orders.status} not in ('awaiting_payment', 'cancelled', 'refunded')), 0)::int` }).from(orders).where(eq(orders.buyerId, user.id)),
  ]);
  return {
    id: customer.id, userId: user.id, name: user.name, email: user.email, phone: user.phone, accountStatus: user.status, companyName: customer.companyName, taxNumber: customer.taxNumber, segment: customer.segment,
    customerGroupId: customer.customerGroupId, additionalGroups: groups, preferredLanguage: customer.preferredLanguage, internalNote: customer.internalNote,
    newsletter: Boolean(customer.newsletterConsentAt && !customer.newsletterOptOutAt), createdAt: customer.createdAt.toISOString(), lastActivityAt: customer.lastActivityAt?.toISOString() ?? null,
    stats: { orderCount: Number(stat?.orders ?? 0), totalSpentXof: Number(stat?.spent ?? 0) },
    addresses: addresses.map((address) => ({ id: address.id, label: address.label, name: `${address.firstName} ${address.lastName}`.trim(), phone: address.phone, line1: address.line1, city: address.city, countryCode: address.countryCode, isDefaultShipping: address.isDefaultShipping })),
    recentOrders: recentOrders.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() })),
  };
}

export async function updateCustomer(database: Db, id: string, input: { customerGroupId?: number | null; segment?: "individual" | "business" | "reseller"; internalNote?: string; companyName?: string | null; taxNumber?: string | null; additionalGroupIds?: number[] }, context: Context) {
  await database.transaction(async (tx) => {
    const { customer } = await findCustomer(tx, id);
    const groupIds = [...new Set([...(input.customerGroupId != null ? [input.customerGroupId] : []), ...(input.additionalGroupIds ?? [])])];
    if (groupIds.length) {
      const found = await tx.select({ id: customerGroups.id }).from(customerGroups).where(and(inArray(customerGroups.id, groupIds), isNull(customerGroups.deletedAt)));
      if (found.length !== groupIds.length) throw errors.validation([{ path: "customerGroupId", message: "Groupe de clients introuvable." }]);
    }
    const { additionalGroupIds, ...fields } = input;
    if (Object.keys(definedEntries(fields)).length) await tx.update(customers).set({ ...definedEntries(fields), updatedAt: new Date() }).where(eq(customers.id, id));
    if (additionalGroupIds) {
      await tx.delete(customerGroupMembers).where(eq(customerGroupMembers.customerId, id));
      if (additionalGroupIds.length) await tx.insert(customerGroupMembers).values([...new Set(additionalGroupIds)].map((groupId) => ({ customerId: id, customerGroupId: groupId })));
    }
    await recordAudit(tx, { action: "customer.updated", entityType: "customer", entityId: id, before: { customerGroupId: customer.customerGroupId, segment: customer.segment, internalNote: customer.internalNote }, after: input, actor: context.actor, meta: context.meta });
  });
  return getCustomer(database, id);
}

export async function anonymizeCustomer(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const { customer, user } = await findCustomer(tx, id);
    const statuses = await tx.select({ status: orders.status }).from(orders).where(eq(orders.buyerId, user.id));
    const check = canAnonymizeCustomer(statuses);
    if (!check.allowed) throw errors.rule(`Anonymisation impossible : ${check.openOrders} commande(s) encore en cours.`, { openOrders: check.openOrders });
    const identity = anonymizedIdentity(id);
    const now = new Date();
    await tx.update(users).set({ name: identity.name, email: identity.email, phone: null, status: "deleted", anonymizedAt: now, deletedAt: now, updatedAt: now }).where(eq(users.id, user.id));
    await tx.update(customers).set({ companyName: null, taxNumber: null, internalNote: "", newsletterConsentAt: null, marketingConsentAt: null, anonymizedAt: now, deletedAt: now, updatedAt: now }).where(eq(customers.id, id));
    await tx.update(customerAddresses).set({ firstName: "Anonyme", lastName: "", companyName: null, phone: "", phoneNormalized: "", line1: "—", line2: null, deliveryInstructions: null, isActive: false, deletedAt: now }).where(eq(customerAddresses.customerId, id));
    // Les commandes restent (obligation comptable) mais l'adresse recopiée est effacée.
    await tx.update(orders).set({ deliveryAddress: { anonymized: "true" } }).where(eq(orders.buyerId, user.id));
    await recordAudit(tx, { action: "customer.anonymized", entityType: "customer", entityId: id, before: { email: user.email, segment: customer.segment }, after: { email: identity.email }, actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Groupes de clients  ───────────────────────────── */

type GroupRow = typeof customerGroups.$inferSelect;
const groupView = (row: GroupRow, members = 0) => ({ id: row.id, code: row.code, name: row.name, description: row.description, discountBasisPoints: row.discountBasisPoints, discountPercent: row.discountBasisPoints / 100, priceDisplayMethod: row.priceDisplayMethod, showPrices: row.showPrices, isDefault: row.isDefault, isActive: row.isActive, sortOrder: row.sortOrder, customerCount: members });

export async function listGroups(database: Db) {
  const rows = await database.select().from(customerGroups).where(isNull(customerGroups.deletedAt)).orderBy(asc(customerGroups.sortOrder), asc(customerGroups.name));
  const counts = await database.select({ groupId: customers.customerGroupId, value: count() }).from(customers).where(isNull(customers.deletedAt)).groupBy(customers.customerGroupId);
  return rows.map((row) => groupView(row, Number(counts.find((entry) => entry.groupId === row.id)?.value ?? 0)));
}

type GroupInput = { code?: string; name?: string; description?: string; discountBasisPoints?: number; priceDisplayMethod?: "tax_excluded" | "tax_included"; showPrices?: boolean; isDefault?: boolean; isActive?: boolean; sortOrder?: number };

export async function createGroup(database: Db, input: GroupInput & { code: string; name: string }, context: Context) {
  return database.transaction(async (tx) => {
    if (input.isDefault) await tx.update(customerGroups).set({ isDefault: false }).where(eq(customerGroups.isDefault, true));
    const [row] = await tx.insert(customerGroups).values(input).returning();
    await recordAudit(tx, { action: "customer_group.created", entityType: "customer_group", entityId: row.id, after: groupView(row), actor: context.actor, meta: context.meta });
    return groupView(row);
  });
}

export async function updateGroup(database: Db, id: number, input: GroupInput, context: Context) {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(customerGroups).where(and(eq(customerGroups.id, id), isNull(customerGroups.deletedAt))).limit(1);
    if (!before) throw errors.notFound("Groupe de clients", id);
    if (before.isDefault && input.isDefault === false) throw errors.rule("Désignez un autre groupe par défaut plutôt que de retirer ce statut.");
    if (input.isDefault && !before.isDefault) await tx.update(customerGroups).set({ isDefault: false }).where(and(eq(customerGroups.isDefault, true), ne(customerGroups.id, id)));
    const [after] = await tx.update(customerGroups).set({ ...definedEntries(input), updatedAt: new Date() }).where(eq(customerGroups.id, id)).returning();
    await recordAudit(tx, { action: "customer_group.updated", entityType: "customer_group", entityId: id, before: groupView(before), after: groupView(after), actor: context.actor, meta: context.meta });
    return groupView(after);
  });
}

export async function deleteGroup(database: Db, id: number, context: Context) {
  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(customerGroups).where(and(eq(customerGroups.id, id), isNull(customerGroups.deletedAt))).limit(1);
    if (!before) throw errors.notFound("Groupe de clients", id);
    if (before.isDefault) throw errors.rule("Le groupe par défaut ne peut pas être supprimé.");
    const [fallback] = await tx.select({ id: customerGroups.id }).from(customerGroups).where(and(eq(customerGroups.isDefault, true), isNull(customerGroups.deletedAt))).limit(1);
    // Les clients du groupe rejoignent le groupe par défaut (ou aucun groupe).
    await tx.update(customers).set({ customerGroupId: fallback?.id ?? null }).where(eq(customers.customerGroupId, id));
    await tx.delete(customerGroupMembers).where(eq(customerGroupMembers.customerGroupId, id));
    await tx.update(customerGroups).set({ deletedAt: new Date(), isActive: false }).where(eq(customerGroups.id, id));
    await recordAudit(tx, { action: "customer_group.deleted", entityType: "customer_group", entityId: id, before: groupView(before), details: { movedTo: fallback?.id ?? null }, actor: context.actor, meta: context.meta });
  });
}
