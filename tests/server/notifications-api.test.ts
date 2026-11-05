/**
 * Notifications de bout en bout (PGlite) : un événement métier met l'e-mail en file une seule fois,
 * la file l'envoie (transport de test à la place du SMTP), avec mise en page, variables échappées,
 * modèle personnalisé, nouvel essai en cas d'échec, et WhatsApp en option.
 */
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import { setTransportsForTests, type EmailMessage, type WhatsAppMessage } from "@/lib/notifications/transports";
import type { Db } from "@/server/core/db";
import { dispatchPendingEvents, runAfterDispatchHooks } from "@/server/core/events";
import { processEmailQueue } from "@/server/modules/notifications/service";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));
vi.mock("@/lib/session-account", () => ({ assertActiveAccount: async () => undefined }));

const SELLER_A = "40000000-0000-4000-8000-0000000000a1";
const SELLER_B = "40000000-0000-4000-8000-0000000000a2";
const BUYER = "40000000-0000-4000-8000-0000000000b1";
const SECRET = "secret-webhook-notifications";

let db: Db;
let token: string;
let lamp: string;
let bag: string;
const sent: EmailMessage[] = [];
const whatsapp: WhatsAppMessage[] = [];
let failNext = 0;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const shop = (method: string, path: string, options: { body?: unknown; key?: string } = {}) => api(method, path, { body: options.body, headers: options.key ? { "idempotency-key": options.key } : {} });
const flush = async () => { await dispatchPendingEvents(db, { limit: 200 }); await runAfterDispatchHooks(db); };
const delivery = { method: "delivery", countryCode: "CI", language: "fr", address: { name: "Awa Koné", phone: "07 00 00 00 01", address: "Rue des Jardins, Cocody", city: "Abidjan" } };
let keyCounter = 0;
async function checkout(lines: Array<{ productId: string; quantity: number }>) {
  await shop("DELETE", "/shop/cart");
  for (const line of lines) await shop("POST", "/shop/cart/items", { body: line });
  return shop("POST", "/shop/checkout", { key: `notif-test-${String(++keyCounter).padStart(4, "0")}`, body: { delivery, paymentMethod: "wave" } });
}
async function pay(reference: string, amountXof: number) {
  const { POST } = await import("@/app/api/webhooks/payments/[provider]/route");
  const raw = JSON.stringify({ eventId: `evt-${reference}`, reference, status: "paid", amountXof, currency: "XOF" });
  await POST(new Request("http://shop.test/api/webhooks/payments/mock", { method: "POST", body: raw, headers: { "x-afm-signature": createHmac("sha256", SECRET).update(raw).digest("hex") } }), { params: Promise.resolve({ provider: "mock" }) });
}

