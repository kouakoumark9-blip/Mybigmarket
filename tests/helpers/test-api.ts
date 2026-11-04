/**
 * Banc d'essai d'intégration : PostgreSQL embarqué (PGlite) migré avec les vraies migrations,
 * et appels HTTP à travers le pipeline complet de l'API v1 (auth, permissions, validation…).
 */
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { setDbForTests, type Db } from "@/server/core/db";
import { hashPassword } from "@/server/core/auth/password";
import { clearRoleCache } from "@/server/core/auth/principal";
import { clearSettingsCache } from "@/server/core/settings";
import { clearShopCache } from "@/server/core/shop";
import { clearModuleCache } from "@/server/core/modules";
import { syncPermissionCatalog, resetPermissionCatalogSync } from "@/server/modules/team/permission-catalog";

export const ADMIN_EMAIL = "superadmin@mybigmarket.test";
export const ADMIN_PASSWORD = "Super-Admin-Password-2026";

export async function createTestDatabase(): Promise<{ db: Db; client: PGlite }> {
  process.env.ADMIN_API_JWT_SECRET = "test-secret-for-admin-api-tokens-0123456789";
  process.env.DATABASE_URL = "postgres://pglite.invalid/test";
  const client = new PGlite();
  const database = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client), { migrationsFolder: join(process.cwd(), "drizzle") });
  setDbForTests(database);
  resetPermissionCatalogSync();
  clearRoleCache();
  clearSettingsCache();
  clearShopCache();
  clearModuleCache();
  await syncPermissionCatalog(database);
  return { db: database, client };
}

export async function createEmployeeRow(database: Db, input: { email: string; password: string; roleCode: string; passwordHash?: string; totpEnabled?: boolean }) {
  const [role] = await database.select().from(schema.adminRoles).where(eq(schema.adminRoles.code, input.roleCode)).limit(1);
  if (!role) throw new Error(`Rôle absent : ${input.roleCode}`);
  const [employee] = await database.insert(schema.employees).values({
    email: input.email, firstName: "Test", lastName: input.roleCode, roleId: role.id,
    passwordHash: input.passwordHash ?? (await hashPassword(input.password)), status: "active", totpEnabled: input.totpEnabled ?? false,
  }).returning();
  return employee;
}

type CallOptions = { token?: string; body?: unknown; headers?: Record<string, string>; ip?: string };

export async function api(method: string, path: string, options: CallOptions = {}) {
  const { handleApi } = await import("@/server/api/registry");
  const url = `http://shop.test/api/v1${path}`;
  const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? "203.0.113.10", "user-agent": "vitest", ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const request = new Request(url, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const segments = new URL(url).pathname.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
  const response = await handleApi(request, segments);
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
}

export async function loginAs(email: string, password: string, ip?: string) {
  const response = await api("POST", "/admin/auth/login", { body: { email, password }, ip });
  if (response.status !== 200) throw new Error(`Connexion impossible (${response.status}) : ${JSON.stringify(response.json)}`);
  return response.json.data as { accessToken: string; refreshToken: string; mustChangePassword: boolean; employee: { id: string } };
}
