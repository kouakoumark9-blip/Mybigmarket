/**
 * Durcissement de l'API v1, vérifié au niveau HTTP (PGlite) :
 * CSRF (origine des écritures de la boutique), CORS restrictif, API admin sans cookie,
 * erreurs uniformes, limites de taille et de débit, entrées hostiles traitées comme des données.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/core/db";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

let db: Db;
let token: string;
const ticket = (email: string) => ({ subject: "Délai de livraison", message: "Bonjour, quel est le délai pour Abidjan ?", email, name: "Awa" });
const sameSite = { host: "shop.test", origin: "http://shop.test" };

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
});

beforeEach(async () => {
  await db.execute(sql`delete from rate_limit_buckets`);
});

afterEach(() => {
  delete process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.ADMIN_CORS_ALLOWED_ORIGINS;
});

describe("CSRF : écritures de la boutique", () => {
  it("refuse une écriture envoyée par un autre site, même sans client connecté", async () => {
    const forged = await api("POST", "/shop/support/tickets", { body: ticket("csrf@exemple.ci"), headers: { host: "shop.test", origin: "https://site-malveillant.example" } });
    expect(forged.status).toBe(403);
    expect(forged.json.error).toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("CSRF") });
    expect((await db.execute(sql`select 1 from support_tickets where email = 'csrf@exemple.ci'`) as unknown as { rows: unknown[] }).rows).toHaveLength(0);
  });

  it("accepte notre origine, une origine listée et les clients hors navigateur", async () => {
    expect((await api("POST", "/shop/support/tickets", { body: ticket("meme-site@exemple.ci"), headers: sameSite })).status).toBe(201);
    process.env.CORS_ALLOWED_ORIGINS = "https://app.mybigmarket.test";
    expect((await api("POST", "/shop/support/tickets", { body: ticket("app@exemple.ci"), headers: { host: "shop.test", origin: "https://app.mybigmarket.test" }, ip: "198.51.100.2" })).status).toBe(201);
    expect((await api("POST", "/shop/support/tickets", { body: ticket("mobile@exemple.ci"), ip: "198.51.100.3" })).status).toBe(201);
  });

  it("refuse une origine illisible", async () => {
    expect((await api("POST", "/shop/support/tickets", { body: ticket("x@exemple.ci"), headers: { host: "shop.test", origin: "null" } })).status).toBe(403);
  });
});

describe("CORS restrictif", () => {
  it("ne répond à aucune origine inconnue, ni en prévol ni en lecture", async () => {
    const preflight = await api("OPTIONS", "/shop/products", { headers: { origin: "https://site-malveillant.example", "access-control-request-method": "GET" } });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    const read = await api("GET", "/shop/settings", { headers: { origin: "https://site-malveillant.example" } });
    expect(read.status).toBe(200);
    expect(read.headers.get("access-control-allow-origin")).toBeNull();
    expect(read.headers.get("vary")).toContain("Origin");
  });

  it("autorise le back-office listé, sans jamais « * » ni cookies", async () => {
    process.env.ADMIN_CORS_ALLOWED_ORIGINS = "https://admin.mybigmarket.test";
    const preflight = await api("OPTIONS", "/admin/products", { headers: { origin: "https://admin.mybigmarket.test", "access-control-request-method": "GET" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://admin.mybigmarket.test");
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
    expect((await api("OPTIONS", "/admin/products", { headers: { origin: "https://autre.example", "access-control-request-method": "GET" } })).status).toBe(403);
  });
});

describe("API d'administration", () => {
  it("n'accepte que le jeton Authorization, jamais un cookie de session", async () => {
    session.current = { user: { id: "00000000-0000-0000-0000-000000000001", role: "admin", email: "admin@exemple.ci" } };
    try {
      const withCookie = await api("GET", "/admin/products", { headers: { cookie: "authjs.session-token=volé" } });
      expect(withCookie.status).toBe(401);
      expect((await api("GET", "/admin/products", { token: "jeton.invalide.signature" })).status).toBe(401);
    } finally {
      session.current = null;
    }
  });

  it("répond sans cache et avec un identifiant de requête", async () => {
    const response = await api("GET", "/admin/products", { token });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("erreurs uniformes et entrées hostiles", () => {
  it("renvoie toujours { error: { code, message, details?, requestId } }", async () => {
    const missing = await api("GET", "/shop/inexistant");
    expect(missing.status).toBe(404);
    expect(missing.json.error).toMatchObject({ code: "NOT_FOUND", message: expect.any(String) });
    const invalid = await api("POST", "/shop/support/tickets", { body: { subject: "", email: "pas-un-email" }, headers: sameSite });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.code).toBe("VALIDATION_ERROR");
    expect(invalid.json.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: expect.stringMatching(/^body\./), message: expect.any(String) })]));
    expect(invalid.json.error.requestId).toEqual(expect.any(String));
  });

  it("refuse un JSON invalide ou trop volumineux sans le traiter", async () => {
    const { handleApi } = await import("@/server/api/registry");
    const broken = await handleApi(new Request("http://shop.test/api/v1/shop/support/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: "{ pas du json" }), ["shop", "support", "tickets"]);
    expect(broken.status).toBe(400);
    const huge = await api("POST", "/shop/support/tickets", { body: { ...ticket("gros@exemple.ci"), message: "x".repeat(1_100_000) }, headers: sameSite });
    expect(huge.status).toBe(400);
    expect(huge.json.error.message).toContain("trop volumineux");
  });

  it("traite une tentative d'injection SQL comme une simple recherche", async () => {
    const attack = "'; drop table products; --";
    expect((await api("GET", `/shop/products?q=${encodeURIComponent(attack)}`)).status).toBe(200);
    expect((await api("GET", `/admin/products?q=${encodeURIComponent(attack)}&filter[status]=${encodeURIComponent("x' or '1'='1")}`, { token })).status).toBeLessThan(500);
    const [{ exists }] = (await db.execute(sql`select to_regclass('public.products') is not null as exists`) as unknown as { rows: Array<{ exists: boolean }> }).rows;
    expect(exists).toBe(true);
  });

  it("refuse un tri non prévu au lieu de l'envoyer à la base", async () => {
    const response = await api("GET", "/admin/products?sort=password_hash", { token });
    expect(response.status).toBe(400);
    expect(response.json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("limites de débit", () => {
  it("bloque la connexion après 6 échecs sur un même e-mail, avec Retry-After", async () => {
    const attempt = () => api("POST", "/admin/auth/login", { body: { email: ADMIN_EMAIL, password: "mauvais-mot-de-passe" }, ip: "198.51.100.90" });
    for (let index = 0; index < 6; index += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Même le bon mot de passe est refusé pendant le blocage.
    expect((await api("POST", "/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, ip: "198.51.100.90" })).status).toBe(429);
  });

  it("limite les formulaires publics", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) statuses.push((await api("POST", "/shop/support/tickets", { body: ticket(`flood${attempt}@exemple.ci`), headers: sameSite, ip: "198.51.100.91" })).status);
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
