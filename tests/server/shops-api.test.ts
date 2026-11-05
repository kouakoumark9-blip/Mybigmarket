/**
 * Multi-boutique de bout en bout (PGlite) : création d'une boutique (paramètres recopiés),
 * contexte par en-tête X-Shop-Code ou par domaine, paramètres et tickets propres à chaque
 * boutique, accès des employés (attribution, SuperAdmin), boutique par défaut protégée.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { clearShopCache } from "@/server/core/shop";
import { clearRoleCache } from "@/server/core/auth/principal";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

let db: Db;
let token: string;
let supportToken: string;
let supportEmployeeId: string;
let proShopId: string;
const PRO = { "x-shop-code": "ci-pro" };
const admin = (method: string, path: string, options: { body?: unknown; headers?: Record<string, string>; bearer?: string } = {}) =>
  api(method, path, { token: options.bearer ?? token, body: options.body, headers: options.headers });
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;

beforeAll(async () => {
  resetLedgerReadiness();
  clearShopCache();
  clearRoleCache();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await createEmployeeRow(db, { email: "support@mybigmarket.test", password: ADMIN_PASSWORD, roleCode: "customer_service" });
  supportToken = (await loginAs("support@mybigmarket.test", ADMIN_PASSWORD)).accessToken;
  supportEmployeeId = (await rows<{ id: string }>(sql`select id from employees where email = 'support@mybigmarket.test'`))[0].id;
  await admin("PATCH", "/admin/settings", { body: { values: { "store.name": "mybigmarket", "store.phone": "+225 01 02 03 04" } } });
});

describe("boutiques", () => {
  it("crée une boutique en recopiant les paramètres d'une autre, avec son propre nom", async () => {
    const created = await admin("POST", "/admin/shops", { body: { code: "ci-pro", name: "MBM Pro", domain: "pro.mybigmarket.test", copySettingsFrom: "default" } });
    expect(created.status).toBe(201);
    proShopId = created.json.data.id;
    expect((await admin("POST", "/admin/shops", { body: { code: "ci-pro", name: "Doublon" } })).status).toBe(409);
    const proSettings = await admin("GET", "/admin/settings?group=store", { headers: PRO });
    const value = (key: string, list: Array<{ key: string; value: unknown }>) => list.find((entry) => entry.key === key)?.value;
    expect(value("store.name", proSettings.json.data)).toBe("MBM Pro");
    expect(value("store.phone", proSettings.json.data)).toBe("+225 01 02 03 04");
    const list = await admin("GET", "/admin/shops", { headers: PRO });
    expect(list.json.data.current).toBe("ci-pro");
    expect(list.json.data.shops.map((shop: { code: string }) => shop.code)).toEqual(["ci-pro", "default"]);
  });

  it("garde des paramètres propres à chaque boutique, choisis par en-tête ou par domaine", async () => {
    await admin("PATCH", "/admin/settings", { body: { values: { "store.phone": "+225 07 07 07 07" } }, headers: PRO });
    const byDomain = await api("GET", "/shop/settings", { headers: { host: "pro.mybigmarket.test" } });
    expect(byDomain.json.data).toMatchObject({ shop: { code: "ci-pro", name: "MBM Pro" }, settings: { "store.phone": "+225 07 07 07 07" } });
    const byDefault = await api("GET", "/shop/settings");
    expect(byDefault.json.data).toMatchObject({ shop: { code: "default" }, settings: { "store.phone": "+225 01 02 03 04" } });
    expect((await admin("GET", "/admin/settings", { headers: { "x-shop-code": "inconnue" } })).status).toBe(404);
  });

  it("isole les tickets du service client par boutique", async () => {
    const created = await api("POST", "/shop/support/tickets", { body: { subject: "Tarifs revendeur", message: "Quels sont vos tarifs pour les revendeurs ?", email: "revendeur@exemple.ci", name: "Koffi" }, headers: { host: "pro.mybigmarket.test" }, ip: "198.51.100.61" });
    expect(created.status).toBe(201);
    expect((await admin("GET", "/admin/support/tickets", { headers: PRO })).json.meta.total).toBe(1);
    expect((await admin("GET", "/admin/support/tickets")).json.meta.total).toBe(0);
    const [{ shop_id }] = await rows<{ shop_id: string }>(sql`select shop_id from support_tickets where email = 'revendeur@exemple.ci'`);
    expect(shop_id).toBe(proShopId);
  });

  it("limite chaque employé à ses boutiques attribuées, le SuperAdmin voyant tout", async () => {
    // Sans attribution : boutique par défaut seulement.
    expect((await admin("GET", "/admin/support/tickets", { bearer: supportToken })).status).toBe(200);
    const denied = await admin("GET", "/admin/support/tickets", { bearer: supportToken, headers: PRO });
    expect(denied.status).toBe(403);
    expect(denied.json.error.message).toContain("ci-pro");
    // Attribué à la boutique Pro uniquement : Pro autorisée, défaut refusée.
    const assigned = await admin("PUT", `/admin/shops/${proShopId}/employees`, { body: { employeeIds: [supportEmployeeId] } });
    expect(assigned.json.data).toEqual([expect.objectContaining({ email: "support@mybigmarket.test" })]);
    expect((await admin("GET", "/admin/support/tickets", { bearer: supportToken, headers: PRO })).json.meta.total).toBe(1);
    expect((await admin("GET", "/admin/support/tickets", { bearer: supportToken })).status).toBe(403);
    // La gestion des boutiques reste réservée.
    expect((await admin("POST", "/admin/shops", { bearer: supportToken, headers: PRO, body: { code: "autre", name: "Autre" } })).status).toBe(403);
    const audit = await rows<{ action: string }>(sql`select action from employee_audit_logs where action like 'shop.%' order by created_at`);
    expect(audit.map((entry) => entry.action)).toEqual(["shop.created", "shop.employees_updated"]);
  });

  it("protège la boutique par défaut et en change proprement", async () => {
    const [{ id: defaultId }] = await rows<{ id: string }>(sql`select id from shops where code = 'default'`);
    expect((await admin("PATCH", `/admin/shops/${defaultId}`, { body: { isActive: false } })).status).toBe(422);
    const promoted = await admin("PATCH", `/admin/shops/${proShopId}`, { body: { isDefault: true } });
    expect(promoted.json.data).toMatchObject({ code: "ci-pro", isDefault: true });
    expect((await rows<{ code: string }>(sql`select code from shops where is_default`)).map((row) => row.code)).toEqual(["ci-pro"]);
    expect((await api("GET", "/shop/settings")).json.data.shop.code).toBe("ci-pro");
    await admin("PATCH", `/admin/shops/${defaultId}`, { body: { isDefault: true } });
    expect((await api("GET", "/shop/settings")).json.data.shop.code).toBe("default");
  });
});
