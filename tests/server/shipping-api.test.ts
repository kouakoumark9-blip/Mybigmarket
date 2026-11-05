/**
 * Livraison de bout en bout sur PostgreSQL (PGlite) : transporteurs, zones et grilles par zone,
 * devis du panier, transporteur exigé ou « à confirmer », livraison offerte, points relais, lots de
 * groupage répercutés sur les commandes, suivi client et suivi sans compte.
 */
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));
vi.mock("@/lib/session-account", () => ({ assertActiveAccount: async () => undefined }));

const SELLER_A = "30000000-0000-4000-8000-0000000000a1";
const SELLER_B = "30000000-0000-4000-8000-0000000000a2";
const BUYER = "30000000-0000-4000-8000-0000000000b1";
const SECRET = "secret-webhook-livraison";

let db: Db;
let token: string;
let lamp: string;
let bag: string;
let zoneCI: string;
let zoneSN: string;
let air: string;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const shop = (method: string, path: string, options: { body?: unknown; key?: string } = {}) => api(method, path, { body: options.body, headers: options.key ? { "idempotency-key": options.key } : {} });
const delivery = { method: "delivery", countryCode: "CI", language: "fr", address: { name: "Awa Koné", phone: "+225 07 00 00 00 01", address: "Rue des Jardins, Cocody", city: "Abidjan" } };
let keyCounter = 0;
async function checkout(lines: Array<{ productId: string; quantity: number }>, deliveryExtra: Record<string, unknown> = {}) {
  await shop("DELETE", "/shop/cart");
  for (const line of lines) await shop("POST", "/shop/cart/items", { body: line });
  return shop("POST", "/shop/checkout", { key: `ship-test-${String(++keyCounter).padStart(4, "0")}`, body: { delivery: { ...delivery, ...deliveryExtra }, paymentMethod: "wave" } });
}
async function pay(reference: string, amountXof: number) {
  const { POST } = await import("@/app/api/webhooks/payments/[provider]/route");
  const raw = JSON.stringify({ eventId: `evt-${reference}`, reference, status: "paid", amountXof, currency: "XOF" });
  const response = await POST(new Request("http://shop.test/api/webhooks/payments/mock", { method: "POST", body: raw, headers: { "x-afm-signature": createHmac("sha256", SECRET).update(raw).digest("hex") } }), { params: Promise.resolve({ provider: "mock" }) });
  return response.json();
}

