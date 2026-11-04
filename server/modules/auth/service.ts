/**
 * Authentification de l'API d'administration.
 *
 * Mêmes protections que la connexion du back-office (adminnew/auth.ts) :
 * 6 échecs par e-mail ou 18 par IP sur 15 minutes → refus ; verrouillage du compte
 * après 6 échecs ; TOTP obligatoire si activé ; réponse identique que le compte
 * existe ou non.
 *
 * Jetons : accès JWT 10 minutes + rafraîchissement 30 jours à usage unique. Présenter
 * un jeton de rafraîchissement déjà utilisé révoque toute la famille de sessions
 * (signe de vol de jeton) et journalise un événement de sécurité.
 */
import { randomUUID } from "node:crypto";
import { and, count, eq, gte, isNull } from "drizzle-orm";
import { employeeLoginEvents, employeeSecurityEvents, employeeSessions, employees, DEFAULT_SHOP_ID } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { logger } from "@/server/core/logger";
import { recordAudit } from "@/server/core/audit";
import { getSetting } from "@/server/core/settings";
import { effectiveEmployeeStatus, loadActiveEmployee, rolePermissionSet, type AdminPrincipal } from "@/server/core/auth/principal";
import { needsRehash, hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/core/auth/password";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, epochSeconds, newRefreshToken, sha256, signAccessToken } from "@/server/core/auth/tokens";
import { decryptTotpSecret, verifyTotp } from "@/server/core/auth/totp";
import type { RequestMeta } from "@/server/core/http/request-context";
import { getEmployee } from "@/server/modules/team/service";

export const MAX_ATTEMPTS_PER_EMAIL = 6;
export const MAX_ATTEMPTS_PER_IP = 18;
export const LOGIN_WINDOW_MINUTES = 15;

const invalid = () => new AppError("UNAUTHENTICATED", "Identifiants invalides.");

async function logLogin(database: Db, input: { email: string; employeeId?: string | null; succeeded: boolean; reason?: string; meta: RequestMeta }) {
  await database.insert(employeeLoginEvents).values({
    emailAttempted: input.email.slice(0, 190), employeeId: input.employeeId ?? null, succeeded: input.succeeded,
    ipAddress: input.meta.ip, userAgent: input.meta.userAgent, failureReason: input.reason ?? null,
  });
}

async function issueTokens(database: Db, employee: { id: string; passwordChangedAt: Date; mustChangePassword: boolean }, familyId: string, meta: RequestMeta, previousSessionId?: string) {
  const refresh = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const [session] = await database.insert(employeeSessions).values({
    employeeId: employee.id, tokenHash: refresh.hash, expiresAt, familyId, ipAddress: meta.ip, userAgent: meta.userAgent,
  }).returning({ id: employeeSessions.id });
  if (previousSessionId) await database.update(employeeSessions).set({ revokedAt: new Date(), revokedReason: "rotated", replacedBySessionId: session.id }).where(eq(employeeSessions.id, previousSessionId));
  return {
    accessToken: signAccessToken({ sub: employee.id, pwd: epochSeconds(employee.passwordChangedAt), sid: familyId }),
    refreshToken: refresh.token,
    tokenType: "Bearer" as const,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    mustChangePassword: employee.mustChangePassword,
    employee: await getEmployee(database, employee.id),
  };
}

export async function login(database: Db, input: { email: string; password: string; totpCode?: string }, meta: RequestMeta) {
  const email = input.email.toLowerCase();
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
  const [byEmail] = await database.select({ value: count() }).from(employeeLoginEvents).where(and(eq(employeeLoginEvents.emailAttempted, email), eq(employeeLoginEvents.succeeded, false), gte(employeeLoginEvents.createdAt, since)));
  const [byIp] = meta.ip ? await database.select({ value: count() }).from(employeeLoginEvents).where(and(eq(employeeLoginEvents.ipAddress, meta.ip), eq(employeeLoginEvents.succeeded, false), gte(employeeLoginEvents.createdAt, since))) : [{ value: 0 }];
  if (Number(byEmail?.value ?? 0) >= MAX_ATTEMPTS_PER_EMAIL || Number(byIp?.value ?? 0) >= MAX_ATTEMPTS_PER_IP) {
    await logLogin(database, { email, succeeded: false, reason: "rate_limited", meta });
    throw errors.rateLimited(LOGIN_WINDOW_MINUTES * 60);
  }

  const [employee] = await database.select().from(employees).where(and(eq(employees.email, email), isNull(employees.deletedAt))).limit(1);
  if (!employee) {
    await verifyAgainstDummy(input.password);
    await logLogin(database, { email, succeeded: false, reason: "invalid_credentials", meta });
    throw invalid();
  }
  const status = effectiveEmployeeStatus(employee.status, employee.lockedUntil);
  const passwordOk = await verifyPassword(input.password, employee.passwordHash);
  if (status !== "active" || !passwordOk) {
    if (status === "active") {
      const failures = employee.failedLoginCount + 1;
      const lock = failures >= MAX_ATTEMPTS_PER_EMAIL;
      await database.update(employees).set({ failedLoginCount: failures, status: lock ? "locked" : "active", lockedUntil: lock ? new Date(Date.now() + LOGIN_WINDOW_MINUTES * 60_000) : null }).where(eq(employees.id, employee.id));
    }
    await logLogin(database, { email, employeeId: employee.id, succeeded: false, reason: status === "active" ? "invalid_credentials" : `status_${status}`, meta });
    throw invalid();
  }
  if (employee.totpEnabled) {
    let totpOk = false;
    try {
      totpOk = Boolean(input.totpCode && employee.totpSecretEncrypted && verifyTotp(decryptTotpSecret(employee.totpSecretEncrypted), input.totpCode));
    } catch {
      totpOk = false;
    }
    if (!totpOk) {
      await database.update(employees).set({ failedLoginCount: employee.failedLoginCount + 1 }).where(eq(employees.id, employee.id));
      await logLogin(database, { email, employeeId: employee.id, succeeded: false, reason: input.totpCode ? "invalid_totp" : "totp_required", meta });
      throw new AppError("UNAUTHENTICATED", input.totpCode ? "Code de double authentification invalide." : "Code de double authentification requis.", { totpRequired: true });
    }
  } else if (await getSetting(database, DEFAULT_SHOP_ID, "security.require_admin_2fa")) {
    await logLogin(database, { email, employeeId: employee.id, succeeded: false, reason: "totp_not_enrolled", meta });
    throw errors.rule("La double authentification est obligatoire : activez-la depuis le back-office avant d'utiliser l'API.");
  }

  // Migration transparente des anciens hashes bcrypt vers argon2id.
  const rehash = needsRehash(employee.passwordHash) ? await hashPassword(input.password) : null;
  const now = new Date();
  await database.update(employees).set({ failedLoginCount: 0, lockedUntil: null, status: "active", lastLoginAt: now, lastActivityAt: now, ...(rehash ? { passwordHash: rehash } : {}) }).where(eq(employees.id, employee.id));
  await logLogin(database, { email, employeeId: employee.id, succeeded: true, meta });
  return issueTokens(database, employee, randomUUID(), meta);
}

export async function refresh(database: Db, input: { refreshToken: string }, meta: RequestMeta) {
  const tokenHash = sha256(input.refreshToken);
  const [session] = await database.select().from(employeeSessions).where(eq(employeeSessions.tokenHash, tokenHash)).limit(1);
  if (!session) throw errors.unauthenticated("Session inconnue : reconnectez-vous.");
  if (session.revokedAt) {
    if (session.revokedReason === "rotated" && session.familyId) {
      // Réutilisation d'un jeton déjà échangé : on coupe toute la famille.
      await database.update(employeeSessions).set({ revokedAt: new Date(), revokedReason: "reuse_detected" }).where(and(eq(employeeSessions.familyId, session.familyId), isNull(employeeSessions.revokedAt)));
      await database.insert(employeeSecurityEvents).values({ employeeId: session.employeeId, eventType: "refresh_token_reuse", ipAddress: meta.ip, userAgent: meta.userAgent });
      logger.warn("auth.refresh_reuse_detected", { employeeId: session.employeeId, familyId: session.familyId, requestId: meta.requestId });
    }
    throw errors.unauthenticated("Session terminée : reconnectez-vous.");
  }
  if (session.expiresAt.getTime() <= Date.now()) throw errors.unauthenticated("Session expirée : reconnectez-vous.");
  const employee = await loadActiveEmployee(database, session.employeeId);
  if (!employee) {
    await database.update(employeeSessions).set({ revokedAt: new Date(), revokedReason: "inactive" }).where(eq(employeeSessions.id, session.id));
    throw errors.unauthenticated("Compte employé inactif.");
  }
  await database.update(employees).set({ lastActivityAt: new Date() }).where(eq(employees.id, employee.id));
  return issueTokens(database, employee, session.familyId ?? session.id, meta, session.id);
}

export async function logout(database: Db, principal: AdminPrincipal, meta: RequestMeta) {
  if (principal.kind !== "employee" || !principal.employeeId) return;
  if (principal.sessionId) {
    await database.update(employeeSessions).set({ revokedAt: new Date(), revokedReason: "logout" }).where(and(eq(employeeSessions.familyId, principal.sessionId), isNull(employeeSessions.revokedAt)));
  }
  await recordAudit(database, { action: "auth.logout", entityType: "employee", entityId: principal.employeeId, actor: principal, meta });
}

export async function me(database: Db, principal: AdminPrincipal) {
  const permissions = principal.kind === "employee" && principal.employeeId
    ? [...(await rolePermissionSet(database, (await loadActiveEmployee(database, principal.employeeId))!.roleId)).codes]
    : [...principal.permissions];
  return {
    kind: principal.kind,
    employee: principal.kind === "employee" && principal.employeeId ? await getEmployee(database, principal.employeeId) : null,
    label: principal.label,
    roleCode: principal.roleCode,
    shopId: principal.shopId,
    permissions: permissions.sort(),
  };
}
