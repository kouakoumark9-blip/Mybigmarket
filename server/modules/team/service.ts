/**
 * Équipe : employés, rôles, matrice de permissions, clés d'API.
 *
 * Règles de sécurité :
 * - un employé ne peut ni désactiver, ni supprimer, ni changer le rôle de son propre compte ;
 * - le dernier SuperAdmin actif ne peut pas être désactivé, supprimé ni rétrogradé ;
 * - les permissions du rôle SuperAdmin ne sont pas modifiables ;
 * - une clé d'API ne peut pas recevoir une permission que son créateur n'a pas ;
 * - toute modification est journalisée (avant/après) dans la même transaction.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { adminRoles, apiKeys, employees } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { hasPermission, clearRoleCache, type AdminPrincipal } from "@/server/core/auth/principal";
import { hashPassword, passwordProblems, verifyPassword } from "@/server/core/auth/password";
import { newApiKey } from "@/server/core/auth/tokens";
import { PERMISSION_MATRIX, type PermissionCode } from "@/server/core/permissions";
import type { ListQuery } from "@/server/core/http/list-query";
import type { RequestMeta } from "@/server/core/http/request-context";
import * as repo from "@/server/modules/team/repository";

export type EmployeeView = {
  id: string; email: string; firstName: string; lastName: string; roleCode: string; roleName: string;
  status: string; totpEnabled: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string;
};

export function toEmployeeView(row: repo.EmployeeRow): EmployeeView {
  const locked = row.status === "locked" && row.lockedUntil && row.lockedUntil.getTime() > Date.now();
  return {
    id: row.id, email: row.email, firstName: row.firstName, lastName: row.lastName, roleCode: row.roleCode, roleName: row.roleName,
    status: row.status === "locked" && !locked ? "active" : row.status, totpEnabled: row.totpEnabled, mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
  };
}

/** Mot de passe temporaire : 20 caractères sans caractères ambigus. */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(20), (byte) => alphabet[byte % alphabet.length]).join("");
}

type Context = { actor: AdminPrincipal; meta?: RequestMeta };

export async function listEmployees(database: Db, query: ListQuery) {
  const result = await repo.listEmployees(database, query);
  return { data: result.data.map(toEmployeeView), meta: result.meta };
}

export async function getEmployee(database: Db, id: string): Promise<EmployeeView> {
  const row = await repo.findEmployee(database, id);
  if (!row) throw errors.notFound("Employé", id);
  return toEmployeeView(row);
}