beforeAll(async () => {
  process.env.MOCK_WEBHOOK_SECRET = SECRET;
  process.env.SMTP_FROM = "commandes@mybigmarket.test";
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  setTransportsForTests({
    email: { name: "test", async send(message) { if (failNext > 0) { failNext--; throw new Error("SMTP indisponible"); } sent.push(message); return { messageId: `m${sent.length}` }; } },
    whatsapp: { name: "test-whatsapp", async send(message) { whatsapp.push(message); return { messageId: `w${whatsapp.length}` }; } },
  });
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values
    (${SELLER_A}, 'Atelier A', 'a@vendeurs.ci', 'x', 'seller'), (${SELLER_B}, 'Atelier B', 'b@vendeurs.ci', 'x', 'seller'), (${BUYER}, 'Awa <b>Koné</b>', 'awa@exemple.ci', 'x', 'buyer')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER_A}, 'U', 'Yiwu', 'approved'), (${SELLER_B}, 'U', 'Canton', 'approved')`);
  const categoryId = (await admin("POST", "/admin/categories", { name: "Maison" })).json.data.id;
  lamp = (await admin("POST", "/admin/products", { title: "Lampe de bureau", sellerId: SELLER_A, categoryId, priceXof: 10000, status: "approved", initialQuantity: 50 })).json.data.id;
  bag = (await admin("POST", "/admin/products", { title: "Sac cabas", sellerId: SELLER_B, categoryId, priceXof: 5000, status: "approved", initialQuantity: 50 })).json.data.id;
  await admin("PATCH", "/admin/settings", { values: { "store.name": "MyBigMarket", "store.email": "contact@mybigmarket.test", "email.admin_notification_address": "equipe@mybigmarket.test" } });
  session.current = { user: { id: BUYER, role: "buyer", email: "awa@exemple.ci" } };
});

describe("confirmation de commande", () => {
  let reference = "";

  it("envoie un seul récapitulatif par passage en caisse, via la file, et alerte l'équipe", async () => {
    const placed = await checkout([{ productId: lamp, quantity: 2 }, { productId: bag, quantity: 1 }]);
    expect(placed.status).toBe(201);
    reference = placed.json.data.payment.reference;
    expect(sent).toHaveLength(0);
    await flush();
    const customer = sent.filter((message) => message.to === "awa@exemple.ci");
    expect(customer).toHaveLength(1);
    const [first, second] = placed.json.data.orders.map((order: { reference: string }) => order.reference).sort();
    expect(customer[0].subject).toBe(`Votre commande ${first}, ${second} est enregistrée`);
    expect(customer[0].html).toContain("Lampe de bureau");
    expect(customer[0].html).toContain("25 000 FCFA");
    expect(customer[0].html).toContain("#ff8000");
    // Le nom saisi par le client est échappé, jamais interprété.
    expect(customer[0].html).toContain("Awa &lt;b&gt;Koné&lt;/b&gt;");
    expect(customer[0].html).not.toContain("<b>Koné</b>");
    expect(customer[0].from).toBe('"mybigmarket" <commandes@mybigmarket.test>');
    expect(sent.filter((message) => message.to === "equipe@mybigmarket.test").map((message) => message.subject)).toEqual([`Nouvelle commande ${first}, ${second} — 25 000 FCFA`]);
    const queue = await rows<{ status: string; template_code: string }>(sql`select status, template_code from email_queue order by created_at`);
    expect(queue.every((row) => row.status === "sent")).toBe(true);
  });

  it("ne renvoie rien si l'événement est redistribué", async () => {
    const before = sent.length;
    await db.execute(sql`update domain_events set status = 'pending', available_at = now() - interval '1 second' where name = 'order.created'`);
    await flush();
    expect(sent.length).toBe(before);
  });

  it("confirme le paiement une fois pour tout le panier, puis l'expédition avec le suivi", async () => {
    await pay(reference, 25000);
    await flush();
    const payments = sent.filter((message) => message.subject.startsWith("Paiement reçu"));
    expect(payments).toHaveLength(1);
    expect(payments[0].html).toContain("25 000 FCFA");

    const orderId = (await rows<{ id: string }>(sql`select o.id from orders o join order_items i on i.order_id = o.id where i.product_id = ${lamp} order by o.created_at desc limit 1`))[0].id;
    await admin("POST", `/admin/orders/${orderId}/status`, { status: "seller_confirmed" });
    await admin("POST", `/admin/orders/${orderId}/status`, { status: "shipped", trackingNumber: "LTA-999" });
    await flush();
    const shipped = sent.filter((message) => message.subject.includes("est en route"));
    expect(shipped).toHaveLength(1);
    expect(shipped[0].html).toContain("LTA-999");
  });
});

describe("file d'envoi", () => {
  it("garde les e-mails en file sans SMTP, puis les envoie, avec nouvel essai en cas d'échec", async () => {
    setTransportsForTests({ email: null });
    await admin("POST", "/admin/emails/test", { to: "test@mybigmarket.test" });
    const [pending] = await rows<{ id: string; status: string }>(sql`select id, status from email_queue where to_address = 'test@mybigmarket.test'`);
    expect(pending.status).toBe("pending");
    expect(await processEmailQueue(db)).toMatchObject({ skipped: "no_config" });

    setTransportsForTests({ email: { name: "test", async send(message) { if (failNext > 0) { failNext--; throw new Error("SMTP indisponible"); } sent.push(message); return { messageId: null }; } } });
    failNext = 1;
    expect(await processEmailQueue(db)).toMatchObject({ processed: 1, failed: 1 });
    const [retrying] = await rows<{ status: string; attempts: number; last_error: string }>(sql`select status, attempts, last_error from email_queue where id = ${pending.id}`);
    expect(retrying).toMatchObject({ status: "pending", attempts: 1, last_error: "SMTP indisponible" });
    await db.execute(sql`update email_queue set scheduled_at = now() - interval '1 second' where id = ${pending.id}`);
    expect(await processEmailQueue(db)).toMatchObject({ sent: 1 });
    expect(sent.at(-1)?.subject).toBe("Test d'envoi — MyBigMarket");
    const list = await admin("GET", "/admin/emails?filter[status]=sent");
    expect(list.json.data.length).toBeGreaterThanOrEqual(4);
  });
});

describe("modèles", () => {
  it("liste les modèles livrés, publie un modèle personnalisé, prévisualise et revient au modèle livré", async () => {
    const list = await admin("GET", "/admin/email-templates");
    expect(list.json.data.map((entry: { code: string }) => entry.code)).toEqual(expect.arrayContaining(["order_confirmation", "payment_confirmed", "order_shipped", "refund_completed", "form_submission"]));
    const saved = await admin("PUT", "/admin/email-templates/order_shipped", { subject: "📦 {{orderReference}} est parti !", bodyHtml: "<p>Bonjour {{customerName}}, suivi : {{trackingNumber}} {{variableInconnue}}</p>", status: "active" });
    expect(saved.json.data).toMatchObject({ source: "database", unknownVariables: ["variableInconnue"] });
    const preview = await admin("POST", "/admin/email-templates/order_shipped/preview", {});
    expect(preview.json.data.subject).toBe("📦 CMD-2026-000123 est parti !");
    expect(preview.json.data.html).toContain("LTA-123-456");

    const placed = await checkout([{ productId: bag, quantity: 1 }]);
    await pay(placed.json.data.payment.reference, 5000);
    const orderId = placed.json.data.orders[0].id;
    await admin("POST", `/admin/orders/${orderId}/status`, { status: "seller_confirmed" });
    await admin("POST", `/admin/orders/${orderId}/status`, { status: "shipped", trackingNumber: "LTA-777" });
    await flush();
    expect(sent.at(-1)?.subject).toBe(`📦 ${placed.json.data.orders[0].reference} est parti !`);

    const reverted = await admin("DELETE", "/admin/email-templates/order_shipped?locale=fr");
    expect(reverted.json.data.source).toBe("built_in");
  });
});

describe("WhatsApp", () => {
  it("envoie le modèle WhatsApp associé, au numéro international du client", async () => {
    const config = { email: { enabled: true }, whatsapp: { enabled: true, templates: { order_confirmation: { name: "commande_enregistree", language: "fr", parameters: ["orderReference", "orderTotal"] } } }, disabled: [], adminAlerts: false };
    expect((await admin("PATCH", "/admin/modules/customer-notifications", { config })).status).toBe(200);
    const placed = await checkout([{ productId: lamp, quantity: 1 }]);
    await flush();
    expect(whatsapp).toEqual([{ to: "+2250700000001", templateName: "commande_enregistree", language: "fr", parameters: [placed.json.data.orders[0].reference, "10 000 FCFA"] }]);
    const messages = await admin("GET", "/admin/whatsapp-messages");
    expect(messages.json.data[0]).toMatchObject({ status: "sent", channel: "whatsapp", toAddress: "+2250700000001" });
  });
});
