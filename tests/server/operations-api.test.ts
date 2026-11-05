/**
 * Exploitation de bout en bout (PGlite) : statistiques pré-calculées (totaux, période précédente,
 * classements, recalcul), journal des erreurs (API, tâches, regroupement, résolution), tâches
 * planifiées (historique, verrou, désactivation, routes cron) et nettoyage technique.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));
vi.mock("@/server/core/db", async (original) => ({ ...(await original<typeof import("@/server/core/db")>()), db: () => runtime.db }));

const SELLER = "50000000-0000-4000-8000-0000000000d1";
const BUYER_A = "60000000-0000-4000-8000-0000000000d1";
const BUYER_B = "60000000-0000-4000-8000-0000000000d2";
let db: Db;
let token: string;
let lamp: string;
let chair: string;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;

async function order(buyer: string, status: string, day: string, items: Array<{ product: string; quantity: number; price: number }>, shipping = 0) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0) + shipping;
  const [created] = await rows<{ id: string }>(sql`insert into orders (buyer_id, total_xof, shipping_cost_xof, status, created_at) values (${buyer}, ${total}, ${shipping}, ${status}, ${`${day}T10:00:00Z`}) returning id`);
  for (const item of items) {
    await db.execute(sql`insert into order_items (order_id, product_id, seller_id, quantity, unit_price_xof, line_total_xof, product_title) values (${created.id}, ${item.product}, ${SELLER}, ${item.quantity}, ${item.price}, ${item.quantity * item.price}, 'x')`);
  }
  return created.id;
}

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER}, 'Atelier D', 'd@vendeurs.ci', 'x', 'seller'), (${BUYER_A}, 'Awa Koné', 'awa@clients.ci', 'x', 'buyer'), (${BUYER_B}, 'Yao Kouassi', 'yao@clients.ci', 'x', 'buyer')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER}, 'U', 'Yiwu', 'approved')`);
  await db.execute(sql`insert into customers (user_id, created_at) values (${BUYER_A}, '2026-03-02T08:00:00Z'), (${BUYER_B}, '2026-03-03T08:00:00Z')`);
  const lighting = (await admin("POST", "/admin/categories", { name: "Éclairage", slug: "eclairage" })).json.data.id;
  const furniture = (await admin("POST", "/admin/categories", { name: "Mobilier", slug: "mobilier" })).json.data.id;
  lamp = (await admin("POST", "/admin/products", { title: "Lampe de bureau", sellerId: SELLER, categoryId: lighting, priceXof: 10000, status: "approved" })).json.data.id;
  chair = (await admin("POST", "/admin/products", { title: "Chaise pliante", sellerId: SELLER, categoryId: furniture, priceXof: 25000, status: "approved" })).json.data.id;
  // Période étudiée : 1er au 7 mars ; période précédente : 22 au 28 février.
  await order(BUYER_A, "paid_escrow", "2026-03-02", [{ product: lamp, quantity: 3, price: 10000 }], 2000);
  await order(BUYER_A, "delivered", "2026-03-04", [{ product: chair, quantity: 1, price: 25000 }]);
  await order(BUYER_B, "seller_confirmed", "2026-03-04", [{ product: lamp, quantity: 1, price: 10000 }, { product: chair, quantity: 2, price: 25000 }]);
  await order(BUYER_B, "awaiting_payment", "2026-03-05", [{ product: chair, quantity: 9, price: 25000 }]);
  await order(BUYER_B, "cancelled", "2026-03-06", [{ product: lamp, quantity: 4, price: 10000 }]);
  await order(BUYER_A, "delivered", "2026-02-25", [{ product: lamp, quantity: 2, price: 10000 }]);
  await db.execute(sql`insert into carts (created_at) values ('2026-03-02T07:00:00Z'), ('2026-03-03T07:00:00Z'), ('2026-03-04T07:00:00Z'), ('2026-03-04T08:00:00Z'), ('2026-03-05T08:00:00Z'), ('2026-03-06T08:00:00Z')`);
});

afterEach(() => vi.restoreAllMocks());

describe("statistiques", () => {
  it("calcule les totaux de la période, la comparaison et la série quotidienne", async () => {
    const response = await admin("GET", "/admin/stats/overview?from=2026-03-01&to=2026-03-07");
    expect(response.status).toBe(200);
    const stats = response.json.data;
    expect(stats.totals).toMatchObject({
      ordersCount: 5, validOrdersCount: 3, revenueXof: 32000 + 25000 + 60000, shippingXof: 2000, itemsSold: 3 + 1 + 3, cancelledCount: 1,
      newCustomers: 2, cartsCreated: 6, buyers: 2, averageOrderXof: Math.round(117000 / 3), cartConversionPercent: 50,
    });
    expect(stats.previous).toMatchObject({ from: "2026-02-22", to: "2026-02-28", revenueXof: 20000, validOrdersCount: 1 });
    expect(stats.changes.revenueXof).toBe(485);
    expect(stats.series).toHaveLength(7);
    expect(stats.series.find((entry: { day: string }) => entry.day === "2026-03-04")).toMatchObject({ validOrdersCount: 2, revenueXof: 85000, itemsSold: 4 });
    expect(stats.series.find((entry: { day: string }) => entry.day === "2026-03-07")).toMatchObject({ ordersCount: 0, revenueXof: 0 });
  });

  it("classe produits, catégories, vendeurs et clients", async () => {
    const byRevenue = await admin("GET", "/admin/stats/products?from=2026-03-01&to=2026-03-07");
    expect(byRevenue.json.data.data.map((entry: { title: string; units: number; revenueXof: number }) => [entry.title, entry.units, entry.revenueXof])).toEqual([["Chaise pliante", 3, 75000], ["Lampe de bureau", 4, 40000]]);
    const byUnits = await admin("GET", "/admin/stats/products?from=2026-03-01&to=2026-03-07&sort=units");
    expect(byUnits.json.data.data[0].title).toBe("Lampe de bureau");
    const categories = await admin("GET", "/admin/stats/categories?from=2026-03-01&to=2026-03-07");
    expect(categories.json.data.data.map((entry: { slug: string }) => entry.slug)).toEqual(["mobilier", "eclairage"]);
    const sellers = await admin("GET", "/admin/stats/sellers?from=2026-03-01&to=2026-03-07");
    expect(sellers.json.data.data).toEqual([expect.objectContaining({ name: "Atelier D", units: 7, revenueXof: 115000, products: 2 })]);
    const customers = await admin("GET", "/admin/stats/customers?from=2026-03-01&to=2026-03-07");
    expect(customers.json.data.data.map((entry: { email: string; orders: number; revenueXof: number }) => [entry.email, entry.orders, entry.revenueXof])).toEqual([["yao@clients.ci", 1, 60000], ["awa@clients.ci", 2, 57000]]);
  });

  it("recalcule une période après un changement de statut et exporte la série en CSV", async () => {
    await db.execute(sql`update orders set status = 'refunded' where status = 'delivered' and created_at::date = '2026-03-04'`);
    expect((await admin("GET", "/admin/stats/overview?from=2026-03-01&to=2026-03-07")).json.data.totals.revenueXof).toBe(117000);
    const refreshed = await admin("POST", "/admin/stats/refresh", { from: "2026-03-01", to: "2026-03-07" });
    expect(refreshed.json.data).toMatchObject({ from: "2026-03-01", to: "2026-03-07", days: 7 });
    expect((await admin("GET", "/admin/stats/overview?from=2026-03-01&to=2026-03-07")).json.data.totals.revenueXof).toBe(92000);
    const { handleApi } = await import("@/server/api/registry");
    const csv = await (await handleApi(new Request("http://shop.test/api/v1/admin/stats/daily.csv?from=2026-03-01&to=2026-03-07", { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.10" } }), ["admin", "stats", "daily.csv"])).text();
    expect(csv.split("\r\n")[0]).toBe("jour;commandes;commandes_valides;chiffre_affaires_xof;livraison_xof;articles_vendus;annulations;rembourse_xof;nouveaux_clients;acheteurs;paniers_crees");
    expect(csv).toContain("2026-03-04;2;1;60000;0;3;0;0;0;1;2");
    expect((await admin("GET", "/admin/stats/overview?from=2026-03-07&to=2026-03-01")).status).toBe(400);
    expect((await admin("GET", "/admin/stats/overview?from=2024-01-01&to=2026-03-01")).status).toBe(400);
  });
});

describe("journal des erreurs", () => {
  it("enregistre une erreur 500 de l'API avec l'identifiant de requête, sans fuite vers le client", async () => {
    const stats = await import("@/server/modules/stats/service");
    vi.spyOn(stats, "bestCustomers").mockRejectedValue(new Error("connexion perdue vers 10.0.0.12"));
    const response = await admin("GET", "/admin/stats/customers");
    expect(response.status).toBe(500);
    expect(response.json.error.message).not.toContain("10.0.0.12");
    const requestId = response.json.error.requestId;
    const logs = await admin("GET", `/admin/error-logs?filter[requestId]=${requestId}`);
    expect(logs.json.data).toEqual([expect.objectContaining({ source: "api", code: "INTERNAL", status: 500, route: "admin.stats.customers", method: "GET", path: "/api/v1/admin/stats/customers" })]);
    const detail = await admin("GET", `/admin/error-logs/${logs.json.data[0].id}`);
    expect(detail.json.data.stack).toContain("connexion perdue");
  });

  it("regroupe les répétitions d'une même erreur et les marque résolues", async () => {
    const { registerTask } = await import("@/server/core/tasks");
    registerTask({ code: "test.fail", name: "Échec", description: "Tâche de test qui échoue.", schedule: "jamais", cronPath: "/api/cron/test", run: async () => { throw new Error(`Délai dépassé après ${Math.floor(Math.random() * 1000)} ms`); } });
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await admin("POST", "/admin/tasks/test.fail/run")).json.data.status).toBe("failed");
    const groups = await admin("GET", "/admin/error-logs/groups?source=task&open=1");
    expect(groups.json.data).toEqual([expect.objectContaining({ source: "task", route: "test.fail", occurrences: 3, open: 3 })]);
    const resolved = await admin("POST", "/admin/error-logs/resolve", { fingerprint: groups.json.data[0].fingerprint });
    expect(resolved.json.data).toEqual({ resolved: 3 });
    expect((await admin("GET", "/admin/error-logs?filter[source]=task&filter[resolvedAt][null]=true")).json.meta.total).toBe(0);
  });
});

describe("tâches planifiées", () => {
  it("liste les tâches, exécute à la demande et garde l'historique", async () => {
    const tasks = await admin("GET", "/admin/tasks");
    expect(tasks.json.data.map((task: { code: string }) => task.code)).toEqual(expect.arrayContaining(["payments.expire", "shipping.purge_quotes", "events.dispatch", "stats.refresh", "imports.resume", "support.auto_close", "maintenance.purge"]));
    const run = await admin("POST", "/admin/tasks/stats.refresh/run");
    expect(run.json.data).toMatchObject({ code: "stats.refresh", status: "succeeded", result: { days: 7 } });
    const history = await admin("GET", "/admin/tasks/stats.refresh/runs");
    expect(history.json.data[0]).toMatchObject({ trigger: "manual", status: "succeeded" });
    const listed = (await admin("GET", "/admin/tasks")).json.data.find((task: { code: string }) => task.code === "stats.refresh");
    expect(listed).toMatchObject({ isEnabled: true, running: false, lastStatus: "succeeded" });
    expect((await admin("POST", "/admin/tasks/inconnue/run")).status).toBe(404);
  });

  it("refuse une deuxième exécution simultanée et respecte la désactivation par le planificateur", async () => {
    await db.execute(sql`update scheduled_tasks set locked_until = now() + interval '5 minutes' where code = 'stats.refresh'`);
    expect((await admin("POST", "/admin/tasks/stats.refresh/run")).json.data).toMatchObject({ status: "skipped", reason: "Une exécution est déjà en cours." });
    await db.execute(sql`update scheduled_tasks set locked_until = null where code = 'stats.refresh'`);
    expect((await admin("PATCH", "/admin/tasks/maintenance.purge", { isEnabled: false })).json.data.isEnabled).toBe(false);
    const { GET } = await import("@/app/api/cron/maintenance/route");
    expect((await GET(new Request("http://shop.test/api/cron/maintenance"))).status).toBe(401);
    const response = await GET(new Request("http://shop.test/api/cron/maintenance", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(response.status).toBe(200);
    const results = (await response.json()).data as Array<{ code: string; status: string; reason?: string }>;
    expect(results.map((result) => [result.code, result.status])).toEqual([["stats.refresh", "succeeded"], ["imports.resume", "succeeded"], ["support.auto_close", "succeeded"], ["ai.expire_proposals", "succeeded"], ["maintenance.purge", "skipped"]]);
    // Exécution manuelle possible même désactivée.
    expect((await admin("POST", "/admin/tasks/maintenance.purge/run")).json.data.status).toBe("succeeded");
  });

  it("nettoie les données techniques expirées sans toucher aux données métier", async () => {
    await db.execute(sql`insert into rate_limit_buckets (key, window_start, count, expires_at) values ('old', now() - interval '2 hours', 3, now() - interval '1 hour'), ('fresh', now(), 1, now() + interval '1 hour')`);
    await db.execute(sql`insert into idempotency_keys (scope, key, request_hash, expires_at) values ('s', 'expired-key-0001', 'h', now() - interval '1 day')`);
    const before = Number((await rows<{ n: number }>(sql`select count(*)::int as n from orders`))[0].n);
    const run = await admin("POST", "/admin/tasks/maintenance.purge/run");
    expect(run.json.data.result).toMatchObject({ rateLimitBuckets: 1, idempotencyKeys: 1 });
    const keys = (await rows<{ key: string }>(sql`select key from rate_limit_buckets`)).map((row) => row.key);
    expect(keys).toContain("fresh");
    expect(keys).not.toContain("old");
    expect(Number((await rows<{ n: number }>(sql`select count(*)::int as n from orders`))[0].n)).toBe(before);
  });

  it("protège les routes cron existantes par CRON_SECRET et historise leurs passages", async () => {
    const { GET } = await import("@/app/api/cron/expire-quotes/route");
    expect((await GET(new Request("http://shop.test/api/cron/expire-quotes", { headers: { authorization: "Bearer mauvais" } }))).status).toBe(401);
    const response = await GET(new Request("http://shop.test/api/cron/expire-quotes", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({ code: "shipping.purge_quotes", status: "succeeded", result: { deleted: 0 } });
    expect((await admin("GET", "/admin/tasks/shipping.purge_quotes/runs")).json.data[0]).toMatchObject({ trigger: "cron", status: "succeeded" });
  });
});