export async function createEmployee(database: Db, input: { email: string; firstName: string; lastName: string; roleCode: string; password?: string }, context: Context) {
  const role = await repo.findRoleByCode(database, input.roleCode);
  if (!role) throw errors.validation([{ path: "roleCode", message: "Rôle inconnu." }]);
  if (role.code === "super_admin" && !hasPermission(context.actor, "roles.manage")) throw errors.forbidden("roles.manage");
  if (await repo.findEmployeeByEmail(database, input.email)) throw errors.conflict("Un employé utilise déjà cette adresse e-mail.");
  const provided = Boolean(input.password);
  const password = input.password ?? temporaryPassword();
  const problems = passwordProblems(password, input.email);
  if (problems.length) throw errors.validation(problems.map((message) => ({ path: "password", message })));
  const passwordHash = await hashPassword(password);
  const id = await database.transaction(async (tx) => {
    const [created] = await tx.insert(employees).values({
      email: input.email, firstName: input.firstName, lastName: input.lastName, roleId: role.id, passwordHash,
      status: "active", mustChangePassword: !provided, passwordChangedAt: new Date(),
    }).returning({ id: employees.id });
    await recordAudit(tx, { action: "employee.created", entityType: "employee", entityId: created.id, after: { email: input.email, firstName: input.firstName, lastName: input.lastName, roleCode: role.code }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "employee.created", { employeeId: created.id, email: input.email, roleCode: role.code }, { aggregateId: created.id, shopId: context.actor.shopId });
    return created.id;
  });
  return { employee: await getEmployee(database, id), temporaryPassword: provided ? null : password };
}

async function assertNotLastSuperAdmin(database: Db, employeeId: string, currentRoleCode: string) {
  if (currentRoleCode !== "super_admin") return;
  if ((await repo.countActiveSuperAdmins(database, employeeId)) === 0) throw errors.rule("Impossible : c'est le dernier SuperAdmin actif.");
}

export async function updateEmployee(database: Db, id: string, patch: { firstName?: string; lastName?: string; roleCode?: string; status?: "active" | "disabled" }, context: Context) {
  const current = await repo.findEmployee(database, id);
  if (!current) throw errors.notFound("Employé", id);
  const self = context.actor.employeeId === id;
  if (self && (patch.status !== undefined || patch.roleCode !== undefined)) throw errors.rule("Vous ne pouvez pas modifier le statut ou le rôle de votre propre compte.");
  let roleId = current.roleId;
  let roleCode = current.roleCode;
  if (patch.roleCode && patch.roleCode !== current.roleCode) {
    const role = await repo.findRoleByCode(database, patch.roleCode);
    if (!role) throw errors.validation([{ path: "roleCode", message: "Rôle inconnu." }]);
    if ((role.code === "super_admin" || current.roleCode === "super_admin") && !hasPermission(context.actor, "roles.manage")) throw errors.forbidden("roles.manage");
    await assertNotLastSuperAdmin(database, id, current.roleCode);
    roleId = role.id;
    roleCode = role.code;
  }
  if (patch.status === "disabled") await assertNotLastSuperAdmin(database, id, current.roleCode);
  await database.transaction(async (tx) => {
    const locked = await repo.findEmployeeForUpdate(tx, id);
    if (!locked) throw errors.notFound("Employé", id);
    await tx.update(employees).set({
      ...(patch.firstName ? { firstName: patch.firstName } : {}), ...(patch.lastName ? { lastName: patch.lastName } : {}),
      roleId, ...(patch.status ? { status: patch.status, lockedUntil: null, failedLoginCount: 0 } : {}), updatedAt: new Date(),
    }).where(eq(employees.id, id));
    if (patch.status === "disabled") await repo.revokeEmployeeSessions(tx, id, "disabled");
    const before = { firstName: current.firstName, lastName: current.lastName, roleCode: current.roleCode, status: current.status };
    const after = { firstName: patch.firstName ?? current.firstName, lastName: patch.lastName ?? current.lastName, roleCode, status: patch.status ?? current.status };
    await recordAudit(tx, { action: "employee.updated", entityType: "employee", entityId: id, before, after, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "employee.updated", { employeeId: id, changedFields: Object.keys(patch) }, { aggregateId: id, shopId: context.actor.shopId });
  });
  clearRoleCache();
  return getEmployee(database, id);
}

export async function deleteEmployee(database: Db, id: string, context: Context) {
  const current = await repo.findEmployee(database, id);
  if (!current) throw errors.notFound("Employé", id);
  if (context.actor.employeeId === id) throw errors.rule("Vous ne pouvez pas supprimer votre propre compte.");
  await assertNotLastSuperAdmin(database, id, current.roleCode);
  await database.transaction(async (tx) => {
    await tx.update(employees).set({ deletedAt: new Date(), status: "disabled", updatedAt: new Date() }).where(eq(employees.id, id));
    await repo.revokeEmployeeSessions(tx, id, "deleted");
    await recordAudit(tx, { action: "employee.deleted", entityType: "employee", entityId: id, before: { email: current.email, roleCode: current.roleCode, status: current.status }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "employee.deleted", { employeeId: id }, { aggregateId: id, shopId: context.actor.shopId });
  });
}

/** Mot de passe temporaire : invalide immédiatement les jetons et sessions existants. */
export async function resetEmployeePassword(database: Db, id: string, context: Context) {
  const current = await repo.findEmployee(database, id);
  if (!current) throw errors.notFound("Employé", id);
  if (current.roleCode === "super_admin" && !hasPermission(context.actor, "roles.manage")) throw errors.forbidden("roles.manage");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await database.transaction(async (tx) => {
    await tx.update(employees).set({ passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(employees.id, id));
    await repo.revokeEmployeeSessions(tx, id, "password_reset");
    await recordAudit(tx, { action: "employee.password_reset", entityType: "employee", entityId: id, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "employee.password_reset", { employeeId: id }, { aggregateId: id, shopId: context.actor.shopId });
  });
  return { temporaryPassword: password };
}

export async function changeOwnPassword(database: Db, input: { currentPassword: string; newPassword: string }, context: Context) {
  const employeeId = context.actor.employeeId;
  if (context.actor.kind !== "employee" || !employeeId) throw errors.forbidden();
  const [employee] = await database.select().from(employees).where(and(eq(employees.id, employeeId), isNull(employees.deletedAt))).limit(1);
  if (!employee || !(await verifyPassword(input.currentPassword, employee.passwordHash))) throw errors.validation([{ path: "currentPassword", message: "Mot de passe actuel incorrect." }]);
  if (input.currentPassword === input.newPassword) throw errors.validation([{ path: "newPassword", message: "Le nouveau mot de passe doit être différent." }]);
  const problems = passwordProblems(input.newPassword, employee.email);
  if (problems.length) throw errors.validation(problems.map((message) => ({ path: "newPassword", message })));
  const passwordHash = await hashPassword(input.newPassword);
  await database.transaction(async (tx) => {
    await tx.update(employees).set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(employees.id, employeeId));
    await repo.revokeEmployeeSessions(tx, employeeId, "password_changed");
    await recordAudit(tx, { action: "employee.password_changed", entityType: "employee", entityId: employeeId, actor: context.actor, meta: context.meta });
  });
}

// --- Rôles et permissions -------------------------------------------------

export function permissionMatrix() {
  return Object.entries(PERMISSION_MATRIX).map(([resource, spec]) => ({
    resource, label: spec.label, actions: Object.entries(spec.actions).map(([action, label]) => ({ action, code: `${resource}.${action}`, label })),
  }));
}

export async function listRoles(database: Db) {
  return (await repo.listRolesWithPermissions(database)).map((role) => ({ id: role.id, code: role.code, name: role.name, description: role.description, isSystem: role.isSystem, permissions: role.code === "super_admin" ? ["*"] : role.permissions, employeeCount: role.employeeCount }));
}

export async function createRole(database: Db, input: { code: string; name: string; description: string; permissions: string[] }, context: Context) {
  if (await repo.findRoleByCode(database, input.code)) throw errors.conflict("Ce code de rôle existe déjà.");
  const id = await database.transaction(async (tx) => {
    const [role] = await tx.insert(adminRoles).values({ code: input.code, name: input.name, description: input.description, isSystem: false }).returning({ id: adminRoles.id });
    await repo.replaceRolePermissions(tx, role.id, input.permissions);
    await recordAudit(tx, { action: "role.created", entityType: "role", entityId: role.id, after: { code: input.code, name: input.name, permissions: input.permissions }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "role.created", { roleId: role.id, code: input.code }, { aggregateId: role.id });
    return role.id;
  });
  return (await listRoles(database)).find((role) => role.id === id)!;
}

export async function updateRole(database: Db, id: string, patch: { name?: string; description?: string; permissions?: string[] }, context: Context) {
  const roles = await repo.listRolesWithPermissions(database);
  const current = roles.find((role) => role.id === id);
  if (!current) throw errors.notFound("Rôle", id);
  if (current.code === "super_admin" && patch.permissions) throw errors.rule("Les permissions du SuperAdmin ne sont pas modifiables.");
  await database.transaction(async (tx) => {
    if (patch.name || patch.description !== undefined) await tx.update(adminRoles).set({ ...(patch.name ? { name: patch.name } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) }).where(eq(adminRoles.id, id));
    if (patch.permissions) await repo.replaceRolePermissions(tx, id, [...new Set(patch.permissions)]);
    const before = { name: current.name, description: current.description, permissions: current.permissions };
    const after = { name: patch.name ?? current.name, description: patch.description ?? current.description, permissions: patch.permissions ? [...new Set(patch.permissions)].sort() : current.permissions };
    await recordAudit(tx, { action: "role.updated", entityType: "role", entityId: id, before, after, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "role.updated", { roleId: id, code: current.code, changedFields: Object.keys(patch) }, { aggregateId: id });
  });
  clearRoleCache();
  return (await listRoles(database)).find((role) => role.id === id)!;
}

export async function deleteRole(database: Db, id: string, context: Context) {
  const role = await repo.findRoleById(database, id);
  if (!role) throw errors.notFound("Rôle", id);
  if (role.isSystem) throw errors.rule("Un rôle système ne peut pas être supprimé.");
  const [usage] = await database.select({ id: employees.id }).from(employees).where(and(eq(employees.roleId, id), isNull(employees.deletedAt))).limit(1);
  if (usage) throw errors.rule("Ce rôle est encore attribué à des employés.");
  await database.transaction(async (tx) => {
    await repo.replaceRolePermissions(tx, id, []);
    await tx.delete(adminRoles).where(eq(adminRoles.id, id));
    await recordAudit(tx, { action: "role.deleted", entityType: "role", entityId: id, before: { code: role.code, name: role.name }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "role.deleted", { roleId: id, code: role.code }, { aggregateId: id });
  });
  clearRoleCache();
}

// --- Clés d'API ----------------------------------------------------------

export async function listApiKeys(database: Db, shopId: string) {
  return (await repo.listApiKeyRows(database, shopId)).map((row) => ({ ...row, status: row.revokedAt ? "revoked" : row.expiresAt && row.expiresAt <= new Date() ? "expired" : row.isActive ? "active" : "disabled" }));
}

export async function createApiKey(database: Db, input: { label: string; scopes: string[]; expiresAt?: Date; allowedIps: string[] }, context: Context) {
  const escalation = input.scopes.filter((scope) => !hasPermission(context.actor, scope as PermissionCode));
  if (escalation.length) throw errors.rule("Une clé ne peut pas recevoir une permission que vous n'avez pas.", { scopes: escalation });
  if (input.expiresAt && input.expiresAt <= new Date()) throw errors.validation([{ path: "expiresAt", message: "La date d'expiration doit être dans le futur." }]);
  const generated = newApiKey();
  const id = await database.transaction(async (tx) => {
    const [row] = await tx.insert(apiKeys).values({
      label: input.label, keyPrefix: generated.prefix, keyHash: generated.hash, scopes: [...new Set(input.scopes)], allowedIps: input.allowedIps,
      expiresAt: input.expiresAt ?? null, createdByEmployeeId: context.actor.employeeId, shopId: context.actor.shopId, isActive: true,
    }).returning({ id: apiKeys.id });
    await recordAudit(tx, { action: "api_key.created", entityType: "api_key", entityId: row.id, after: { label: input.label, scopes: input.scopes, expiresAt: input.expiresAt ?? null }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "api_key.created", { apiKeyId: row.id, label: input.label }, { aggregateId: row.id, shopId: context.actor.shopId });
    return row.id;
  });
  const view = (await listApiKeys(database, context.actor.shopId)).find((key) => key.id === id)!;
  return { apiKey: view, secret: generated.key };
}

export async function revokeApiKey(database: Db, id: string, context: Context) {
  const [key] = await database.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!key) throw errors.notFound("Clé d'API", id);
  if (key.revokedAt) return;
  await database.transaction(async (tx) => {
    await tx.update(apiKeys).set({ revokedAt: new Date(), isActive: false }).where(eq(apiKeys.id, id));
    await recordAudit(tx, { action: "api_key.revoked", entityType: "api_key", entityId: id, before: { label: key.label, isActive: key.isActive }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "api_key.revoked", { apiKeyId: id }, { aggregateId: id, shopId: context.actor.shopId });
  });
}
