import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { employeeSessions, employees } from "@/lib/db/schema";
import { decryptTotpSecret, verifyTotp } from "@/server/core/auth/totp";
import { needsRehash, hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/core/auth/password";
import { sha256 } from "@/server/core/auth/tokens";
import { db as serviceDb } from "@/server/core/db";
import { clientIp } from "@/server/core/http/request-context";
import { enforceRateLimit } from "@/server/core/rate-limit";

/**
 * Connexion de l'administration (une seule personne). Cookie de session aléatoire, httpOnly, SameSite strict ;
 * seul son empreinte est enregistrée en base (employee_sessions). Verrouillage après 5 échecs.
 */
export const ADMIN_COOKIE = "mbm_gestion";
const SESSION_HOURS = 8;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export type AdminUser = { id: string; email: string; name: string };

export async function signInAdmin(email: string, password: string, code: string): Promise<{ error?: string }> {
  const generic = "Identifiant ou mot de passe incorrect.";
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders) ?? "unknown";
  try { await enforceRateLimit(serviceDb, "auth.login", `gestion:${ip}`); } catch { return { error: "Trop de tentatives. Réessayez dans quelques minutes." }; }
  const db = getDb();
  const [employee] = await db.select().from(employees).where(and(eq(employees.email, email.trim().toLowerCase()), isNull(employees.deletedAt))).limit(1);
  if (!employee || employee.status === "disabled" || employee.status === "invited") { await verifyAgainstDummy(password); return { error: generic }; }
  if (employee.lockedUntil && employee.lockedUntil.getTime() > Date.now()) return { error: "Compte verrouillé quelques minutes après des erreurs répétées. Réessayez plus tard." };
  if (!(await verifyPassword(password, employee.passwordHash))) {
    const failures = employee.failedLoginCount + 1;
    await db.update(employees).set(failures >= MAX_FAILURES ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failures }).where(eq(employees.id, employee.id));
    return { error: generic };
  }
  if (employee.totpEnabled && employee.totpSecretEncrypted) {
    let valid = false;
    try { valid = verifyTotp(decryptTotpSecret(employee.totpSecretEncrypted), code.trim()); } catch { valid = false; }
    if (!valid) return { error: code.trim() ? "Code de vérification incorrect." : "Saisissez le code de votre application d'authentification." };
  }
  const token = randomBytes(32).toString("base64url");
  await db.insert(employeeSessions).values({ employeeId: employee.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000), ipAddress: ip.slice(0, 45), userAgent: (requestHeaders.get("user-agent") ?? "").slice(0, 500) });
  await db.update(employees).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), ...(needsRehash(employee.passwordHash) ? { passwordHash: await hashPassword(password) } : {}) }).where(eq(employees.id, employee.id));
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_HOURS * 3600 });
  return {};
}

export async function currentAdmin(): Promise<AdminUser | null> {
  if (!process.env.DATABASE_URL) return null;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || token.length < 20) return null;
  try {
    const db = getDb();
    const [row] = await db.select({ id: employees.id, email: employees.email, first: employees.firstName, last: employees.lastName, status: employees.status, deleted: employees.deletedAt })
      .from(employeeSessions).innerJoin(employees, eq(employees.id, employeeSessions.employeeId))
      .where(and(eq(employeeSessions.tokenHash, sha256(token)), isNull(employeeSessions.revokedAt), gt(employeeSessions.expiresAt, new Date()))).limit(1);
    if (!row || row.status !== "active" || row.deleted) return null;
    return { id: row.id, email: row.email, name: `${row.first} ${row.last}`.trim() };
  } catch { return null; }
}

/** À appeler en tête de chaque page et de chaque action de l'administration. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) redirect("/gestion/connexion");
  return admin;
}

export async function signOutAdmin() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await getDb().update(employeeSessions).set({ revokedAt: new Date(), revokedReason: "logout" }).where(eq(employeeSessions.tokenHash, sha256(token)));
  store.delete(ADMIN_COOKIE);
}
