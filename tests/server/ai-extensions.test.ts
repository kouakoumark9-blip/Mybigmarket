/**
 * Fonctions IA complémentaires (modèle simulé, données de démonstration) :
 * génération en masse avec validation avant enregistrement, résumé des ventes et recherche en
 * langage naturel en lecture seule, toujours dans les droits et quotas de l'employé.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { setAiProviderForTests, type AiRequest } from "@/server/modules/ai/provider";
import { DEMO_PRODUCT_SLUGS, seedDemoCommerce } from "@/server/modules/demo/seed";
import { refreshDailyStats } from "@/server/modules/stats/service";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

vi.mock("@/auth", () => ({ auth: async () => null }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

let db: Db;
let token: string;
let supportToken: string;
let productIds: string[];
const calls: AiRequest[] = [];
let searchPlan: Record<string, unknown> = {};
const admin = (method: string, path: string, body?: unknown, bearer = token) => api(method, path, { token: bearer, body });
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await seedDemoCommerce(db, { passwordHash: "!" });
  const today = new Date().toISOString().slice(0, 10);
  await refreshDailyStats(db, { from: today, to: today });
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await createEmployeeRow(db, { email: "support@mybigmarket.test", password: ADMIN_PASSWORD, roleCode: "customer_service" });
  supportToken = (await loginAs("support@mybigmarket.test", ADMIN_PASSWORD)).accessToken;
  productIds = (await rows<{ id: string }>(sql`select id from products where slug in (${DEMO_PRODUCT_SLUGS.blender}, ${DEMO_PRODUCT_SLUGS.tshirt}, ${DEMO_PRODUCT_SLUGS.pack}) order by slug`)).map((row) => row.id);
});

beforeEach(async () => {
  await db.execute(sql`delete from rate_limit_buckets`);
  calls.length = 0;
  process.env.ANTHROPIC_API_KEY = "test";
  setAiProviderForTests({
    async generate(request) {
      calls.push(request);
      const properties = request.schema.properties as Record<string, unknown>;
      const output = "headline" in properties
        ? { headline: "Ventes en hausse sur la période.", highlights: ["Le mixeur 3 vitesses mène les ventes."], concerns: [], suggestions: ["Réassortir le T-shirt noir."] }
        : "entity" in properties
          ? searchPlan
          : { title: "Titre amélioré", shortDescription: "Résumé amélioré.", description: "Description améliorée.", seoTitle: "Titre SEO", seoDescription: "Meta description améliorée pour le produit de démonstration, claire et utile.", tags: ["demo"], rationale: "Plus clair." };
      return { output, model: "modele-simule", inputTokens: 100, outputTokens: 50 };
    },
  });
});

afterEach(() => setAiProviderForTests(null));

describe("génération en masse", () => {
  it("propose pour chaque produit sans rien modifier, puis applique seulement après confirmation", async () => {
    const before = await rows<{ title: string }>(sql`select title from products where id in (${productIds[0]}, ${productIds[1]}) order by id`);
    const bulk = await admin("POST", "/admin/ai/proposals/product-content/bulk", { productIds: productIds.slice(0, 2), fields: ["title", "seoDescription"] });
    expect(bulk.status).toBe(201);
    expect(bulk.json.data).toMatchObject({ requested: 2, created: 2, failed: [] });
    expect(await rows<{ title: string }>(sql`select title from products where id in (${productIds[0]}, ${productIds[1]}) order by id`)).toEqual(before);

    const ids = bulk.json.data.proposals.map((proposal: { id: string }) => proposal.id);
    expect((await admin("POST", "/admin/ai/proposals/apply-bulk", { ids })).status).toBe(400);
    const applied = await admin("POST", "/admin/ai/proposals/apply-bulk", { ids, confirm: true, fields: ["title"] });
    expect(applied.json.data).toMatchObject({ applied: 2, failed: 0 });
    expect((await rows<{ title: string }>(sql`select title from products where id in (${productIds[0]}, ${productIds[1]})`)).map((row) => row.title)).toEqual(["Titre amélioré", "Titre amélioré"]);
    // Une seconde validation ne réapplique rien.
    expect((await admin("POST", "/admin/ai/proposals/apply-bulk", { ids, confirm: true })).json.data).toMatchObject({ applied: 0, failed: 2 });
    const audit = await rows<{ action: string }>(sql`select action from employee_audit_logs where action like 'ai.%'`);
    expect(audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(["ai.bulk_requested", "ai.proposal_created", "ai.proposal_applied"]));
  });

  it("s'arrête au quota et signale les produits non traités", async () => {
    await admin("PATCH", "/admin/settings", { values: { "ai.daily_requests_per_employee": 3 } });
    const bulk = await admin("POST", "/admin/ai/proposals/product-content/bulk", { productIds });
    expect(bulk.json.data.created).toBe(1);
    expect(bulk.json.data.failed.map((entry: { code: string }) => entry.code)).toEqual(["RATE_LIMITED", "NOT_PROCESSED"]);
    await admin("PATCH", "/admin/settings", { values: { "ai.daily_requests_per_employee": 100 } });
  });
});

describe("résumé des ventes", () => {
  it("rédige à partir des statistiques pré-calculées, sans données personnelles", async () => {
    const response = await admin("POST", "/admin/ai/sales-summary", {});
    expect(response.status).toBe(200);
    expect(response.json.data.summary.headline).toContain("Ventes");
    expect(response.json.data.figures.totals).toBeDefined();
    const prompt = calls[0].prompt;
    expect(prompt).toContain("totaux");
    expect(prompt).not.toMatch(/@demo\.mybigmarket\.local|\+225/);
  });

  it("est réservé aux employés qui voient les statistiques", async () => {
    expect((await admin("POST", "/admin/ai/sales-summary", {}, supportToken)).status).toBe(403);
  });
});

describe("recherche en langage naturel", () => {
  it("traduit la question en requête de liste et l'exécute avec les droits de l'employé", async () => {
    searchPlan = { entity: "orders", q: "", filters: [{ field: "status", operator: "eq", value: "shipped" }], sort: "-createdAt", explanation: "Commandes expédiées, les plus récentes d'abord." };
    const response = await admin("POST", "/admin/ai/search", { question: "Quelles commandes sont en route ?" });
    expect(response.status).toBe(200);
    expect(response.json.data).toMatchObject({ entity: "orders", query: expect.stringContaining("filter%5Bstatus%5D=shipped"), apiPath: expect.stringMatching(/^\/admin\/orders\?/) });
    expect(response.json.data.results.length).toBe(1);
    expect(response.json.data.results.every((order: { status: string }) => order.status === "shipped")).toBe(true);
    // Le modèle ne voit aucune donnée : seulement la description des listes et la question.
    expect(calls[0].prompt).not.toMatch(/Awa|Koffi|@demo/);
  });

  it("ne propose que les listes permises et refuse une requête invalide", async () => {
    searchPlan = { entity: "tickets", q: "", filters: [{ field: "motDePasse", operator: "eq", value: "x" }], sort: "", explanation: "" };
    const invalid = await admin("POST", "/admin/ai/search", { question: "Tickets ouverts ?" }, supportToken);
    expect(invalid.status).toBe(422);
    expect(invalid.json.error.code).toBe("BUSINESS_RULE");
    expect(calls[0].schema).toMatchObject({ properties: { entity: { enum: expect.not.arrayContaining(["products"]) } } });
  });
});
