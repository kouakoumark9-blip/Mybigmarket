/**
 * Tunnel de commande complet sur PostgreSQL réel (PGlite), à travers l'API v1 :
 * panier invité (cookie), fusion à la connexion, bons, commande idempotente (une par vendeur,
 * stock réservé, bon consommé, order.created), stock insuffisant, espace client et adresses.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
// L'action historique de la boutique lit la base via getDb() : elle utilise ici la même base PGlite.
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));
vi.mock("@/lib/session-account", () => ({ assertActiveAccount: async () => undefined }));

const SELLER_A = "10000000-0000-4000-8000-0000000000f1";
const SELLER_B = "10000000-0000-4000-8000-0000000000f2";
const BUYER = "10000000-0000-4000-8000-0000000000f3";

let db: Db;
let token: string;
let drill: string;
let tshirt: string;
let blackVariant: number;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const shop = (method: string, path: string, options: { body?: unknown; cookie?: string; key?: string } = {}) =>
  api(method, path, { body: options.body, headers: { ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.key ? { "idempotency-key": options.key } : {}) } });
const cookieFrom = (headers: Headers) => headers.get("set-cookie")?.split(";")[0] ?? "";

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values
    (${SELLER_A}, 'Atelier A', 'a@vendeurs.ci', 'x', 'seller'), (${SELLER_B}, 'Atelier B', 'b@vendeurs.ci', 'x', 'seller'), (${BUYER}, 'Awa Koné', 'awa@exemple.ci', 'x', 'buyer')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER_A}, 'U', 'Yiwu', 'approved'), (${SELLER_B}, 'U', 'Canton', 'approved')`);
  const [taxGroup] = await rows<{ id: string }>(sql`insert into tax_rule_groups (name) values ('TVA') returning id`);
  const [rule] = await rows<{ id: string }>(sql`insert into tax_rules (code, country_code, label, rate_percent, is_active) values ('tva', 'CI', 'TVA 18 %', 18, true) returning id`);
  await db.execute(sql`insert into tax_rule_group_rules (tax_rule_group_id, tax_rule_id) values (${taxGroup.id}, ${rule.id})`);
  const categoryId = (await admin("POST", "/admin/categories", { name: "Bricolage" })).json.data.id;
  drill = (await admin("POST", "/admin/products", { title: "Perceuse 750 W", sellerId: SELLER_A, categoryId, priceXof: 20000, taxRuleGroupId: taxGroup.id, status: "approved", initialQuantity: 5 })).json.data.id;
  tshirt = (await admin("POST", "/admin/products", { title: "T-shirt coton", sellerId: SELLER_B, categoryId, priceXof: 5000, status: "approved" })).json.data.id;
  const colors = await admin("POST", "/admin/attribute-groups", { code: "couleur", name: "Couleur", values: [{ code: "noir", name: "Noir" }, { code: "blanc", name: "Blanc" }] });
  const generated = await admin("POST", `/admin/products/${tshirt}/combinations/generate`, { attributeValueIds: colors.json.data.values.map((value: { id: string }) => value.id) });
  blackVariant = generated.json.data.combinations.find((entry: { value: string }) => entry.value === "Noir").id;
  await admin("POST", "/admin/stock/adjustments", { productId: tshirt, variantId: blackVariant, delta: 20, reason: "purchase" });
  await admin("POST", "/admin/vouchers", { code: "BIENVENUE10", discountType: "percent", discountValue: 10, perCustomerLimit: 1 });
});

describe("tunnel de commande", () => {
  let guestCookie = "";

  it("crée un panier invité lié à un cookie HttpOnly et le recalcule", async () => {
    const added = await shop("POST", "/shop/cart/items", { body: { productId: drill, quantity: 1 } });
    expect(added.status).toBe(200);
    expect(added.headers.get("set-cookie")).toMatch(/^mbm_cart=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax/);
    guestCookie = cookieFrom(added.headers);
    expect(added.json.data.totals).toMatchObject({ itemCount: 1, subtotalInclTaxXof: 23600, totalXof: 23600 });

    const same = await shop("POST", "/shop/cart/items", { body: { productId: drill, quantity: 1 }, cookie: guestCookie });
    expect(same.headers.get("set-cookie")).toBeNull();
    expect(same.json.data.lines[0].quantity).toBe(2);

    const variantNeeded = await shop("POST", "/shop/cart/items", { body: { productId: tshirt, quantity: 1 }, cookie: guestCookie });
    expect(variantNeeded.json.data.lines.find((line: { productId: string }) => line.productId === tshirt).issue.code).toBe("variant_required");
    const fixed = await shop("PATCH", "/shop/cart/items", { body: { productId: tshirt, quantity: 0 }, cookie: guestCookie });
    expect(fixed.json.data.orderable).toBe(true);
    await shop("POST", "/shop/cart/items", { body: { productId: tshirt, variantId: blackVariant, quantity: 3 }, cookie: guestCookie });
  });

  it("refuse un bon réservé aux clients connectés, puis fusionne le panier à la connexion", async () => {
    const guestVoucher = await shop("PUT", "/shop/cart/vouchers", { body: { codes: ["bienvenue10"] }, cookie: guestCookie });
    expect(guestVoucher.json.data.vouchers.rejected).toEqual([expect.objectContaining({ code: "BIENVENUE10", reason: "login_required" })]);

    session.current = { user: { id: BUYER, role: "buyer", email: "awa@exemple.ci" } };
    const merged = await shop("GET", "/shop/cart", { cookie: guestCookie });
    expect(merged.headers.get("set-cookie")).toMatch(/^mbm_cart=; .*Max-Age=0/);
    expect(merged.json.data.lines.map((line: { quantity: number }) => line.quantity).sort()).toEqual([2, 3]);
    // 2 × 23 600 + 3 × 5 000 = 62 200 TTC ; bon -10 % = 6 220.
    expect(merged.json.data.vouchers.applied).toEqual([expect.objectContaining({ code: "BIENVENUE10", discountXof: 6220 })]);
    expect(merged.json.data.totals).toMatchObject({ subtotalInclTaxXof: 62200, discountXof: 6220, totalXof: 55980 });
    expect(merged.json.data.sellers).toHaveLength(2);
  });

  it("passe commande : idempotente, une commande par vendeur, stock réservé, bon consommé", async () => {
    const body = { delivery: { method: "delivery", countryCode: "CI", language: "fr", address: { name: "Awa Koné", phone: "+225 07 00 00 00 01", address: "Rue des Jardins, Cocody", city: "Abidjan" } }, paymentMethod: "wave" };
    const withoutKey = await shop("POST", "/shop/checkout", { body });
    expect(withoutKey.status).toBe(400);

    const placed = await shop("POST", "/shop/checkout", { body, key: "checkout-awa-0001" });
    expect(placed.status).toBe(201);
    const result = placed.json.data;
    expect(result.orders).toHaveLength(2);
    expect(result.orders.reduce((sum: number, order: { totalXof: number }) => sum + order.totalXof, 0)).toBe(55980);
    expect(result.orders[0].reference).toMatch(/^CMD-\d{4}-\d{6}$/);

    const replay = await shop("POST", "/shop/checkout", { body, key: "checkout-awa-0001" });
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(replay.json.data.checkoutGroupId).toBe(result.checkoutGroupId);
    const [{ n }] = await rows<{ n: number }>(sql`select count(*)::int as n from orders where checkout_group_id = ${result.checkoutGroupId}`);
    expect(n).toBe(2);

    const [drillRow] = await rows<{ quantity: number }>(sql`select quantity from products where id = ${drill}`);
    expect(drillRow.quantity).toBe(3);
    const [variantRow] = await rows<{ stock: number }>(sql`select stock from product_variants where id = ${blackVariant}`);
    expect(variantRow.stock).toBe(17);
    const [voucher] = await rows<{ usage_count: number }>(sql`select usage_count from promo_codes where code = 'BIENVENUE10'`);
    expect(voucher.usage_count).toBe(1);
    const events = await rows<{ name: string }>(sql`select name from domain_events where name = 'order.created'`);
    expect(events).toHaveLength(2);
    const items = await rows<{ unit_price_xof: number; tax_rate_percent: string; line_total_xof: number; discount_xof: number }>(sql`select unit_price_xof, tax_rate_percent, line_total_xof, discount_xof from order_items where product_id = ${drill}`);
    expect(items[0]).toMatchObject({ unit_price_xof: 20000, tax_rate_percent: "18.00", line_total_xof: 47200 - items[0].discount_xof });

    const empty = await shop("GET", "/shop/cart");
    expect(empty.json.data.lines).toEqual([]);
  });

  it("n'accepte plus le bon une seconde fois et refuse un stock insuffisant", async () => {
    await shop("POST", "/shop/cart/items", { body: { productId: drill, quantity: 4 } });
    const cart = await shop("PUT", "/shop/cart/vouchers", { body: { codes: ["BIENVENUE10"] } });
    expect(cart.json.data.vouchers.rejected).toEqual([expect.objectContaining({ reason: "customer_limit_reached" })]);
    expect(cart.json.data.lines[0].issue.code).toBe("insufficient_stock");
    const refused = await shop("POST", "/shop/checkout", { key: "checkout-awa-0002", body: { delivery: { method: "pickup", countryCode: "CI", language: "fr", pickupPointId: 999 }, paymentMethod: "wave" } });
    expect(refused.status).toBe(400);
    await shop("PUT", "/shop/cart/vouchers", { body: { codes: [] } });
    const stockRefused = await shop("POST", "/shop/checkout", { key: "checkout-awa-0003", body: { delivery: { method: "delivery", countryCode: "CI", language: "fr", address: { name: "Awa", phone: "0700000001", address: "Rue 12, Cocody", city: "Abidjan" } }, paymentMethod: "wave" } });
    expect(stockRefused.status).toBe(422);
    expect(stockRefused.json.error.details.issues[0]).toMatchObject({ code: "insufficient_stock" });
    await shop("DELETE", "/shop/cart");
  });

  it("donne au client ses commandes, ses adresses et l'export de ses données", async () => {
    const orders = await shop("GET", "/shop/orders");
    expect(orders.json.data).toHaveLength(2);
    const detail = await shop("GET", `/shop/orders/${orders.json.data[0].reference}`);
    expect(detail.json.data).toMatchObject({ status: "awaiting_payment", statusLabel: expect.any(String), payment: { status: "pending", method: "wave" } });
    expect(detail.json.data.history[0].status).toBe("awaiting_payment");

    const first = await shop("POST", "/shop/addresses", { body: { firstName: "Awa", lastName: "Koné", phone: "+225 07 00 00 00 01", line1: "Rue des Jardins, Cocody", city: "Abidjan", countryCode: "CI" } });
    expect(first.json.data).toMatchObject({ isDefaultShipping: true, isDefaultBilling: true });
    expect((await shop("POST", "/shop/addresses", { body: { firstName: "awa", lastName: "KONÉ", phone: "+225 07 00 00 00 01", line1: "rue des jardins,  cocody", city: "abidjan", countryCode: "ci" } })).status).toBe(409);
    expect((await shop("POST", "/shop/addresses", { body: { firstName: "Awa", lastName: "Koné", phone: "12", line1: "Rue 1, Plateau", city: "Abidjan", countryCode: "CI" } })).status).toBe(400);
    const second = await shop("POST", "/shop/addresses", { body: { firstName: "Awa", lastName: "Koné", phone: "0700000002", line1: "Boulevard Latrille", city: "Abidjan", countryCode: "CI", isDefaultShipping: true } });
    const list = await shop("GET", "/shop/addresses");
    expect(list.json.data.filter((entry: { isDefaultShipping: boolean }) => entry.isDefaultShipping).map((entry: { id: string }) => entry.id)).toEqual([second.json.data.id]);

    const updated = await shop("PATCH", "/shop/account", { body: { companyName: "Koné Distribution", newsletter: true } });
    expect(updated.json.data).toMatchObject({ segment: "business", newsletter: true });
    const exported = await shop("GET", "/shop/account/export");
    expect(exported.json.data).toMatchObject({ profile: { email: "awa@exemple.ci" }, addresses: expect.any(Array), orders: expect.any(Array) });

    session.current = null;
    expect((await shop("GET", "/shop/orders")).status).toBe(401);
  });
});

describe("administration des commandes, clients, taxes et devises", () => {
  let paidOrder: { id: string; reference: string };
  let pendingOrder: { id: string };

  it("liste les commandes, applique les statuts et leurs effets (paiement, séquestre, stock)", async () => {
    const list = await admin("GET", "/admin/orders?q=awa@exemple.ci&sort=createdAt");
    expect(list.status).toBe(200);
    expect(list.json.data.length).toBeGreaterThanOrEqual(2);
    [paidOrder, pendingOrder] = list.json.data;

    const paid = await admin("POST", `/admin/orders/${paidOrder.id}/status`, { status: "paid_escrow", note: "Virement reçu" });
    expect(paid.status).toBe(200);
    expect(paid.json.data).toMatchObject({ status: "paid_escrow", payments: [expect.objectContaining({ status: "succeeded" })], escrow: { status: "blocked" } });
    expect(paid.json.data.escrow.commissionXof).toBe(Math.round(paid.json.data.totals.totalXof * 0.08));

    const invalid = await admin("POST", `/admin/orders/${paidOrder.id}/status`, { status: "delivered" });
    expect(invalid.status).toBe(422);

    await admin("POST", `/admin/orders/${paidOrder.id}/status`, { status: "seller_confirmed" });
    const shipped = await admin("POST", `/admin/orders/${paidOrder.id}/status`, { status: "shipped", trackingNumber: "CN123456789" });
    expect(shipped.json.data.reservations.every((entry: { status: string }) => entry.status === "consumed")).toBe(true);
    expect(shipped.json.data.history.map((entry: { to: string }) => entry.to)).toEqual(["awaiting_payment", "paid_escrow", "seller_confirmed", "shipped"]);
    const sales = await rows<{ n: number }>(sql`select count(*)::int as n from stock_movements where order_id = ${paidOrder.id} and reason = 'sale'`);
    expect(sales[0].n).toBeGreaterThan(0);
  });

  it("annule une commande et libère sa réservation", async () => {
    const before = await admin("GET", `/admin/orders/${pendingOrder.id}`);
    const productId = before.json.data.items[0].productId;
    const variantId = before.json.data.items[0].variantId;
    const counter = async () => variantId
      ? (await rows<{ n: number }>(sql`select stock as n from product_variants where id = ${variantId}`))[0].n
      : (await rows<{ n: number }>(sql`select quantity as n from products where id = ${productId}`))[0].n;
    const start = await counter();
    const cancelled = await admin("POST", `/admin/orders/${pendingOrder.id}/status`, { status: "cancelled", note: "Demande du client" });
    expect(cancelled.json.data.reservations.every((entry: { status: string }) => entry.status === "released")).toBe(true);
    expect(await counter()).toBe(start + before.json.data.items[0].quantity);
    const events = await rows<{ n: number }>(sql`select count(*)::int as n from domain_events where name = 'order.status_changed'`);
    expect(events[0].n).toBeGreaterThanOrEqual(4);
  });

  it("émet une facture numérotée, des avoirs plafonnés et un document imprimable", async () => {
    const invoice = await admin("POST", `/admin/orders/${paidOrder.id}/invoice`);
    expect(invoice.status).toBe(201);
    expect(invoice.json.data.number).toMatch(/^FAC-\d{4}-000001$/);
    expect((await admin("POST", `/admin/orders/${paidOrder.id}/invoice`)).status).toBe(409);
    expect((await admin("POST", `/admin/orders/${pendingOrder.id}/invoice`)).status).toBe(422);

    const credit = await admin("POST", `/admin/orders/${paidOrder.id}/credit-notes`, { amountXof: 1000, reason: "Geste commercial" });
    expect(credit.json.data.number).toMatch(/^AVR-\d{4}-000001$/);
    expect((await admin("POST", `/admin/orders/${paidOrder.id}/credit-notes`, { amountXof: invoice.json.data.totalXof, reason: "Trop élevé" })).status).toBe(422);

    const { handleApi } = await import("@/server/api/registry");
    const response = await handleApi(new Request(`http://shop.test/api/v1/admin/invoices/${invoice.json.data.id}/document`, { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.10" } }), ["admin", "invoices", invoice.json.data.id, "document"]);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(invoice.json.data.number);
    expect(html).toContain("Awa Koné");

    session.current = { user: { id: BUYER, role: "buyer", email: "awa@exemple.ci" } };
    const mine = await handleApi(new Request(`http://shop.test/api/v1/shop/orders/${paidOrder.id}/invoice`, { headers: { "x-forwarded-for": "203.0.113.10" } }), ["shop", "orders", paidOrder.id, "invoice"]);
    expect(mine.status).toBe(200);
    session.current = { user: { id: SELLER_B, role: "seller", email: "b@vendeurs.ci" } };
    const other = await handleApi(new Request(`http://shop.test/api/v1/shop/orders/${paidOrder.id}/invoice`, { headers: { "x-forwarded-for": "203.0.113.10" } }), ["shop", "orders", paidOrder.id, "invoice"]);
    expect(other.status).toBe(404);
    session.current = null;
  });

  it("gère clients et groupes, et refuse l'anonymisation tant qu'une commande est en cours", async () => {
    const customers = await admin("GET", "/admin/customers?q=awa");
    expect(customers.json.data).toHaveLength(1);
    const customer = customers.json.data[0];
    expect(customer).toMatchObject({ email: "awa@exemple.ci", segment: "business" });
    expect(customer.orderCount).toBeGreaterThanOrEqual(2);

    const group = await admin("POST", "/admin/customer-groups", { code: "grossistes", name: "Grossistes", discountBasisPoints: 700 });
    expect(group.json.data.discountPercent).toBe(7);
    const updated = await admin("PATCH", `/admin/customers/${customer.id}`, { customerGroupId: group.json.data.id, internalNote: "Cliente fidèle" });
    expect(updated.json.data).toMatchObject({ customerGroupId: group.json.data.id, internalNote: "Cliente fidèle" });
    const refused = await admin("POST", `/admin/customers/${customer.id}/anonymize`);
    expect(refused.status).toBe(422);
    expect((await admin("DELETE", `/admin/customer-groups/${group.json.data.id}`)).status).toBe(204);
    expect((await admin("GET", `/admin/customers/${customer.id}`)).json.data.customerGroupId).toBeNull();
  });

  it("administre taxes et devises", async () => {
    const rule = await admin("POST", "/admin/tax-rules", { code: "tva-sn", countryCode: "SN", label: "TVA Sénégal 18 %", ratePercent: 18 });
    expect(rule.status).toBe(201);
    const group = await admin("POST", "/admin/tax-rule-groups", { name: "TVA UEMOA", ruleIds: [rule.json.data.id] });
    expect(group.json.data.rules).toHaveLength(1);
    const lowered = await admin("PATCH", `/admin/tax-rules/${rule.json.data.id}`, { ratePercent: 10 });
    expect(lowered.json.data.ratePercent).toBe(10);
    const euro = await admin("POST", "/admin/currencies", { code: "EUR", name: "Euro", symbol: "€", conversionRate: 0.001524 });
    expect(euro.status).toBe(201);
    const listed = await api("GET", "/shop/currencies");
    expect(listed.json.data.map((entry: { code: string }) => entry.code)).toContain("EUR");
  });
});
