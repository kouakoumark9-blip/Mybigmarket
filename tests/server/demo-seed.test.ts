/**
 * Données de démonstration : créées par les services réels, cohérentes (stock, commandes,
 * paiements, ticket), visibles dans l'API, et idempotentes (un second passage ne duplique rien).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { DEMO_PRODUCT_SLUGS, seedDemoCommerce, type DemoSeedSummary } from "@/server/modules/demo/seed";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

vi.mock("@/auth", () => ({ auth: async () => null }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

let db: Db;
let summary: DemoSeedSummary;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  summary = await seedDemoCommerce(db, { passwordHash: "!" });
});

describe("données de démonstration", () => {
  it("crée catalogue, déclinaisons, clients, commandes à plusieurs étapes et ticket", () => {
    expect(summary).toMatchObject({ products: 3, variants: 6, customers: 3, orders: 4, tickets: 1 });
    expect(summary.categories).toBeGreaterThanOrEqual(6);
    expect(summary.orderStatuses).toMatchObject({ delivered: 1, shipped: 1, paid_escrow: 1, awaiting_payment: 1 });
  });

  it("passe par les vraies règles : stock décompté, promotion, paiements confirmés, audit", async () => {
    const [blender] = await rows<{ quantity: number }>(sql`select quantity from products where slug = ${DEMO_PRODUCT_SLUGS.blender}`);
    expect(blender.quantity).toBeLessThan(40);
    const intents = await rows<{ status: string }>(sql`select status from payment_intents order by created_at`);
    expect(intents.map((intent) => intent.status).filter((status) => status === "succeeded")).toHaveLength(3);
    const audit = await rows<{ action: string }>(sql`select distinct action from employee_audit_logs`);
    expect(audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(["product.created", "stock.adjusted"]));
  });

  it("est visible dans l'API de la boutique et du back-office", async () => {
    const listed = await api("GET", "/shop/products?q=mixeur");
    expect(listed.json.data.map((product: { slug: string }) => product.slug)).toContain(DEMO_PRODUCT_SLUGS.blender);
    const detail = await api("GET", `/shop/products/${DEMO_PRODUCT_SLUGS.tshirt}`);
    expect(detail.status).toBe(200);
    await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
    const token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    expect((await api("GET", "/admin/orders", { token })).json.meta.total).toBe(4);
    expect((await api("GET", "/admin/support/tickets", { token })).json.meta.total).toBe(1);
  });

  it("ne duplique rien au second passage", async () => {
    const again = await seedDemoCommerce(db, { passwordHash: "!" });
    expect(again).toEqual(summary);
    expect((await rows<{ n: number }>(sql`select count(*)::int as n from products where slug like '%-demo%'`))[0].n).toBe(3);
  });
});
