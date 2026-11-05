/**
 * Paiements de bout en bout sur PostgreSQL (PGlite) : moyens disponibles, intention unique pour
 * plusieurs commandes, notifications signées (rejouées, signature invalide, double notification,
 * montant faux), virement confirmé par l'équipe, nouvelle tentative, paiement à la livraison,
 * expiration et rapprochement, paiement tardif, remboursements.
 */
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import { MockGateway } from "@/lib/payments/gateways";
import type { Db } from "@/server/core/db";
import { expireOverduePayments } from "@/server/modules/payments/service";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));
vi.mock("@/lib/session-account", () => ({ assertActiveAccount: async () => undefined }));

const SELLER_A = "20000000-0000-4000-8000-0000000000a1";
const SELLER_B = "20000000-0000-4000-8000-0000000000a2";
const BUYER = "20000000-0000-4000-8000-0000000000b1";
const OTHER = "20000000-0000-4000-8000-0000000000b2";
const SECRET = "secret-webhook-de-test";

let db: Db;
let token: string;
let lamp: string;
let bag: string;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const shop = (method: string, path: string, options: { body?: unknown; key?: string } = {}) => api(method, path, { body: options.body, headers: options.key ? { "idempotency-key": options.key } : {} });
const as = (userId: string) => { session.current = { user: { id: userId, role: "buyer", email: `${userId}@exemple.ci` } }; };

