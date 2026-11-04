/**
 * Profil client de la boutique : créé à la première action qui en a besoin (panier, commande,
 * adresse), rattaché au groupe de clients par défaut.
 */
import { and, eq, isNull } from "drizzle-orm";
import { customerGroupMembers, customerGroups, customers, users } from "@/lib/db/schema";
import type { Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";

export type CustomerContext = { userId: string; customerId: string; groupId: number | null; groupIds: number[] };

/** Profil client du compte (créé au besoin). Refusé pour un compte inactif ou supprimé. */
export async function ensureCustomer(executor: Executor, userId: string): Promise<CustomerContext> {
  const [user] = await executor.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "active") throw errors.forbidden();
  let [customer] = await executor.select({ id: customers.id, groupId: customers.customerGroupId, deletedAt: customers.deletedAt }).from(customers).where(eq(customers.userId, userId)).limit(1);
  if (!customer) {
    const [defaultGroup] = await executor.select({ id: customerGroups.id }).from(customerGroups).where(and(eq(customerGroups.isDefault, true), isNull(customerGroups.deletedAt))).limit(1);
    await executor.insert(customers).values({ userId, customerGroupId: defaultGroup?.id ?? null }).onConflictDoNothing({ target: customers.userId });
    [customer] = await executor.select({ id: customers.id, groupId: customers.customerGroupId, deletedAt: customers.deletedAt }).from(customers).where(eq(customers.userId, userId)).limit(1);
  }
  if (customer.deletedAt) throw errors.forbidden();
  const members = await executor.select({ groupId: customerGroupMembers.customerGroupId }).from(customerGroupMembers).where(eq(customerGroupMembers.customerId, customer.id));
  return { userId, customerId: customer.id, groupId: customer.groupId, groupIds: [...new Set([...(customer.groupId != null ? [customer.groupId] : []), ...members.map((member) => member.groupId)])] };
}

/** Profil client existant, sans création (lecture). */
export async function findCustomer(executor: Executor, userId: string): Promise<CustomerContext | null> {
  const [customer] = await executor.select({ id: customers.id, groupId: customers.customerGroupId }).from(customers).where(and(eq(customers.userId, userId), isNull(customers.deletedAt))).limit(1);
  if (!customer) return null;
  const members = await executor.select({ groupId: customerGroupMembers.customerGroupId }).from(customerGroupMembers).where(eq(customerGroupMembers.customerId, customer.id));
  return { userId, customerId: customer.id, groupId: customer.groupId, groupIds: [...new Set([...(customer.groupId != null ? [customer.groupId] : []), ...members.map((member) => member.groupId)])] };
}
