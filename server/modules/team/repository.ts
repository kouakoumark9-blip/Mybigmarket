/** Accès aux données de l'équipe : requêtes uniquement, aucune règle métier. */
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { adminPermissions, adminRoles, apiKeys, employeeSessions, employees, rolePermissions } from "@/lib/db/schema";
import type { Executor } from "@/server/core/db";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListResult, type ListSpec } from "@/server/core/http/list-query";

export const employeeListSpec: ListSpec = {
  sortable: { createdAt: employees.createdAt, lastLoginAt: employees.lastLoginAt, email: employees.email, lastName: employees.lastName, status: employees.status },
  filterable: {
    status: { column: employees.status, type: "enum", values: ["active", "invited", "disabled", "locked"] },
    roleId: { column: employees.roleId, type: "uuid" },
    totpEnabled: { column: employees.totpEnabled, type: "boolean" },
    createdAt: { column: employees.createdAt, type: "date" },
    lastLoginAt: { column: employees.lastLoginAt, type: "date" },
  },
  searchable: [employees.email, employees.firstName, employees.lastName],
  defaultSort: "-createdAt",
};

const employeeColumns = {
  id: employees.id, email: employees.email, firstName: employees.firstName, lastName: employees.lastName,
  roleId: employees.roleId, roleCode: adminRoles.code, roleName: adminRoles.name, status: employees.status,
  lockedUntil: employees.lockedUntil, totpEnabled: employees.totpEnabled, mustChangePassword: employees.mustChangePassword,
  lastLoginAt: employees.lastLoginAt, createdAt: employees.createdAt, updatedAt: employees.updatedAt,
};

export type EmployeeRow = { id: string; email: string; firstName: string; lastName: string; roleId: string; roleCode: string; roleName: string; status: string; lockedUntil: Date | null; totpEnabled: boolean; mustChangePassword: boolean; lastLoginAt: Date | null; createdAt: Date; updatedAt: Date };

export async function listEmployees(executor: Executor, query: ListQuery): Promise<ListResult<EmployeeRow>> {
  const where = buildWhere(query, employeeListSpec, [isNull(employees.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    executor.select(employeeColumns).from(employees).innerJoin(adminRoles, eq(adminRoles.id, employees.roleId)).where(where)
      .orderBy(...buildOrderBy(query, employeeListSpec, employees.id)).limit(query.limit).offset(query.offset),
    executor.select({ value: count() }).from(employees).where(where),
  ]);
  return { data: rows, meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function findEmployee(executor: Executor, id: string): Promise<EmployeeRow | null> {
  const [row] = await executor.select(employeeColumns).from(employees).innerJoin(adminRoles, eq(adminRoles.id, employees.roleId)).where(and(eq(employees.id, id), isNull(employees.deletedAt))).limit(1);
  return row ?? null;
}

export async function findEmployeeForUpdate(executor: Executor, id: string) {
  const [row] = await executor.select().from(employees).where(and(eq(employees.id, id), isNull(employees.deletedAt))).limit(1).for("update");
  return row ?? null;
}

export async function findEmployeeByEmail(executor: Executor, email: string) {
  const [row] = await executor.select().from(employees).where(eq(employees.email, email)).limit(1);
  return row ?? null;
}

export async function findRoleByCode(executor: Executor, code: string) {
  const [row] = await executor.select().from(adminRoles).where(eq(adminRoles.code, code)).limit(1);
  return row ?? null;
}

export async function findRoleById(executor: Executor, id: string) {
  const [row] = await executor.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  return row ?? null;
}

/** Nombre de SuperAdmins actifs, hors employé donné (pour ne jamais supprimer le dernier). */
export async function countActiveSuperAdmins(executor: Executor, excludingEmployeeId?: string): Promise<number> {
  const conditions = [eq(adminRoles.code, "super_admin"), eq(employees.status, "active"), isNull(employees.deletedAt)];
  if (excludingEmployeeId) conditions.push(ne(employees.id, excludingEmployeeId));
  const [row] = await executor.select({ value: count() }).from(employees).innerJoin(adminRoles, eq(adminRoles.id, employees.roleId)).where(and(...conditions));
  return Number(row?.value ?? 0);
}

export async function revokeEmployeeSessions(executor: Executor, employeeId: string, reason: string) {
  await executor.update(employeeSessions).set({ revokedAt: new Date(), revokedReason: reason }).where(and(eq(employeeSessions.employeeId, employeeId), isNull(employeeSessions.revokedAt)));
}

export async function listRolesWithPermissions(executor: Executor) {
  const roles = await executor.select().from(adminRoles).orderBy(adminRoles.name);
  const grants = await executor.select({ roleId: rolePermissions.roleId, code: adminPermissions.code }).from(rolePermissions).innerJoin(adminPermissions, eq(adminPermissions.id, rolePermissions.permissionId));
  const counts = await executor.select({ roleId: employees.roleId, value: count() }).from(employees).where(isNull(employees.deletedAt)).groupBy(employees.roleId);
  const countByRole = new Map(counts.map((row) => [row.roleId, Number(row.value)]));
  return roles.map((role) => ({ ...role, permissions: grants.filter((grant) => grant.roleId === role.id).map((grant) => grant.code).sort(), employeeCount: countByRole.get(role.id) ?? 0 }));
}

export async function replaceRolePermissions(executor: Executor, roleId: string, codes: string[]) {
  await executor.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (!codes.length) return;
  const ids = await executor.select({ id: adminPermissions.id }).from(adminPermissions).where(inArray(adminPermissions.code, codes));
  if (ids.length) await executor.insert(rolePermissions).values(ids.map((row) => ({ roleId, permissionId: row.id }))).onConflictDoNothing();
}

export async function listApiKeyRows(executor: Executor, shopId: string) {
  return executor.select({
    id: apiKeys.id, label: apiKeys.label, keyPrefix: apiKeys.keyPrefix, scopes: apiKeys.scopes, allowedIps: apiKeys.allowedIps, isActive: apiKeys.isActive,
    lastUsedAt: apiKeys.lastUsedAt, expiresAt: apiKeys.expiresAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt, createdByEmployeeId: apiKeys.createdByEmployeeId,
  }).from(apiKeys).where(sql`coalesce(${apiKeys.shopId}, ${shopId}::uuid) = ${shopId}::uuid`).orderBy(sql`${apiKeys.createdAt} desc`);
}
