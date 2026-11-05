/**
 * Identification de l'appelant.
 *
 * API d'administration : `Authorization: Bearer <jeton>`, où le jeton est
 *   - un jeton d'accès JWT d'employé (connexion API ou émis par le back-office),
 *   - ou une clé d'API `mbm_…` (intégrations), limitée à ses portées.
 * Boutique : session Auth.js existante (cookie HttpOnly).
 */
import { and, eq, isNull } from "drizzle-orm";
import { adminPermissions as permissions, adminRoles as roles, apiKeys, employeeSessions, employees, rolePermissions, DEFAULT_SHOP_ID } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { ALL_PERMISSIONS, can, type PermissionCode } from "@/server/core/permissions";
import { epochSeconds, parseApiKey, verifyAccessToken } from "@/server/core/auth/tokens";

export type AdminPrincipal = {
  kind: "employee" | "api_key";
  /** Identifiant de l'acteur pour l'audit et les limites de débit. */
  actorId: string;
  employeeId: string | null;
  apiKeyId: string | null;
  label: string;
  roleCode: string | null;
  sessionId: string | null;
  shopId: string;
  permissions: ReadonlySet<string>;
};

export type CustomerPrincipal = { kind: "customer"; userId: string; role: string; email: string | null };

export function hasPermission(principal: AdminPrincipal, code: PermissionCode): boolean {
  return can(principal.permissions, code);
}

export function assertPermission(principal: AdminPrincipal, code: PermissionCode) {
  if (!hasPermission(principal, code)) throw errors.forbidden(code);
}

/** Statut effectif : un verrouillage expiré ne bloque plus le compte. */
export function effectiveEmployeeStatus(status: string, lockedUntil: Date | null, now = new Date()): string {
  if (status === "locked" && lockedUntil && lockedUntil.getTime() <= now.getTime()) return "active";
  return status;
}

const roleCache = new Map<string, { codes: Set<string>; roleCode: string; at: number }>();
const ROLE_CACHE_MS = 30_000;

export function clearRoleCache() {
  roleCache.clear();
}

export async function rolePermissionSet(database: Db, roleId: string): Promise<{ roleCode: string; codes: Set<string> }> {
  const cached = roleCache.get(roleId);
  if (cached && Date.now() - cached.at < ROLE_CACHE_MS) return cached;
  const [role] = await database.select({ code: roles.code }).from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw errors.forbidden();
  const rows = await database.select({ code: permissions.code }).from(rolePermissions).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(eq(rolePermissions.roleId, roleId));
  // Le SuperAdmin reçoit toujours l'intégralité de la matrice, y compris les permissions ajoutées plus tard.
  const codes = role.code === "super_admin" ? new Set<string>(ALL_PERMISSIONS.map((entry) => entry.code)) : new Set(rows.map((row) => row.code));
  const value = { roleCode: role.code, codes, at: Date.now() };
  roleCache.set(roleId, value);
  return value;
}

export async function loadActiveEmployee(database: Db, employeeId: string) {
  const [employee] = await database.select().from(employees).where(and(eq(employees.id, employeeId), isNull(employees.deletedAt))).limit(1);
  if (!employee || effectiveEmployeeStatus(employee.status, employee.lockedUntil) !== "active") return null;
  return employee;
}

async function fromAccessToken(database: Db, token: string): Promise<AdminPrincipal> {
  const result = verifyAccessToken(token);
  if (!result.ok) throw errors.unauthenticated(result.reason === "expired" ? "Jeton expiré : rafraîchissez la session." : "Jeton d'accès invalide.");
  const employee = await loadActiveEmployee(database, result.claims.sub);
  if (!employee) throw errors.unauthenticated("Compte employé inactif.");
  if (epochSeconds(employee.passwordChangedAt) !== result.claims.pwd) throw errors.unauthenticated("Le mot de passe a changé : reconnectez-vous.");
  if (result.claims.sid) {
    const [session] = await database.select({ revokedAt: employeeSessions.revokedAt, expiresAt: employeeSessions.expiresAt }).from(employeeSessions)
      .where(and(eq(employeeSessions.familyId, result.claims.sid), isNull(employeeSessions.revokedAt))).limit(1);
    if (!session || session.expiresAt.getTime() <= Date.now()) throw errors.unauthenticated("Session terminée : reconnectez-vous.");
  }
  const role = await rolePermissionSet(database, employee.roleId);
  return {
    kind: "employee", actorId: employee.id, employeeId: employee.id, apiKeyId: null,
    label: `${employee.firstName} ${employee.lastName}`.trim() || employee.email,
    roleCode: role.roleCode, sessionId: result.claims.sid ?? null, shopId: DEFAULT_SHOP_ID, permissions: role.codes,
  };
}

async function fromApiKey(database: Db, value: string, ip: string | null): Promise<AdminPrincipal> {
  const parsed = parseApiKey(value);
  if (!parsed) throw errors.unauthenticated("Clé d'API invalide.");
  const [key] = await database.select().from(apiKeys).where(eq(apiKeys.keyHash, parsed.hash)).limit(1);
  const now = new Date();
  if (!key || !key.isActive || key.revokedAt || (key.expiresAt && key.expiresAt <= now)) throw errors.unauthenticated("Clé d'API invalide, expirée ou révoquée.");
  if (key.allowedIps.length && (!ip || !key.allowedIps.includes(ip))) throw errors.forbidden();
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > 5 * 60_000) await database.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, key.id));
  return {
    kind: "api_key", actorId: key.id, employeeId: key.createdByEmployeeId, apiKeyId: key.id, label: `Clé d'API ${key.label}`,
    roleCode: null, sessionId: null, shopId: key.shopId ?? DEFAULT_SHOP_ID, permissions: new Set(key.scopes),
  };
}

/**
 * Principal d'un employé hors requête (traitement par lots d'un import, tâche relancée) : mêmes
 * droits que son rôle actuel ; `null` si le compte n'est plus actif.
 */
export async function principalForEmployee(database: Db, employeeId: string): Promise<AdminPrincipal | null> {
  const employee = await loadActiveEmployee(database, employeeId);
  if (!employee) return null;
  const role = await rolePermissionSet(database, employee.roleId);
  return {
    kind: "employee", actorId: employee.id, employeeId: employee.id, apiKeyId: null,
    label: `${employee.firstName} ${employee.lastName}`.trim() || employee.email,
    roleCode: role.roleCode, sessionId: null, shopId: DEFAULT_SHOP_ID, permissions: role.codes,
  };
}

export function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function resolveAdminPrincipal(database: Db, headers: Headers, ip: string | null): Promise<AdminPrincipal> {
  const token = bearerToken(headers);
  if (!token) throw errors.unauthenticated("En-tête Authorization: Bearer manquant.");
  return token.startsWith("mbm_") ? fromApiKey(database, token, ip) : fromAccessToken(database, token);
}

/** Session client de la boutique (Auth.js). Importée à la demande pour rester testable. */
export async function resolveCustomerPrincipal(): Promise<CustomerPrincipal | null> {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  return { kind: "customer", userId: session.user.id, role: session.user.role, email: session.user.email ?? null };
}
