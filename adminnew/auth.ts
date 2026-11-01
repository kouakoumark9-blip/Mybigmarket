import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { getAdminDb } from "@/lib/db";
import { employeeLoginEvents, employees, permissions, roles, rolePermissions } from "@/lib/db/schema";
import { effectiveEmployeeStatus } from "@/lib/employee-status";
import { decryptTotpSecret, verifyTotp } from "@/lib/totp";

const loginSchema = z.object({
  email: z.string().trim().email().max(190),
  password: z.string().min(1).max(200),
  totpCode: z.string().trim().max(12).optional(),
});

let dummyPasswordHash: Promise<string> | undefined;
const MAX_ATTEMPTS_PER_EMAIL = 6;
const MAX_ATTEMPTS_PER_IP = 18;
const RATE_WINDOW_MINUTES = 15;

function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  const value = forwarded || real;
  return value && value.length <= 45 ? value : null;
}

async function logFailure({ email, employeeId, ip, userAgent, reason }: { email: string; employeeId?: string; ip: string | null; userAgent: string | null; reason: string }) {
  const db = getAdminDb();
  await db.insert(employeeLoginEvents).values({
    emailAttempted: email.slice(0, 190),
    employeeId,
    succeeded: false,
    ipAddress: ip,
    userAgent: userAgent?.slice(0, 500) || null,
    failureReason: reason,
  });
}

async function authorize(credentials: Partial<Record<string, unknown>>, request: Request) {
  const parsed = loginSchema.safeParse(credentials);
  const emailCandidate = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase().slice(0, 190) : "invalid";
  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent");
  if (!parsed.success) {
    await logFailure({ email: emailCandidate, ip, userAgent, reason: "invalid_credentials_shape" });
    return null;
  }
  const email = parsed.data.email.toLowerCase();
  const db = getAdminDb();
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000);
  const [emailAttempts] = await db.select({ value: count() }).from(employeeLoginEvents).where(and(eq(employeeLoginEvents.emailAttempted, email), eq(employeeLoginEvents.succeeded, false), gte(employeeLoginEvents.createdAt, since)));
  const [ipAttempts] = ip ? await db.select({ value: count() }).from(employeeLoginEvents).where(and(eq(employeeLoginEvents.ipAddress, ip), eq(employeeLoginEvents.succeeded, false), gte(employeeLoginEvents.createdAt, since))) : [{ value: 0 }];
  if (Number(emailAttempts?.value || 0) >= MAX_ATTEMPTS_PER_EMAIL || Number(ipAttempts?.value || 0) >= MAX_ATTEMPTS_PER_IP) {
    await logFailure({ email, ip, userAgent, reason: "rate_limited" });
    return null;
  }

  const [employee] = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
  const hash = employee?.passwordHash || await (dummyPasswordHash ||= bcrypt.hash("invalid-login-timing-pad", 12));
  const passwordMatches = await bcrypt.compare(parsed.data.password, hash);
  const now = new Date();
  const status = employee ? effectiveEmployeeStatus(employee.status, employee.lockedUntil, now) : "disabled";
  if (!employee || status !== "active" || !passwordMatches) {
    const failureCount = employee ? employee.failedLoginCount + 1 : 0;
    if (employee && status === "active") {
      const shouldLock = failureCount >= MAX_ATTEMPTS_PER_EMAIL;
      await db.update(employees).set({
        failedLoginCount: failureCount,
        status: shouldLock ? "locked" : "active",
        lockedUntil: shouldLock ? new Date(Date.now() + RATE_WINDOW_MINUTES * 60_000) : null,
      }).where(eq(employees.id, employee.id));
    }
    await logFailure({ email, employeeId: employee?.id, ip, userAgent, reason: "invalid_credentials" });
    return null;
  }

  if (employee.totpEnabled) {
    try {
      if (!parsed.data.totpCode || !employee.totpSecretEncrypted || !verifyTotp(decryptTotpSecret(employee.totpSecretEncrypted), parsed.data.totpCode)) {
        await db.update(employees).set({ failedLoginCount: employee.failedLoginCount + 1 }).where(eq(employees.id, employee.id));
        await logFailure({ email, employeeId: employee.id, ip, userAgent, reason: "invalid_totp" });
        return null;
      }
    } catch {
      await logFailure({ email, employeeId: employee.id, ip, userAgent, reason: "totp_configuration_error" });
      return null;
    }
  }

  const [role] = await db.select({ code: roles.code }).from(roles).where(eq(roles.id, employee.roleId)).limit(1);
  if (!role) {
    await logFailure({ email, employeeId: employee.id, ip, userAgent, reason: "missing_role" });
    return null;
  }
  const permissionRows = await db.select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, employee.roleId));
  await db.update(employees).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, lastActivityAt: now }).where(eq(employees.id, employee.id));
  await db.insert(employeeLoginEvents).values({ emailAttempted: email, employeeId: employee.id, succeeded: true, ipAddress: ip, userAgent: userAgent?.slice(0, 500) || null });

  return {
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    email: employee.email,
    roleCode: role.code,
    permissions: permissionRows.map((row) => row.code),
    passwordChangedAt: employee.passwordChangedAt.toISOString(),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Credentials({
    credentials: {
      email: { label: "Adresse e-mail", type: "email" },
      password: { label: "Mot de passe", type: "password" },
      totpCode: { label: "Code de vérification", type: "text" },
    },
    authorize,
  })],
});