beforeAll(async () => {
  process.env.MOCK_WEBHOOK_SECRET = SECRET;
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values
    (${SELLER_A}, 'Atelier A', 'a@vendeurs.ci', 'x', 'seller'), (${SELLER_B}, 'Atelier B', 'b@vendeurs.ci', 'x', 'seller'), (${BUYER}, 'Awa Koné', 'awa@exemple.ci', 'x', 'buyer')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER_A}, 'U', 'Yiwu', 'approved'), (${SELLER_B}, 'U', 'Canton', 'approved')`);
  const categoryId = (await admin("POST", "/admin/categories", { name: "Maison" })).json.data.id;
  // 2 kg et 1 kg, petits colis : le poids réel l'emporte sur le poids volumétrique.
  lamp = (await admin("POST", "/admin/products", { title: "Lampe de bureau", sellerId: SELLER_A, categoryId, priceXof: 10000, status: "approved", initialQuantity: 50, weightGrams: 2000, lengthMm: 200, widthMm: 150, heightMm: 100 })).json.data.id;
  bag = (await admin("POST", "/admin/products", { title: "Sac cabas", sellerId: SELLER_B, categoryId, priceXof: 5000, status: "approved", initialQuantity: 50, weightGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 50 })).json.data.id;
  session.current = { user: { id: BUYER, role: "buyer", email: "awa@exemple.ci" } };
});

describe("transporteurs, zones et grilles", () => {
  it("crée zones et transporteur, refuse une grille à trous, devient facturable avec une grille réelle", async () => {
    zoneCI = (await admin("POST", "/admin/shipping/zones", { code: "ci", name: "Côte d'Ivoire", countryCodes: ["ci"] })).json.data.id;
    zoneSN = (await admin("POST", "/admin/shipping/zones", { code: "sn", name: "Sénégal", countryCodes: ["SN"] })).json.data.id;
    const created = await admin("POST", "/admin/shipping/methods", { code: "air-express", mode: "air", name: "Avion express", isActive: true, sampleRatesOnly: false, transitDaysMin: 7, transitDaysMax: 12, minimumBillableWeightKg: 0.5, trackingUrlPattern: "https://suivi.transporteur.test/colis?n={tracking}" });
    expect(created.status).toBe(201);
    air = created.json.data.id;
    const gap = await admin("PUT", `/admin/shipping/methods/${air}/rates`, { zoneId: zoneCI, rates: [{ minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 5000 }, { minimumBillableUnits: 6, maximumBillableUnits: null, rateXofPerUnit: 4000 }] });
    expect(gap.status).toBe(400);
    const ci = await admin("PUT", `/admin/shipping/methods/${air}/rates`, { zoneId: zoneCI, rates: [{ minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 5000, label: "0–5 kg" }, { minimumBillableUnits: 5, maximumBillableUnits: null, rateXofPerUnit: 4000, label: "5 kg et plus" }] });
    expect(ci.json.data.rates).toHaveLength(2);
    // Sénégal : grille deux fois plus chère.
    await admin("PUT", `/admin/shipping/methods/${air}/rates`, { zoneId: zoneSN, rates: [{ minimumBillableUnits: 0, maximumBillableUnits: null, rateXofPerUnit: 10000 }] });
    // Un transporteur bateau à tarifs d'exemple : jamais facturé.
    const sea = (await admin("POST", "/admin/shipping/methods", { code: "sea-sample", mode: "sea", name: "Bateau (exemple)", isActive: true, transitDaysMin: 35, transitDaysMax: 60 })).json.data.id;
    await admin("PUT", `/admin/shipping/methods/${sea}/rates`, { zoneId: zoneCI, rates: [{ minimumBillableUnits: 0, maximumBillableUnits: null, rateXofPerUnit: 100000, sampleOnly: true }] });
    const list = await admin("GET", "/admin/shipping/methods");
    expect(list.json.data.find((entry: { code: string }) => entry.code === "air-express")).toMatchObject({ billable: true });
    expect(list.json.data.find((entry: { code: string }) => entry.code === "sea-sample")).toMatchObject({ billable: false });
  });

  it("chiffre chaque zone avec sa propre grille (tranches non mélangées)", async () => {
    const ci = await admin("POST", "/admin/shipping/quote", { countryCode: "CI", lines: [{ productId: lamp, quantity: 1 }] });
    const sn = await admin("POST", "/admin/shipping/quote", { countryCode: "SN", lines: [{ productId: lamp, quantity: 1 }] });
    const price = (quote: { options: Array<{ methodCode: string; baseRateXof: number }> }) => quote.options.find((option) => option.methodCode === "air-express")!.baseRateXof;
    expect(price(ci.json.data)).toBe(10000);
    expect(price(sn.json.data)).toBe(20000);
    const legacy = await (await import("@/app/api/transport/devis/route")).POST(new Request("http://shop.test/api/transport/devis", { method: "POST", body: JSON.stringify({ countryCode: "SN", lines: [{ productId: lamp, quantity: 1 }] }), headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" } }));
    const legacyJson = await legacy.json();
    expect(legacyJson.options.find((option: { methodCode: string }) => option.methodCode === "air-express").baseRateXof).toBe(20000);
  });
});

describe("transport au passage de commande", () => {
  it("devise le panier par vendeur et propose les transporteurs facturables communs", async () => {
    await shop("DELETE", "/shop/cart");
    await shop("POST", "/shop/cart/items", { body: { productId: lamp, quantity: 1 } });
    await shop("POST", "/shop/cart/items", { body: { productId: bag, quantity: 2 } });
    const quote = await shop("POST", "/shop/shipping/quote", { body: { countryCode: "CI", city: "Abidjan" } });
    expect(quote.status).toBe(200);
    expect(quote.json.data.groups).toHaveLength(2);
    // Lampe 2 kg → 10 000 ; sacs 2 × 1 kg → 10 000.
    expect(quote.json.data.methods).toEqual([expect.objectContaining({ code: "air-express", totalXof: 20000, transitDaysMax: 12 })]);
    expect(quote.json.data.requiresChoice).toBe(true);
  });

  it("exige un transporteur facturable, refuse un code inconnu, facture le transport par commande", async () => {
    const missing = await checkout([{ productId: lamp, quantity: 1 }, { productId: bag, quantity: 2 }]);
    expect(missing.status).toBe(422);
    expect(missing.json.error.details).toMatchObject({ reason: "shipping_method_required", methods: ["air-express"] });
    const unknown = await checkout([{ productId: lamp, quantity: 1 }], { shippingMethodCode: "sea-sample" });
    expect(unknown.status).toBe(422);
    expect(unknown.json.error.details.reason).toBe("shipping_method_unavailable");

    const placed = await checkout([{ productId: lamp, quantity: 1 }, { productId: bag, quantity: 2 }], { shippingMethodCode: "air-express" });
    expect(placed.status).toBe(201);
    expect(placed.json.data.totals).toMatchObject({ shippingXof: 20000, totalXof: 40000 });
    expect(placed.json.data.payment.amountXof).toBe(40000);
    const orderRows = await rows<{ shipping_cost_xof: number; total_xof: number; shipping_mode: string; shipping_method_id: string }>(sql`select shipping_cost_xof, total_xof, shipping_mode, shipping_method_id from orders where checkout_group_id = ${placed.json.data.checkoutGroupId} order by total_xof`);
    expect(orderRows.map((row) => [row.shipping_cost_xof, row.total_xof])).toEqual([[10000, 20000], [10000, 20000]]);
    expect(orderRows.every((row) => row.shipping_mode === "air" && row.shipping_method_id === air)).toBe(true);
  });

  it("offre la livraison avec un bon, et passe en « à confirmer » si aucun transporteur n'est exigé", async () => {
    await admin("POST", "/admin/vouchers", { code: "PORTOFFERT", discountType: "none", freeShipping: true });
    await shop("DELETE", "/shop/cart");
    await shop("POST", "/shop/cart/items", { body: { productId: lamp, quantity: 1 } });
    await shop("PUT", "/shop/cart/vouchers", { body: { codes: ["PORTOFFERT"] } });
    const free = await shop("POST", "/shop/checkout", { key: "ship-free-0001", body: { delivery: { ...delivery, shippingMethodCode: "air-express" }, paymentMethod: "wave" } });
    expect(free.status).toBe(201);
    expect(free.json.data.totals).toMatchObject({ shippingXof: 0, totalXof: 10000 });

    await admin("PATCH", "/admin/settings", { values: { "shipping.require_billable_method": false } });
    const pending = await checkout([{ productId: bag, quantity: 1 }]);
    expect(pending.status).toBe(201);
    expect(pending.json.data.shipping).toEqual([expect.objectContaining({ costXof: 0, toConfirm: true })]);
    await admin("PATCH", "/admin/settings", { values: { "shipping.require_billable_method": true } });
  });

  it("gère les points relais et s'en sert pour la zone de livraison", async () => {
    const point = await admin("POST", "/admin/pickup-points", { name: "Relais Plateau", city: "Abidjan", address: "Avenue Chardy, Plateau", openingHours: "Lun–Sam 9h–18h" });
    expect(point.status).toBe(201);
    const listed = await shop("GET", "/shop/pickup-points?city=abidjan");
    expect(listed.json.data.map((entry: { name: string }) => entry.name)).toEqual(["Relais Plateau"]);
    const placed = await checkout([{ productId: lamp, quantity: 1 }], { method: "pickup", address: null, pickupPointId: point.json.data.id, shippingMethodCode: "air-express" });
    expect(placed.status).toBe(201);
    expect(placed.json.data.totals.shippingXof).toBe(10000);
    const removed = await admin("DELETE", `/admin/pickup-points/${point.json.data.id}`);
    expect(removed.json.data).toEqual({ deleted: false, deactivated: true });
  });
});

describe("lots de groupage et suivi", () => {
  let orderId = "";
  let reference = "";

  it("n'accepte dans un lot que des commandes confirmées, puis répercute départ et arrivée", async () => {
    const placed = await checkout([{ productId: lamp, quantity: 2 }], { shippingMethodCode: "air-express" });
    orderId = placed.json.data.orders[0].id;
    reference = placed.json.data.orders[0].reference;
    expect((await pay(placed.json.data.payment.reference, placed.json.data.payment.amountXof)).result).toBe("paid");

    const batch = await admin("POST", "/admin/shipments", { mode: "air", carrierName: "Fret Express Chine", trackingNumber: "LTA-123-456", expectedArrivalAt: "2026-12-01T00:00:00Z" });
    expect(batch.status).toBe(201);
    expect(batch.json.data.batchRef).toMatch(/^LOT-\d{8}-\d{2}$/);
    const batchId = batch.json.data.id;
    const tooEarly = await admin("POST", `/admin/shipments/${batchId}/orders`, { orderIds: [orderId] });
    expect(tooEarly.status).toBe(422);
    await admin("POST", `/admin/orders/${orderId}/status`, { status: "seller_confirmed" });
    const added = await admin("POST", `/admin/shipments/${batchId}/orders`, { orderIds: [orderId] });
    expect(added.json.data).toMatchObject({ status: "collecting", orderCount: 1 });
    expect(added.json.data.orders[0].status).toBe("received_collection_point");
    const other = (await admin("POST", "/admin/shipments", { batchRef: "LOT-TEST-2" })).json.data.id;
    expect((await admin("POST", `/admin/shipments/${other}/orders`, { orderIds: [orderId] })).status).toBe(409);

    const [{ quantity: before }] = await rows<{ quantity: number }>(sql`select physical_quantity as quantity from stock_levels where product_id = ${lamp} and variant_id is null`);
    const shipped = await admin("POST", `/admin/shipments/${batchId}/status`, { status: "shipped" });
    expect(shipped.status).toBe(200);
    expect(shipped.json.data.orders[0].status).toBe("shipped");
    const [{ quantity: after }] = await rows<{ quantity: number }>(sql`select physical_quantity as quantity from stock_levels where product_id = ${lamp} and variant_id is null`);
    expect(before - after).toBe(2);
    const [order] = await rows<{ tracking_number: string; status: string }>(sql`select tracking_number, status from orders where id = ${orderId}`);
    expect(order).toMatchObject({ status: "shipped", tracking_number: "LTA-123-456" });
    expect((await admin("POST", `/admin/shipments/${batchId}/orders`, { orderIds: [orderId] })).status).toBe(422);
    const arrived = await admin("POST", `/admin/shipments/${batchId}/status`, { status: "arrived_abidjan" });
    expect(arrived.json.data.orders[0].status).toBe("arrived_abidjan");
    expect((await admin("POST", `/admin/shipments/${batchId}/status`, { status: "shipped" })).status).toBe(422);
    const [{ n }] = await rows<{ n: number }>(sql`select count(*)::int as n from domain_events where name = 'shipment.status_changed'`);
    expect(n).toBe(2);
  });

  it("donne au client un suivi daté avec transporteur, lien de suivi et lot", async () => {
    const tracking = await shop("GET", `/shop/orders/${reference}/tracking`);
    expect(tracking.status).toBe(200);
    expect(tracking.json.data).toMatchObject({
      status: "arrived_abidjan", carrier: { code: "air-express", mode: "air" }, trackingNumber: "LTA-123-456",
      trackingUrl: "https://suivi.transporteur.test/colis?n=LTA-123-456", shipment: { status: "arrived_abidjan", expectedArrivalAt: "2026-12-01T00:00:00.000Z" },
    });
    expect(tracking.json.data.timeline.map((entry: { status: string }) => entry.status)).toEqual(["awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan"]);
    expect(tracking.json.data.delivery.city).toBe("Abidjan");
  });

  it("permet le suivi sans compte avec référence et e-mail, sans exposer l'adresse", async () => {
    session.current = null;
    const ok = await shop("POST", "/shop/tracking", { body: { reference: reference.toLowerCase(), email: "AWA@exemple.ci" } });
    expect(ok.status).toBe(200);
    expect(ok.json.data.status).toBe("arrived_abidjan");
    expect(JSON.stringify(ok.json.data)).not.toContain("Rue des Jardins");
    const wrong = await shop("POST", "/shop/tracking", { body: { reference, email: "autre@exemple.ci" } });
    expect(wrong.status).toBe(404);
    session.current = { user: { id: BUYER, role: "buyer", email: "awa@exemple.ci" } };
  });

  it("construit le lien de suivi à partir du motif du transporteur", async () => {
    const placed = await checkout([{ productId: bag, quantity: 1 }], { shippingMethodCode: "air-express" });
    const updated = await admin("PUT", `/admin/orders/${placed.json.data.orders[0].id}/shipping`, { trackingNumber: "COLIS 42" });
    expect(updated.json.data.trackingUrl).toBe("https://suivi.transporteur.test/colis?n=COLIS%2042");
  });
});
