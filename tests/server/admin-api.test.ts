/**
 * Tests d'intégration de l'API d'administration sur PostgreSQL réel (PGlite) :
 * authentification, rotation des jetons, permissions, équipe, clés d'API, paramètres,
 * audit, idempotence, limites de débit, événements et modules, OpenAPI.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { domainEvents, employeeAuditLogs, employees, employeeSessions, modules as modulesTable } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { dispatchPendingEvents } from "@/server/core/events";
import { clearModuleCache } from "@/server/core/modules";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

let db: Db;
let adminToken: string;
let adminId: string;

beforeAll(async () => {
  ({ db } = await createTestDatabase());
  const admin = await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  adminId = admin.id;
  adminToken = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
});

describe("authentification", () => {
  it("refuse un mot de passe faux avec une erreur uniforme", async () => {
    const response = await api("POST", "/admin/auth/login", { body: { email: ADMIN_EMAIL, password: "mauvais-mot-de-passe" }, ip: "198.51.100.1" });
    expect(response.status).toBe(401);
    expect(response.json.error).toMatchObject({ code: "UNAUTHENTICATED", message: "Identifiants invalides." });
    expect(response.json.error.requestId).toBeTruthy();
  });

  it("répond pareil pour un compte inexistant (pas d'énumération)", async () => {
    const response = await api("POST", "/admin/auth/login", { body: { email: "inconnu@mybigmarket.test", password: "peu-importe-123" }, ip: "198.51.100.2" });
    expect(response.status).toBe(401);
    expect(response.json.error.message).toBe("Identifiants invalides.");
  });

  it("exige un jeton sur les routes admin", async () => {
    expect((await api("GET", "/admin/employees")).status).toBe(401);
    expect((await api("GET", "/admin/employees", { token: "abc.def.ghi" })).status).toBe(401);
  });

  it("migre un ancien hash bcrypt vers argon2id à la connexion", async () => {
    const legacy = await createEmployeeRow(db, { email: "legacy@mybigmarket.test", password: "", passwordHash: await bcrypt.hash("Legacy-Password-2026", 4), roleCode: "read_only" });
    await loginAs("legacy@mybigmarket.test", "Legacy-Password-2026", "198.51.100.3");
    const [row] = await db.select({ hash: employees.passwordHash }).from(employees).where(eq(employees.id, legacy.id));
    expect(row.hash.startsWith("$argon2id$")).toBe(true);
    await loginAs("legacy@mybigmarket.test", "Legacy-Password-2026", "198.51.100.3");
  });

  it("verrouille le compte après 6 échecs", async () => {
    await createEmployeeRow(db, { email: "victime@mybigmarket.test", password: "Victime-Password-2026", roleCode: "read_only" });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) statuses.push((await api("POST", "/admin/auth/login", { body: { email: "victime@mybigmarket.test", password: `faux-${attempt}-xxxx` }, ip: `192.0.2.${attempt}` })).status);
    expect(statuses.slice(0, 6).every((status) => status === 401)).toBe(true);
    expect(statuses[6]).toBe(429);
    const good = await api("POST", "/admin/auth/login", { body: { email: "victime@mybigmarket.test", password: "Victime-Password-2026" }, ip: "192.0.2.50" });
    expect(good.status).toBe(429);
  });

  it("fait tourner le jeton de rafraîchissement et détecte sa réutilisation", async () => {
    const first = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD, "198.51.100.4");
    const rotated = await api("POST", "/admin/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(rotated.status).toBe(200);
    expect(rotated.json.data.refreshToken).not.toBe(first.refreshToken);
    expect((await api("GET", "/admin/me", { token: rotated.json.data.accessToken })).status).toBe(200);

    // Réutilisation de l'ancien jeton : la famille entière est révoquée.
    const reuse = await api("POST", "/admin/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(reuse.status).toBe(401);
    expect((await api("POST", "/admin/auth/refresh", { body: { refreshToken: rotated.json.data.refreshToken } })).status).toBe(401);
    expect((await api("GET", "/admin/me", { token: rotated.json.data.accessToken })).status).toBe(401);
    const revoked = await db.select().from(employeeSessions).where(eq(employeeSessions.revokedReason, "reuse_detected"));
    expect(revoked.length).toBeGreaterThan(0);
  });

  it("la déconnexion révoque la session", async () => {
    const session = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD, "198.51.100.5");
    expect((await api("POST", "/admin/auth/logout", { token: session.accessToken })).status).toBe(204);
    expect((await api("GET", "/admin/me", { token: session.accessToken })).status).toBe(401);
  });
});

describe("équipe et permissions", () => {
  it("liste avec pagination, tri, filtre et recherche standardisés", async () => {
    const response = await api("GET", "/admin/employees?limit=2&sort=email&filter[status]=active&q=mybigmarket", { token: adminToken });
    expect(response.status).toBe(200);
    expect(response.json.meta).toMatchObject({ page: 1, limit: 2, sort: "email", filters: { status: "active" } });
    expect(response.json.data.length).toBeLessThanOrEqual(2);
    expect(response.json.data[0]).not.toHaveProperty("passwordHash");
    const bad = await api("GET", "/admin/employees?sort=passwordHash", { token: adminToken });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("VALIDATION_ERROR");
  });

  it("crée un employé avec mot de passe temporaire, journalise et émet l'événement", async () => {
    const created = await api("POST", "/admin/employees", { token: adminToken, body: { email: "logistique@mybigmarket.test", firstName: "Awa", lastName: "Koné", roleCode: "logistician" } });
    expect(created.status).toBe(201);
    expect(created.json.data.temporaryPassword).toHaveLength(20);
    expect(created.json.data.employee).toMatchObject({ email: "logistique@mybigmarket.test", roleCode: "logistician", mustChangePassword: true });
    const [audit] = await db.select().from(employeeAuditLogs).where(and(eq(employeeAuditLogs.action, "employee.created"), eq(employeeAuditLogs.entityId, created.json.data.employee.id)));
    expect(audit).toMatchObject({ actorEmployeeId: adminId, actorType: "employee", afterState: { email: "logistique@mybigmarket.test", roleCode: "logistician" } });
    const events = await db.select().from(domainEvents).where(and(eq(domainEvents.name, "employee.created"), eq(domainEvents.aggregateId, created.json.data.employee.id)));
    expect(events).toHaveLength(1);

    const duplicate = await api("POST", "/admin/employees", { token: adminToken, body: { email: "logistique@mybigmarket.test", firstName: "A", lastName: "B", roleCode: "logistician" } });
    expect(duplicate.status).toBe(409);
  });

  it("refuse les écritures à un employé en lecture seule (403) mais autorise la lecture", async () => {
    await createEmployeeRow(db, { email: "lecteur@mybigmarket.test", password: "Lecteur-Password-2026", roleCode: "read_only" });
    const reader = await loginAs("lecteur@mybigmarket.test", "Lecteur-Password-2026", "198.51.100.6");
    expect((await api("GET", "/admin/employees", { token: reader.accessToken })).status).toBe(200);
    const write = await api("POST", "/admin/employees", { token: reader.accessToken, body: { email: "x@mybigmarket.test", firstName: "X", lastName: "Y", roleCode: "read_only" } });
    expect(write.status).toBe(403);
    expect(write.json.error).toMatchObject({ code: "FORBIDDEN", details: { permission: "employees.create" } });
    expect((await api("PATCH", "/admin/settings", { token: reader.accessToken, body: { values: { "store.name": "Piratée" } } })).status).toBe(403);
  });

  it("protège son propre compte et le dernier SuperAdmin", async () => {
    const self = await api("PATCH", `/admin/employees/${adminId}`, { token: adminToken, body: { status: "disabled" } });
    expect(self.status).toBe(422);
    expect((await api("DELETE", `/admin/employees/${adminId}`, { token: adminToken })).status).toBe(422);
    const other = await createEmployeeRow(db, { email: "second-admin@mybigmarket.test", password: "Second-Admin-Password-2026", roleCode: "super_admin" });
    const secondToken = (await loginAs("second-admin@mybigmarket.test", "Second-Admin-Password-2026", "198.51.100.7")).accessToken;
    expect((await api("DELETE", `/admin/employees/${other.id}`, { token: adminToken })).status).toBe(204);
    // Le compte supprimé ne peut plus appeler l'API.
    expect((await api("GET", "/admin/me", { token: secondToken })).status).toBe(401);
    // Il ne reste qu'un SuperAdmin actif : impossible de le rétrograder, même par un autre SuperAdmin.
    expect((await api("GET", `/admin/employees/${other.id}`, { token: adminToken })).status).toBe(404);
  });

  it("matrice : un rôle personnalisé accorde exactement ses permissions", async () => {
    const role = await api("POST", "/admin/roles", { token: adminToken, body: { code: "stock_viewer", name: "Consultation stock", permissions: ["catalog.stock.read"] } });
    expect(role.status).toBe(201);
    expect(role.json.data.permissions).toEqual(["catalog.stock.read"]);
    const unknown = await api("POST", "/admin/roles", { token: adminToken, body: { code: "bad_role", name: "Bad", permissions: ["inexistant.read"] } });
    expect(unknown.status).toBe(400);
    const superAdmin = (await api("GET", "/admin/roles", { token: adminToken })).json.data.find((entry: { code: string }) => entry.code === "super_admin");
    expect((await api("PATCH", `/admin/roles/${superAdmin.id}`, { token: adminToken, body: { permissions: [] } })).status).toBe(422);
    const matrix = await api("GET", "/admin/permissions", { token: adminToken });
    expect(matrix.json.data.find((entry: { resource: string }) => entry.resource === "employees").actions.map((action: { action: string }) => action.action)).toEqual(["read", "create", "update", "delete", "manage"]);
  });
});

describe("clés d'API", () => {
  it("crée une clé limitée à ses portées, sans escalade possible", async () => {
    const created = await api("POST", "/admin/api-keys", { token: adminToken, body: { label: "ERP", scopes: ["employees.read"] } });
    expect(created.status).toBe(201);
    const secret = created.json.data.secret as string;
    expect(secret).toMatch(/^mbm_/);
    expect((await api("GET", "/admin/employees", { token: secret })).status).toBe(200);
    expect((await api("GET", "/admin/settings", { token: secret })).status).toBe(403);
    expect((await api("DELETE", `/admin/api-keys/${created.json.data.apiKey.id}`, { token: adminToken })).status).toBe(204);
    expect((await api("GET", "/admin/employees", { token: secret })).status).toBe(401);

    await createEmployeeRow(db, { email: "support@mybigmarket.test", password: "Support-Password-2026", roleCode: "customer_service" });
    const support = await loginAs("support@mybigmarket.test", "Support-Password-2026", "198.51.100.8");
    // Un rôle sans apiKeys.create ne peut pas créer de clé du tout.
    expect((await api("POST", "/admin/api-keys", { token: support.accessToken, body: { label: "x", scopes: ["employees.manage"] } })).status).toBe(403);
  });
});

describe("paramètres typés", () => {
  it("valide, enregistre par boutique, journalise avant/après et expose les valeurs publiques", async () => {
    const invalid = await api("PATCH", "/admin/settings", { token: adminToken, body: { values: { "store.name": "Ma boutique", "orders.return_window_days": -3 } } });
    expect(invalid.status).toBe(400);
    const updated = await api("PATCH", "/admin/settings", { token: adminToken, body: { values: { "store.name": "Boutique Abidjan", "orders.return_window_days": 30 } } });
    expect(updated.status).toBe(200);
    expect(updated.json.data.map((view: { key: string; value: unknown }) => [view.key, view.value])).toEqual([["store.name", "Boutique Abidjan"], ["orders.return_window_days", 30]]);
    const [audit] = await db.select().from(employeeAuditLogs).where(eq(employeeAuditLogs.action, "settings.updated"));
    expect(audit.changedFields).toEqual(["orders.return_window_days", "store.name"]);
    const publicView = await api("GET", "/shop/settings");
    expect(publicView.status).toBe(200);
    expect(publicView.json.data.settings["store.name"]).toBe("Boutique Abidjan");
    expect(publicView.json.data.settings).not.toHaveProperty("orders.payment_expiry_minutes");
  });
});

describe("idempotence", () => {
  it("rejoue la même réponse sans second effet, et refuse une clé réutilisée pour une autre requête", async () => {
    const body = { email: "idempotent@mybigmarket.test", firstName: "Ida", lastName: "Potent", roleCode: "read_only", password: "Replay-Safe-Password-2026" };
    const headers = { "idempotency-key": "create-employee-0001" };
    const first = await api("POST", "/admin/employees", { token: adminToken, body, headers });
    const second = await api("POST", "/admin/employees", { token: adminToken, body, headers });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(second.json).toEqual(first.json);
    const rows = await db.select().from(employees).where(eq(employees.email, "idempotent@mybigmarket.test"));
    expect(rows).toHaveLength(1);
    const reused = await api("POST", "/admin/employees", { token: adminToken, body: { ...body, email: "autre@mybigmarket.test" }, headers });
    expect(reused.status).toBe(422);
    expect(reused.json.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("événements et modules", () => {
  it("un module activé reçoit les événements après le commit, signés", async () => {
    const received: Array<{ url: string; headers: Headers; body: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      received.push({ url: String(url), headers: new Headers(init.headers), body: String(init.body) });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      await dispatchPendingEvents(db, { limit: 500 });
      const configured = await api("PATCH", "/admin/modules/outgoing-webhooks", { token: adminToken, body: { isActive: true, config: { endpoints: [{ url: "https://erp.example/hooks", secret: "un-secret-de-signature", events: ["employee.*"] }] } } });
      expect(configured.status).toBe(200);
      expect(configured.json.data.config.endpoints[0].secret).toBe("••••••");
      // Renvoyer la configuration masquée ne remplace pas le vrai secret.
      await api("PATCH", "/admin/modules/outgoing-webhooks", { token: adminToken, body: { config: configured.json.data.config } });
      const [stored] = await db.select().from(modulesTable).where(eq(modulesTable.code, "outgoing-webhooks"));
      expect((stored.config as { endpoints: Array<{ secret: string }> }).endpoints[0].secret).toBe("un-secret-de-signature");

      clearModuleCache();
      await api("POST", "/admin/employees", { token: adminToken, body: { email: "webhook@mybigmarket.test", firstName: "Web", lastName: "Hook", roleCode: "read_only", password: "Signed-Events-Password-2026" } });
      const result = await dispatchPendingEvents(db, { limit: 500 });
      expect(result.failed).toBe(0);
      const delivery = received.find((entry) => entry.headers.get("x-mbm-event") === "employee.created");
      expect(delivery?.url).toBe("https://erp.example/hooks");
      expect(delivery?.headers.get("x-mbm-signature")).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(JSON.parse(delivery!.body).payload.email).toBe("webhook@mybigmarket.test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("un abonné en échec est retenté puis isolé, sans jamais bloquer la requête", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    try {
      const response = await api("PATCH", "/admin/settings", { token: adminToken, body: { values: { "store.phone": "+225 07 00 00 00 00" } } });
      expect(response.status).toBe(200);
      await api("PATCH", "/admin/modules/outgoing-webhooks", { token: adminToken, body: { config: { endpoints: [{ url: "https://erp.example/hooks", secret: "un-secret-de-signature", events: ["settings.updated"] }] } } });
      clearModuleCache();
      await api("PATCH", "/admin/settings", { token: adminToken, body: { values: { "store.phone": "+225 07 11 11 11 11" } } });
      const result = await dispatchPendingEvents(db, { limit: 500 });
      expect(result.failed).toBeGreaterThan(0);
      const [failed] = await db.select().from(domainEvents).where(and(eq(domainEvents.name, "settings.updated"), eq(domainEvents.status, "pending"))).limit(1);
      expect(failed.lastError).toContain("503");
      expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("contrat HTTP", () => {
  it("404, 405 et validation au format uniforme", async () => {
    expect((await api("GET", "/admin/inexistant", { token: adminToken })).json.error.code).toBe("NOT_FOUND");
    const notAllowed = await api("PUT", "/admin/employees", { token: adminToken });
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.headers.get("allow")).toContain("GET");
    const invalid = await api("POST", "/admin/employees", { token: adminToken, body: { email: "pas-un-email", firstName: "", roleCode: "?" } });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.details.map((issue: { path: string }) => issue.path)).toEqual(expect.arrayContaining(["body.email", "body.firstName"]));
  });

  it("publie une spécification OpenAPI 3.1 cohérente avec les routes", async () => {
    const response = await api("GET", "/openapi.json");
    expect(response.status).toBe(200);
    expect(response.json.openapi).toBe("3.1.0");
    expect(response.json.paths["/api/v1/admin/employees"].get["x-permission"]).toBe("employees.read");
    expect(response.json.paths["/api/v1/admin/employees/{id}"].patch.requestBody).toBeTruthy();
    expect(response.json.paths["/api/v1/admin/employees"].get.parameters.map((parameter: { name: string }) => parameter.name)).toEqual(expect.arrayContaining(["page", "limit", "sort", "q", "filter[status]"]));
  });

  it("informations système sans secret", async () => {
    const response = await api("GET", "/admin/system", { token: adminToken });
    expect(response.status).toBe(200);
    expect(response.json.data.database.migrationsApplied).toBeGreaterThanOrEqual(15);
    expect(JSON.stringify(response.json)).not.toContain(process.env.ADMIN_API_JWT_SECRET!);
  });
});
