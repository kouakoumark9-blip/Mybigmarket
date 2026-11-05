/**
 * Service client de bout en bout (PGlite) : demande ouverte par un client connecté ou sans compte
 * (lien signé), formulaire de contact transformé en ticket, file de traitement, notes internes
 * invisibles du client, réponses et e-mails, réouverture, satisfaction, modèles de réponse,
 * assignation (droits), délai de première réponse et clôture automatique.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { dispatchPendingEvents } from "@/server/core/events";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

const BUYER = "60000000-0000-4000-8000-0000000000f1";
const AWA = { user: { id: BUYER, role: "buyer", email: "awa@clients.ci" } };
let db: Db;
let token: string;
let supportToken: string;
let readOnlyToken: string;
let ticketId: string;
let reference: string;
const admin = (method: string, path: string, body?: unknown, bearer = token) => api(method, path, { token: bearer, body });
const shop = (method: string, path: string, body?: unknown) => api(method, path, { body, ip: "198.51.100.77" });
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const queued = async (code: string) => rows<{ to_address: string; subject: string }>(sql`select to_address, subject from email_queue where template_code = ${code} order by created_at`);

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  process.env.SUPPORT_LINK_SECRET = "support-link-secret-for-tests-0123456789";
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await createEmployeeRow(db, { email: "support@mybigmarket.test", password: ADMIN_PASSWORD, roleCode: "customer_service" });
  supportToken = (await loginAs("support@mybigmarket.test", ADMIN_PASSWORD)).accessToken;
  await createEmployeeRow(db, { email: "lecture@mybigmarket.test", password: ADMIN_PASSWORD, roleCode: "read_only" });
  readOnlyToken = (await loginAs("lecture@mybigmarket.test", ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${BUYER}, 'Awa Koné', 'awa@clients.ci', 'x', 'buyer')`);
  await db.execute(sql`insert into orders (buyer_id, total_xof, status, reference) values (${BUYER}, 45000, 'shipped', 'CMD-2026-000777')`);
  await admin("PATCH", "/admin/settings", { values: { "email.admin_notification_address": "equipe@mybigmarket.test" } });
});

describe("demandes des clients", () => {
  it("ouvre une demande depuis l'espace client, rattachée à sa commande, avec accusé de réception et alerte à l'équipe", async () => {
    session.current = AWA;
    const created = await shop("POST", "/shop/support/tickets", { subject: "Où est ma commande ?", category: "delivery", message: "Bonjour,\nmon colis n'est pas arrivé.", orderReference: "CMD-2026-000777" });
    expect(created.status).toBe(201);
    reference = created.json.data.reference;
    expect(reference).toMatch(/^TCK-\d{6}-[A-Z0-9]{6}$/);
    expect(created.json.data.accessKey).toBeNull();
    expect((await shop("POST", "/shop/support/tickets", { subject: "Autre", message: "Commande d'un autre client", orderReference: "CMD-2026-999999" })).status).toBe(400);
    await dispatchPendingEvents(db);
    expect(await queued("support_ticket_received")).toEqual([expect.objectContaining({ to_address: "awa@clients.ci", subject: `Votre demande ${reference} est bien reçue` })]);
    expect((await queued("support_new_ticket")).map((row) => row.to_address)).toEqual(["equipe@mybigmarket.test"]);
    const mine = await shop("GET", "/shop/support/tickets");
    expect(mine.json.data).toEqual([expect.objectContaining({ reference, status: "open", statusLabel: "À traiter" })]);
    session.current = null;
  });

  it("permet à un client sans compte de suivre et compléter sa demande par le lien signé", async () => {
    session.current = null;
    expect((await shop("POST", "/shop/support/tickets", { subject: "Question", message: "Sans coordonnées" })).status).toBe(400);
    const created = await shop("POST", "/shop/support/tickets", { subject: "Devenir vendeur", category: "seller", message: "Comment vendre chez vous ?", email: "yao@exemple.ci", name: "Yao" });
    const { reference: guestRef, accessKey } = created.json.data;
    expect(accessKey).toHaveLength(32);
    expect((await shop("GET", `/shop/support/tickets/${guestRef}`)).status).toBe(404);
    expect((await shop("GET", `/shop/support/tickets/${guestRef}?cle=${"x".repeat(32)}`)).status).toBe(404);
    const thread = await shop("GET", `/shop/support/tickets/${guestRef}?cle=${accessKey}`);
    expect(thread.json.data).toMatchObject({ reference: guestRef, canReply: true, messages: [{ from: "customer", body: "Comment vendre chez vous ?" }] });
    expect((await shop("POST", `/shop/support/tickets/${guestRef}/messages?cle=${accessKey}`, { body: "J'ajoute une précision." })).status).toBe(201);
  });

  it("crée un ticket par message du formulaire de contact, une seule fois", async () => {
    session.current = null;
    const sent = await shop("POST", "/shop/forms/contact", { name: "Fatou", email: "fatou@exemple.ci", subject: "Paiement", message: "Mon paiement Orange Money a échoué." });
    expect(sent.status).toBe(201);
    await dispatchPendingEvents(db);
    await dispatchPendingEvents(db);
    const tickets = await rows<{ channel: string; category: string; email: string }>(sql`select channel, category, email from support_tickets where email = 'fatou@exemple.ci'`);
    expect(tickets).toEqual([{ channel: "form", category: "payment", email: "fatou@exemple.ci" }]);
    // L'équipe est déjà prévenue par l'e-mail du formulaire : pas de deuxième alerte.
    expect((await queued("support_new_ticket")).length).toBe(2);
  });
});

describe("traitement par l'équipe", () => {
  it("affiche la file, la fiche complète et le tableau de bord", async () => {
    const list = await admin("GET", "/admin/support/tickets?filter[status]=open&sort=-createdAt");
    expect(list.json.meta.total).toBe(3);
    ticketId = list.json.data.find((ticket: { reference: string }) => ticket.reference === reference).id;
    const detail = await admin("GET", `/admin/support/tickets/${ticketId}`);
    expect(detail.json.data).toMatchObject({ reference, category: "delivery", customer: { name: "Awa Koné", recentOrders: [{ reference: "CMD-2026-000777" }] } });
    const unassigned = await admin("GET", "/admin/support/tickets?filter[assignedEmployeeId][null]=true");
    expect(unassigned.json.meta.total).toBe(3);
    const overview = await admin("GET", "/admin/support/overview");
    expect(overview.json.data).toMatchObject({ byStatus: { open: 3 }, unassigned: 3, overdue: 0 });
  });

  it("garde les notes internes invisibles du client et envoie les réponses par e-mail", async () => {
    const note = await admin("POST", `/admin/support/tickets/${ticketId}/messages`, { body: "Vérifier avec le transitaire.", internal: true }, supportToken);
    expect(note.status).toBe(201);
    const reply = await admin("POST", `/admin/support/tickets/${ticketId}/messages`, { body: "Bonjour Awa,\nvotre colis arrive demain." }, supportToken);
    expect(reply.status).toBe(201);
    const detail = (await admin("GET", `/admin/support/tickets/${ticketId}`)).json.data;
    expect(detail).toMatchObject({ status: "awaiting_customer", assignee: { name: expect.any(String) } });
    expect(detail.firstResponseAt).not.toBeNull();
    expect(detail.messages.map((message: { isInternal: boolean }) => message.isInternal)).toEqual([false, true, false]);
    await dispatchPendingEvents(db);
    const replies = await rows<{ to_address: string; body_html: string }>(sql`select to_address, body_html from email_queue where template_code = 'support_reply'`);
    expect(replies).toHaveLength(1);
    expect(replies[0].body_html).toContain("votre colis arrive demain");
    expect(replies[0].body_html).toContain(`/compte/support/${reference}?cle=`);
    session.current = AWA;
    const seen = await shop("GET", `/shop/support/tickets/${reference}`);
    expect(seen.json.data.messages.map((message: { from: string; body: string }) => [message.from, message.body])).toEqual([
      ["customer", "Bonjour,\nmon colis n'est pas arrivé."], ["team", "Bonjour Awa,\nvotre colis arrive demain."],
    ]);
    expect(JSON.stringify(seen.json.data)).not.toContain("transitaire");
    session.current = null;
  });

  it("rouvre le ticket à la réponse du client, puis le résout, l'évalue et refuse une réponse après clôture", async () => {
    session.current = AWA;
    await shop("POST", `/shop/support/tickets/${reference}/messages`, { body: "Merci, je l'ai bien reçu !" });
    expect((await admin("GET", `/admin/support/tickets/${ticketId}`)).json.data.status).toBe("open");
    expect((await shop("POST", `/shop/support/tickets/${reference}/rating`, { score: 5 })).status).toBe(422);
    await admin("PATCH", `/admin/support/tickets/${ticketId}`, { status: "resolved" }, supportToken);
    const rated = await shop("POST", `/shop/support/tickets/${reference}/rating`, { score: 5, comment: "Rapide et clair." });
    expect(rated.json.data).toEqual({ reference, satisfactionScore: 5 });
    // Clôture automatique des tickets résolus depuis plus de 7 jours.
    await db.execute(sql`update support_tickets set resolved_at = now() - interval '8 days' where id = ${ticketId}`);
    const run = await admin("POST", "/admin/tasks/support.auto_close/run");
    expect(run.json.data).toMatchObject({ status: "succeeded", result: { closed: 1 } });
    expect((await shop("POST", `/shop/support/tickets/${reference}/messages`, { body: "Encore une question" })).status).toBe(422);
    session.current = null;
    const overview = await admin("GET", "/admin/support/overview");
    expect(overview.json.data.last30Days).toMatchObject({ averageSatisfaction: 5, ratedTickets: 1 });
  });

  it("réserve l'assignation aux employés autorisés et signale les tickets en retard", async () => {
    const [{ id: other }] = await rows<{ id: string }>(sql`select id from support_tickets where email = 'yao@exemple.ci'`);
    const [{ id: agent }] = await rows<{ id: string }>(sql`select id from employees where email = 'support@mybigmarket.test'`);
    expect((await admin("PATCH", `/admin/support/tickets/${other}`, { assignedEmployeeId: agent }, readOnlyToken)).status).toBe(403);
    expect((await admin("PATCH", `/admin/support/tickets/${other}`, { assignedEmployeeId: agent }, supportToken)).json.data.assignee.id).toBe(agent);
    await db.execute(sql`update support_tickets set first_response_due_at = now() - interval '1 hour' where id = ${other}`);
    const overdue = await admin("GET", "/admin/support/tickets?overdue=1");
    expect(overdue.json.data.map((ticket: { id: string; overdue: boolean }) => [ticket.id, ticket.overdue])).toEqual([[other, true]]);
    const mine = await admin("GET", "/admin/support/tickets?mine=1&filter[status]=open", undefined, supportToken);
    expect(mine.json.data.map((ticket: { id: string }) => ticket.id)).toEqual([other]);
  });

  it("prépare une réponse depuis un modèle, compte son utilisation et gère les modèles", async () => {
    const templates = await admin("GET", "/admin/support/templates");
    expect(templates.json.data.map((template: { code: string }) => template.code)).toEqual(["accuse-reception", "commande-en-preparation", "suivi-livraison", "remboursement-en-cours", "cloture"]);
    const [{ id: fatouTicket }] = await rows<{ id: string }>(sql`select id from support_tickets where email = 'fatou@exemple.ci'`);
    const template = templates.json.data[0];
    const rendered = await admin("POST", `/admin/support/tickets/${fatouTicket}/templates/${template.id}/render`, undefined, supportToken);
    expect(rendered.json.data.body).toContain("Bonjour Fatou,");
    expect(rendered.json.data.body).toMatch(/TCK-\d{6}-[A-Z0-9]{6}/);
    expect(rendered.json.data.missingVariables).toEqual([]);
    await admin("POST", `/admin/support/tickets/${fatouTicket}/messages`, { body: rendered.json.data.body, templateId: template.id }, supportToken);
    expect((await admin("GET", "/admin/support/templates")).json.data[0].usageCount).toBe(1);
    const created = await admin("POST", "/admin/support/templates", { code: "delai-douane", title: "Délai de douane", body: "Bonjour {{customerName}}, votre colis est en douane." });
    expect(created.status).toBe(201);
    expect((await admin("POST", "/admin/support/templates", { code: "delai-douane", title: "Doublon", body: "x x" })).status).toBe(409);
    expect((await admin("PATCH", `/admin/support/templates/${created.json.data.id}`, { isActive: false })).json.data.isActive).toBe(false);
    expect((await admin("GET", "/admin/support/templates?active=1")).json.data).toHaveLength(5);
    // Supprimer un modèle demande « support.delete », que le rôle Support n'a pas.
    expect((await admin("DELETE", `/admin/support/templates/${created.json.data.id}`, undefined, supportToken)).status).toBe(403);
    expect((await admin("DELETE", `/admin/support/templates/${created.json.data.id}`)).status).toBe(204);
  });
});