async function webhook(body: Record<string, unknown>, signature?: string) {
  const { POST } = await import("@/app/api/webhooks/payments/[provider]/route");
  const raw = JSON.stringify(body);
  const response = await POST(new Request("http://shop.test/api/webhooks/payments/mock", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-afm-signature": signature ?? createHmac("sha256", SECRET).update(raw).digest("hex") } }), { params: Promise.resolve({ provider: "mock" }) });
  return { status: response.status, json: await response.json() };
}

const delivery = { method: "delivery", countryCode: "CI", language: "fr", address: { name: "Awa Koné", phone: "+225 07 00 00 00 01", address: "Rue des Jardins, Cocody", city: "Abidjan" } };
let keyCounter = 0;
async function checkout(lines: Array<{ productId: string; quantity: number }>, paymentMethod: string, extra: Record<string, unknown> = {}) {
  await shop("DELETE", "/shop/cart");
  for (const line of lines) await shop("POST", "/shop/cart/items", { body: line });
  return shop("POST", "/shop/checkout", { key: `pay-test-${++keyCounter}`, body: { delivery, paymentMethod, ...extra } });
}

beforeAll(async () => {
  process.env.MOCK_WEBHOOK_SECRET = SECRET;
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values
    (${SELLER_A}, 'Atelier A', 'a@vendeurs.ci', 'x', 'seller'), (${SELLER_B}, 'Atelier B', 'b@vendeurs.ci', 'x', 'seller'),
    (${BUYER}, 'Awa Koné', 'awa@exemple.ci', 'x', 'buyer'), (${OTHER}, 'Koffi Yao', 'koffi@exemple.ci', 'x', 'buyer')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER_A}, 'U', 'Yiwu', 'approved'), (${SELLER_B}, 'U', 'Canton', 'approved')`);
  const categoryId = (await admin("POST", "/admin/categories", { name: "Maison" })).json.data.id;
  lamp = (await admin("POST", "/admin/products", { title: "Lampe de bureau", sellerId: SELLER_A, categoryId, priceXof: 10000, status: "approved", initialQuantity: 50 })).json.data.id;
  bag = (await admin("POST", "/admin/products", { title: "Sac cabas", sellerId: SELLER_B, categoryId, priceXof: 5000, status: "approved", initialQuantity: 50 })).json.data.id;
  as(BUYER);
});

describe("moyens de paiement disponibles", () => {
  it("propose les moyens actifs et configurés, selon le pays, le montant et les réglages", async () => {
    const before = await shop("GET", "/shop/payment-methods?country=CI&amount=10000");
    expect(before.status).toBe(200);
    // Moov Money est livré désactivé (migration 0017) : activé ici par l'équipe.
    expect(before.json.data.methods.map((entry: { code: string }) => entry.code)).toEqual(["orange_money", "mtn_momo", "wave", "card"]);
    expect((await admin("PATCH", "/admin/payment-methods/moov_money", { isActive: true })).status).toBe(200);

    // Virement : proposé une fois les coordonnées bancaires saisies.
    const settings = await admin("PATCH", "/admin/settings", { values: { "payments.bank_transfer.account_holder": "MYBIGMARKET SARL", "payments.bank_transfer.bank_name": "Banque Atlantique", "payments.bank_transfer.iban": "CI93 CI00 0000 0000 0000 0000 0000" } });
    expect(settings.status).toBe(200);
    // Paiement à la livraison : désactivé par défaut, puis activé (Côte d'Ivoire uniquement, 300 000 FCFA maximum).
    expect((await admin("PATCH", "/admin/payment-methods/cash_on_delivery", { isActive: true })).status).toBe(200);
    const after = await shop("GET", "/shop/payment-methods?country=CI&amount=10000");
    expect(after.json.data.methods.map((entry: { code: string }) => entry.code)).toEqual(expect.arrayContaining(["bank_transfer", "cash_on_delivery"]));
    const senegal = await shop("GET", "/shop/payment-methods?country=SN&amount=10000");
    expect(senegal.json.data.methods.map((entry: { code: string }) => entry.code)).not.toContain("cash_on_delivery");
    const big = await shop("GET", "/shop/payment-methods?country=CI&amount=400000");
    expect(big.json.data.methods.map((entry: { code: string }) => entry.code)).not.toContain("cash_on_delivery");

    // Règles par pays : Wave autorisé en Côte d'Ivoire seulement, à partir de 1 000 FCFA.
    const ruled = await admin("PUT", "/admin/payment-methods/wave/countries", { rules: [{ countryCode: "CI", isAllowed: true, minimumAmountXof: 1000 }, { countryCode: "SN", isAllowed: false }] });
    expect(ruled.json.data.countryRules).toHaveLength(2);
    expect((await shop("GET", "/shop/payment-methods?country=SN&amount=10000")).json.data.methods.map((entry: { code: string }) => entry.code)).not.toContain("wave");
    expect((await shop("GET", "/shop/payment-methods?country=CI&amount=500")).json.data.methods.map((entry: { code: string }) => entry.code)).not.toContain("wave");

    const methods = await admin("GET", "/admin/payment-methods");
    expect(methods.json.data.find((entry: { code: string }) => entry.code === "card")).toMatchObject({ provider: "mock", providerConfigured: true });
  });

  it("refuse au passage de commande un moyen indisponible", async () => {
    const refused = await checkout([{ productId: lamp, quantity: 1 }], "wave", { delivery: { ...delivery, countryCode: "SN", language: "fr" } });
    expect(refused.status).toBe(422);
    expect(refused.json.error.message).toMatch(/Moyen de paiement indisponible/);
  });
});

describe("paiement par prestataire et notifications", () => {
  let reference = "";
  let orderIds: string[] = [];

  it("crée une seule intention pour les commandes des deux vendeurs", async () => {
    const placed = await checkout([{ productId: lamp, quantity: 2 }, { productId: bag, quantity: 1 }], "wave");
    expect(placed.status).toBe(201);
    const result = placed.json.data;
    expect(result.orders).toHaveLength(2);
    expect(result.payment).toMatchObject({ status: "pending", method: "wave", provider: "mock", amountXof: 25000 });
    expect(result.payment.reference).toMatch(/^PAY-\d{8}-[A-Z2-9]{8}$/);
    reference = result.payment.reference;
    orderIds = result.orders.map((order: { id: string }) => order.id);
    const journal = await rows<{ kind: string; status: string }>(sql`select t.kind, t.status from payment_transactions t join payment_intents i on i.id = t.intent_id where i.reference = ${reference} order by t.created_at`);
    expect(journal.map((entry) => entry.kind)).toEqual(["create", "initiate"]);
    const paymentsRows = await rows<{ external_reference: string; amount_xof: number }>(sql`select external_reference, amount_xof from payments where order_id in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}) order by external_reference`);
    expect(paymentsRows.map((row) => row.external_reference)).toEqual([`${reference}-1`, `${reference}-2`]);
  });

  it("rejette une notification à la signature invalide, sans effet", async () => {
    const forged = await webhook({ eventId: "evt-forged", reference, status: "paid", amountXof: 25000, currency: "XOF" }, "0".repeat(64));
    expect(forged.status).toBe(401);
    const statuses = await rows<{ status: string }>(sql`select status from orders where id in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`);
    expect(statuses.every((row) => row.status === "awaiting_payment")).toBe(true);
    const [event] = await rows<{ status: string; signature_valid: boolean; payload: Record<string, unknown> }>(sql`select status, signature_valid, payload from payment_webhook_events where status = 'rejected'`);
    expect(event).toMatchObject({ status: "rejected", signature_valid: false, payload: {} });
  });

  it("refuse un montant différent du montant attendu", async () => {
    const wrong = await webhook({ eventId: "evt-wrong-amount", reference, status: "paid", amountXof: 1000, currency: "XOF" });
    expect(wrong.status).toBe(409);
    const [intent] = await rows<{ status: string }>(sql`select status from payment_intents where reference = ${reference}`);
    expect(intent.status).toBe("pending");
  });

  it("confirme le paiement une seule fois, même rejoué ou notifié deux fois", async () => {
    const body = { eventId: "evt-paid-1", reference, status: "paid", amountXof: 25000, currency: "XOF", providerReference: "mock-op-1" };
    const first = await webhook(body);
    expect(first).toMatchObject({ status: 200, json: { ok: true, result: "paid" } });
    const historyCount = async () => (await rows<{ n: number }>(sql`select count(*)::int as n from order_status_history where order_id in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`))[0].n;
    const before = await historyCount();

    // Rejouée à l'identique : aucun retraitement, résultat initial renvoyé.
    const replay = await webhook(body);
    expect(replay).toMatchObject({ status: 200, json: { ok: true, duplicate: true, result: "paid" } });
    // Seconde notification distincte pour le même paiement : sans effet.
    const second = await webhook({ ...body, eventId: "evt-paid-2" });
    expect(second.json.result).toBe("already_paid");
    expect(await historyCount()).toBe(before);

    const orderRows = await rows<{ status: string; paid_at: string | null }>(sql`select status, paid_at from orders where id in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`);
    expect(orderRows.every((row) => row.status === "paid_escrow" && row.paid_at)).toBe(true);
    const escrow = await rows<{ status: string; amount_xof: number }>(sql`select status, amount_xof from escrow_entries where order_id in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}) order by amount_xof`);
    expect(escrow).toEqual([{ status: "blocked", amount_xof: 5000 }, { status: "blocked", amount_xof: 20000 }]);
    const reservations = await rows<{ expires_at: string | null }>(sql`select expires_at from stock_reservations where order_id in (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`);
    expect(reservations.every((row) => row.expires_at === null)).toBe(true);
    const [{ n }] = await rows<{ n: number }>(sql`select count(*)::int as n from domain_events where name = 'payment.succeeded'`);
    expect(n).toBe(1);
    const events = await rows<{ attempts: number }>(sql`select attempts from payment_webhook_events where event_key = 'evt:evt-paid-1'`);
    expect(events[0].attempts).toBe(2);
  });

  it("expose le paiement au client et à l'équipe, avec journal et notifications", async () => {
    const mine = await shop("GET", `/shop/payments/${reference}`);
    expect(mine.json.data).toMatchObject({ status: "succeeded", amountXof: 25000 });
    as(OTHER);
    expect((await shop("GET", `/shop/payments/${reference}`)).status).toBe(404);
    as(BUYER);
    const detail = await admin("GET", `/admin/payments/${reference}`);
    expect(detail.json.data.payments).toHaveLength(2);
    expect(detail.json.data.transactions.map((entry: { kind: string }) => entry.kind)).toEqual(expect.arrayContaining(["create", "initiate", "notification"]));
    expect(detail.json.data.notifications.length).toBeGreaterThanOrEqual(3);
    const rejected = await admin("GET", "/admin/payment-notifications?filter[status]=rejected");
    expect(rejected.json.data).toHaveLength(1);
    const list = await admin("GET", "/admin/payments?filter[status]=succeeded");
    expect(list.json.data.map((entry: { reference: string }) => entry.reference)).toContain(reference);
  });

  it("rembourse partiellement puis intégralement, jamais au-delà de l'encaissé", async () => {
    const lampOrder = (await rows<{ id: string }>(sql`select o.id from orders o join order_items i on i.order_id = o.id where i.product_id = ${lamp} and o.status = 'paid_escrow' limit 1`))[0].id;
    const partial = await admin("POST", `/admin/orders/${lampOrder}/refunds`, { amountXof: 5000, reason: "Article endommagé à la réception" });
    expect(partial.status).toBe(201);
    expect(partial.json.data).toMatchObject({ status: "succeeded", mode: "automatic", reference: expect.stringMatching(/^RMB-\d{4}-\d{6}$/) });
    const [escrow] = await rows<{ amount_xof: number; seller_net_xof: number; commission_xof: number }>(sql`select amount_xof, seller_net_xof, commission_xof from escrow_entries where order_id = ${lampOrder}`);
    expect(escrow.amount_xof).toBe(15000);
    expect(escrow.commission_xof + escrow.seller_net_xof).toBe(15000);
    const over = await admin("POST", `/admin/orders/${lampOrder}/refunds`, { amountXof: 15001, reason: "Trop remboursé" });
    expect(over.status).toBe(422);
    const rest = await admin("POST", `/admin/orders/${lampOrder}/refunds`, { amountXof: 15000, reason: "Remboursement du solde", closeOrder: true });
    expect(rest.json.data.status).toBe("succeeded");
    const [payment] = await rows<{ status: string; refunded_amount_xof: number }>(sql`select status, refunded_amount_xof from payments where order_id = ${lampOrder}`);
    expect(payment).toEqual({ status: "refunded", refunded_amount_xof: 20000 });
    const [order] = await rows<{ status: string }>(sql`select status from orders where id = ${lampOrder}`);
    expect(order.status).toBe("refunded");
    const [after] = await rows<{ status: string }>(sql`select status from escrow_entries where order_id = ${lampOrder}`);
    expect(after.status).toBe("refunded");
  });
});

describe("refus, nouvelle tentative et virement", () => {
  it("laisse la commande payable après un refus, puis bascule sur un virement confirmé par l'équipe", async () => {
    const placed = await checkout([{ productId: lamp, quantity: 1 }], "orange_money");
    const first = placed.json.data.payment.reference;
    const orderId = placed.json.data.orders[0].id;
    const refused = await webhook({ eventId: "evt-refused", reference: first, status: "failed", amountXof: 10000, currency: "XOF" });
    expect(refused.json.result).toBe("failed");
    const [order] = await rows<{ status: string }>(sql`select status from orders where id = ${orderId}`);
    expect(order.status).toBe("awaiting_payment");

    const retry = await shop("POST", `/shop/orders/${orderId}/pay`, { key: "retry-awa-0001", body: { method: "bank_transfer" } });
    expect(retry.status).toBe(200);
    expect(retry.json.data).toMatchObject({ method: "bank_transfer", provider: "manual", status: "pending", instructions: { kind: "bank_transfer", iban: "CI93 CI00 0000 0000 0000 0000 0000", amountXof: 10000 } });
    expect(retry.json.data.instructions.reference).toBe(retry.json.data.reference);
    const [deadline] = await rows<{ payment_expires_at: string }>(sql`select payment_expires_at from orders where id = ${orderId}`);
    expect(new Date(deadline.payment_expires_at).getTime() - Date.now()).toBeGreaterThan(70 * 3_600_000);

    // Un autre moyen ne se confirme pas manuellement ; le montant reçu doit être exact.
    const wrong = await admin("POST", `/admin/payments/${retry.json.data.reference}/confirm`, { amountXof: 9000 });
    expect(wrong.status).toBe(422);
    const confirmed = await admin("POST", `/admin/payments/${retry.json.data.reference}/confirm`, { providerReference: "VIR-2026-001", note: "Virement reçu" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.data.status).toBe("succeeded");
    const [paid] = await rows<{ status: string }>(sql`select status from orders where id = ${orderId}`);
    expect(paid.status).toBe("paid_escrow");
    const notManual = await admin("POST", `/admin/payments/${first}/confirm`, {});
    expect(notManual.status).toBe(422);
  });

  it("annule le paiement concurrent quand une autre tentative règle la commande", async () => {
    const placed = await checkout([{ productId: bag, quantity: 1 }], "orange_money");
    const first = placed.json.data.payment.reference;
    const orderId = placed.json.data.orders[0].id;
    const transfer = await shop("POST", `/shop/orders/${orderId}/pay`, { key: "retry-awa-0002", body: { method: "bank_transfer" } });
    expect(transfer.json.data.status).toBe("pending");
    // Le paiement mobile money, annulé par la nouvelle tentative, aboutit finalement chez le prestataire.
    const late = await webhook({ eventId: "evt-first-wins", reference: first, status: "paid", amountXof: 5000, currency: "XOF" });
    expect(late.json.result).toBe("late_paid");
    const [order] = await rows<{ status: string }>(sql`select status from orders where id = ${orderId}`);
    expect(order.status).toBe("paid_escrow");
    const [pendingTransfer] = await rows<{ status: string }>(sql`select status from payment_intents where reference = ${transfer.json.data.reference}`);
    expect(pendingTransfer.status).toBe("cancelled");
  });
});

describe("paiement à la livraison", () => {
  it("sans délai, préparé avant paiement, vendeur réglé seulement après encaissement", async () => {
    const placed = await checkout([{ productId: bag, quantity: 2 }], "cash_on_delivery");
    expect(placed.status).toBe(201);
    expect(placed.json.data.payment.instructions.kind).toBe("cash_on_delivery");
    const orderId = placed.json.data.orders[0].id;
    const [order] = await rows<{ payment_expires_at: string | null }>(sql`select payment_expires_at from orders where id = ${orderId}`);
    expect(order.payment_expires_at).toBeNull();

    const detail = await admin("GET", `/admin/orders/${orderId}`);
    expect(detail.json.data.nextStatuses.map((entry: { status: string }) => entry.status)).toContain("seller_confirmed");
    for (const status of ["seller_confirmed", "shipped", "arrived_abidjan", "delivered"]) {
      const changed = await admin("POST", `/admin/orders/${orderId}/status`, { status });
      expect(changed.status, status).toBe(200);
    }
    const blocked = await admin("POST", `/admin/orders/${orderId}/status`, { status: "seller_paid" });
    expect(blocked.status).toBe(422);
    const collected = await admin("POST", `/admin/payments/${placed.json.data.payment.reference}/confirm`, { note: "Espèces encaissées par le livreur" });
    expect(collected.json.data.status).toBe("succeeded");
    const [escrow] = await rows<{ status: string }>(sql`select status from escrow_entries where order_id = ${orderId}`);
    expect(escrow.status).toBe("eligible");
    expect((await admin("POST", `/admin/orders/${orderId}/status`, { status: "seller_paid" })).status).toBe(200);
  });

  it("une commande payée par prestataire ne peut pas sauter le paiement", async () => {
    const placed = await checkout([{ productId: bag, quantity: 1 }], "card");
    const skipped = await admin("POST", `/admin/orders/${placed.json.data.orders[0].id}/status`, { status: "seller_confirmed" });
    expect(skipped.status).toBe(422);
  });
});

describe("expiration, rapprochement et paiement tardif", () => {
  it("vérifie auprès du prestataire avant d'annuler, annule les impayées, et traite un paiement tardif", async () => {
    const paidLate = await checkout([{ productId: lamp, quantity: 1 }], "mtn_momo");
    const unpaid = await checkout([{ productId: lamp, quantity: 3 }], "card");
    const paidRef = paidLate.json.data.payment.reference;
    const unpaidRef = unpaid.json.data.payment.reference;
    const ids = [paidLate.json.data.orders[0].id, unpaid.json.data.orders[0].id];
    await db.execute(sql`update orders set payment_expires_at = now() - interval '1 minute' where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    // La notification de ce paiement s'est perdue, mais le prestataire le sait réglé.
    MockGateway.setRemoteStatus(paidRef, "succeeded", 10000);
    const [{ quantity: before }] = await rows<{ quantity: number }>(sql`select quantity from products where id = ${lamp}`);

    const result = await expireOverduePayments(db, new Date(), 50);
    // Les deux paiements en attente sont vérifiés ; seul l'impayé est annulé.
    expect(result).toMatchObject({ examined: 2, checked: 2, expired: 1 });
    const statuses = await rows<{ id: string; status: string }>(sql`select id, status from orders where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    expect(statuses.find((row) => row.id === ids[0])?.status).toBe("paid_escrow");
    expect(statuses.find((row) => row.id === ids[1])?.status).toBe("cancelled");
    const [{ quantity: afterQty }] = await rows<{ quantity: number }>(sql`select quantity from products where id = ${lamp}`);
    expect(afterQty).toBe(before + 3);
    const [expiredIntent] = await rows<{ status: string }>(sql`select status from payment_intents where reference = ${unpaidRef}`);
    expect(expiredIntent.status).toBe("expired");

    // Le client a finalement payé la commande annulée : pas de relance, remboursement à faire.
    const late = await webhook({ eventId: "evt-late", reference: unpaidRef, status: "paid", amountXof: 30000, currency: "XOF" });
    expect(late.json.result).toBe("late_paid");
    const [escrow] = await rows<{ status: string }>(sql`select status from escrow_entries where order_id = ${ids[1]}`);
    expect(escrow.status).toBe("refund_pending");
    const [{ n }] = await rows<{ n: number }>(sql`select count(*)::int as n from domain_events where name = 'payment.refund_required'`);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
