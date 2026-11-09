/**
 * CMS et SEO de bout en bout (PGlite) : pages à blocs (validation, publication, produits résolus,
 * renommage → 301), menus, formulaires (validation, piège anti-robots, notification), bannières,
 * redirections (boucle refusée, chaînes aplaties, route des adresses inconnues), rendu sûr du texte.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { isSafeHref, parseText } from "@/lib/cms/blocks";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { dispatchPendingEvents } from "@/server/core/events";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

const SELLER = "50000000-0000-4000-8000-0000000000a1";
let db: Db;
let token: string;
let lamp: string;
let pageId: string;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const shop = (method: string, path: string, body?: unknown, ip = "198.51.100.20") => api(method, path, { body, ip });
const digestOf = async (promise: Promise<unknown>) => { try { await promise; return "ok"; } catch (error) { return String((error as { digest?: string }).digest ?? error); } };

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER}, 'Atelier A', 'a@vendeurs.ci', 'x', 'seller')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER}, 'U', 'Yiwu', 'approved')`);
  const categoryId = (await admin("POST", "/admin/categories", { name: "Éclairage", slug: "eclairage" })).json.data.id;
  lamp = (await admin("POST", "/admin/products", { title: "Lampe de bureau", sellerId: SELLER, categoryId, priceXof: 10000, status: "approved", initialQuantity: 10 })).json.data.id;
  await admin("PATCH", "/admin/settings", { values: { "email.admin_notification_address": "equipe@mybigmarket.test" } });
});

describe("balisage du texte", () => {
  it("n'accepte que des liens sûrs et ne produit jamais de HTML brut", () => {
    expect(isSafeHref("/pages/a-propos")).toBe(true);
    expect(isSafeHref("https://exemple.ci")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.test")).toBe(false);
    const nodes = parseText("**Livraison** en *48 h*.\n\n- [Suivi](/compte/commandes)\n- [Piège](javascript:alert(1))\n\n<script>alert(1)</script>");
    expect(nodes[0]).toEqual({ kind: "paragraph", content: [{ text: "Livraison", bold: true }, { text: " en " }, { text: "48 h", italic: true }, { text: "." }] });
    expect(nodes[1]).toEqual({ kind: "list", items: [[{ text: "Suivi", href: "/compte/commandes" }], [{ text: "Piège" }]] });
  });

  it("échappe tout contenu saisi au rendu", async () => {
    const { PageBlocks } = await import("@/components/cms/page-blocks");
    const html = renderToStaticMarkup(createElement(PageBlocks, { blocks: [{ type: "text", text: "<script>alert(1)</script> [x](javascript:alert(1))" }, { type: "heading", text: "<img src=x onerror=alert(1)>", level: 2 }] }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("pages", () => {
  it("refuse un bloc invalide ou un lien dangereux", async () => {
    const bad = await admin("POST", "/admin/pages", { slug: "a-propos", title: "À propos", blocks: [{ type: "cta", title: "Go", label: "Cliquer", href: "javascript:alert(1)" }] });
    expect(bad.status).toBe(400);
    const badSlug = await admin("POST", "/admin/pages", { slug: "À propos", title: "À propos" });
    expect(badSlug.status).toBe(400);
  });

  it("publie une page à blocs et résout les produits pour la boutique", async () => {
    const created = await admin("POST", "/admin/pages", {
      slug: "livraison", title: "Livraison en Afrique de l'Ouest", status: "draft",
      blocks: [{ type: "heading", text: "Délais" }, { type: "text", text: "Comptez **7 à 12 jours** en avion." }, { type: "products", title: "Nos lampes", categorySlug: "eclairage", limit: 4 }, { type: "faq", items: [{ question: "Qui paie la douane ?", answer: "Elle est incluse dans le transport." }] }],
    });
    expect(created.status).toBe(201);
    pageId = created.json.data.id;
    expect(created.json.data.excerpt).toContain("Comptez");
    expect((await shop("GET", "/shop/pages/livraison")).status).toBe(404);
    await admin("PATCH", `/admin/pages/${pageId}`, { status: "published" });
    const page = await shop("GET", "/shop/pages/livraison");
    expect(page.status).toBe(200);
    const products = page.json.data.blocks.find((block: { type: string }) => block.type === "products");
    expect(products.items.map((item: { id: string }) => item.id)).toEqual([lamp]);
    expect(products.items[0].price.unitPriceInclTaxXof).toBe(10000);
    expect((await shop("GET", "/shop/pages")).json.data.map((entry: { slug: string }) => entry.slug)).toEqual(["livraison"]);
    const [{ n }] = await rows<{ n: number }>(sql`select count(*)::int as n from domain_events where name = 'cms.page_published'`);
    expect(n).toBe(1);
  });

  it("redirige l'ancienne adresse d'une page publiée renommée", async () => {
    const renamed = await admin("PATCH", `/admin/pages/${pageId}`, { slug: "livraison-afrique" });
    expect(renamed.json.data.url).toBe("/pages/livraison-afrique");
    const redirects = await admin("GET", "/admin/redirects?q=livraison");
    expect(redirects.json.data).toEqual([expect.objectContaining({ oldPath: "/pages/livraison", newPath: "/pages/livraison-afrique", statusCode: 301 })]);
    const { default: CmsPage } = await import("@/app/(boutique)/pages/[slug]/page");
    expect(await digestOf(CmsPage({ params: Promise.resolve({ slug: "livraison" }) }))).toContain("/pages/livraison-afrique");
    expect(await digestOf(CmsPage({ params: Promise.resolve({ slug: "inexistante" }) }))).toContain("404");
  });
});

describe("menus", () => {
  it("résout les liens et masque les contenus non publiés", async () => {
    await admin("POST", "/admin/pages", { slug: "brouillon", title: "Brouillon" });
    const saved = await admin("PUT", "/admin/menus/header", {
      name: "En-tête", items: [
        { label: "Catalogue", linkType: "url", target: "/produits", children: [{ label: "Éclairage", linkType: "category", target: "eclairage" }, { label: "Lampe", linkType: "product", target: "lampe-de-bureau" }] },
        { label: "Livraison", linkType: "page", target: "livraison-afrique" },
        { label: "Bientôt", linkType: "page", target: "brouillon" },
      ],
    });
    expect(saved.status).toBe(200);
    const bad = await admin("PUT", "/admin/menus/header", { name: "En-tête", items: [{ label: "X", linkType: "url", target: "javascript:alert(1)" }] });
    expect(bad.status).toBe(400);
    const menu = await shop("GET", "/shop/menus/header");
    expect(menu.json.data.items.map((item: { label: string; href: string }) => [item.label, item.href])).toEqual([["Catalogue", "/produits"], ["Livraison", "/pages/livraison-afrique"]]);
    expect(menu.json.data.items[0].children.map((child: { href: string }) => child.href)).toEqual(["/produits?categorie=eclairage", "/produits/lampe-de-bureau"]);
    const footer = await shop("GET", "/shop/menus/footer");
    expect(footer.json.data.items.map((item: { href: string }) => item.href)).toEqual(["/comment-ca-marche", "/demande-de-devis", "/conditions", "/confidentialite"]);
  });
});

describe("formulaires", () => {
  it("valide les champs, piège les robots, conserve la réponse et prévient l'équipe", async () => {
    const form = await shop("GET", "/shop/forms/contact");
    expect(form.json.data.fields.map((field: { name: string }) => field.name)).toEqual(["name", "email", "phone", "subject", "orderReference", "message"]);
    const invalid = await shop("POST", "/shop/forms/contact", { name: "Awa", email: "pas-un-email", subject: "Commande", message: "Bonjour" });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.details.map((issue: { path: string }) => issue.path)).toEqual(["email"]);
    const wrongChoice = await shop("POST", "/shop/forms/contact", { name: "Awa", email: "awa@exemple.ci", subject: "Inconnu", message: "Bonjour" });
    expect(wrongChoice.status).toBe(400);

    const robot = await shop("POST", "/shop/forms/contact", { name: "Bot", email: "bot@spam.test", subject: "Autre", message: "Achetez", website: "https://spam.test" });
    expect(robot.status).toBe(201);
    const ok = await shop("POST", "/shop/forms/contact", { name: "Awa Koné", email: "awa@exemple.ci", subject: "Livraison", message: "Où en est ma commande ?" });
    expect(ok.status).toBe(201);
    expect(ok.json.data.message).toMatch(/Merci/);

    const submissions = await admin("GET", "/admin/forms/contact/submissions");
    expect(submissions.json.data).toHaveLength(1);
    expect(submissions.json.data[0]).toMatchObject({ email: "awa@exemple.ci", status: "new", data: { subject: "Livraison" } });
    await dispatchPendingEvents(db, { limit: 50 });
    const [queued] = await rows<{ to_address: string; subject: string }>(sql`select to_address, subject from email_queue where template_code = 'form_submission'`);
    expect(queued).toEqual({ to_address: "equipe@mybigmarket.test", subject: "Nous contacter : nouveau message de awa@exemple.ci" });
    expect((await admin("PATCH", `/admin/form-submissions/${submissions.json.data[0].id}`, { status: "read" })).json.data.status).toBe("read");

    const custom = await admin("PUT", "/admin/forms/devis", { title: "Demande de devis", fields: [{ name: "email", label: "E-mail", type: "email", required: true }, { name: "quantity", label: "Quantité", type: "number", required: true }] });
    expect(custom.status).toBe(200);
    expect((await admin("PUT", "/admin/forms/devis", { title: "Doublon", fields: [{ name: "website", label: "Site", type: "text" }] })).status).toBe(400);
  });

  it("limite le nombre d'envois par adresse IP", async () => {
    let last = 0;
    for (let index = 0; index < 11; index++) last = (await shop("POST", "/shop/forms/contact", { name: "Spam", email: "s@spam.test", subject: "Autre", message: "x" }, "203.0.113.99")).status;
    expect(last).toBe(429);
  });
});

describe("bannières", () => {
  it("ne sert que les bannières actives dans leur période", async () => {
    await admin("POST", "/admin/banners", { name: "Soldes", imageUrl: "https://cdn.exemple.ci/soldes.jpg", alt: "Soldes de novembre", targetUrl: "/produits", isActive: true, placement: "home" });
    await admin("POST", "/admin/banners", { name: "Passée", imageUrl: "/banners/old.jpg", alt: "Ancienne", isActive: true, placement: "home", startsAt: "2020-01-01T00:00:00Z", endsAt: "2020-02-01T00:00:00Z" });
    await admin("POST", "/admin/banners", { name: "Inactive", imageUrl: "/banners/off.jpg", alt: "Off", placement: "home" });
    const list = await shop("GET", "/shop/banners?placement=home");
    expect(list.json.data.map((banner: { name: string }) => banner.name)).toEqual(["Soldes"]);
    expect((await admin("POST", "/admin/banners", { name: "XSS", imageUrl: "javascript:alert(1)", alt: "x" })).status).toBe(400);
  });
});

describe("redirections", () => {
  it("refuse les boucles et les adresses protégées, aplatit les chaînes et répond sur les adresses inconnues", async () => {
    const first = await admin("POST", "/admin/redirects", { oldPath: "/ancien-catalogue", newPath: "/catalogue-2025" });
    expect(first.status).toBe(201);
    await admin("POST", "/admin/redirects", { oldPath: "/catalogue-2025/", newPath: "/produits" });
    const flattened = await admin("GET", "/admin/redirects?q=ancien");
    expect(flattened.json.data[0]).toMatchObject({ oldPath: "/ancien-catalogue", newPath: "/produits" });
    expect((await admin("POST", "/admin/redirects", { oldPath: "/produits", newPath: "/ancien-catalogue" })).status).toBe(422);
    expect((await admin("POST", "/admin/redirects", { oldPath: "/api/v1/shop/products", newPath: "/produits" })).status).toBe(400);
    await admin("POST", "/admin/redirects", { oldPath: "/promo", newPath: "https://exemple.ci/promo", statusCode: 302 });

    const { default: UnknownPath } = await import("@/app/(boutique)/[...path]/page");
    expect(await digestOf(UnknownPath({ params: Promise.resolve({ path: ["ancien-catalogue"] }) }))).toMatch(/NEXT_REDIRECT;.*\/produits;308/);
    expect(await digestOf(UnknownPath({ params: Promise.resolve({ path: ["promo"] }) }))).toMatch(/NEXT_REDIRECT;.*https:\/\/exemple\.ci\/promo;307/);
    expect(await digestOf(UnknownPath({ params: Promise.resolve({ path: ["nulle-part"] }) }))).toContain("404");
    // Adresse mal encodée : page introuvable, pas d'erreur serveur.
    expect(await digestOf(UnknownPath({ params: Promise.resolve({ path: ["%E0%A4%A"] }) }))).toContain("404");
    const [{ hits }] = await rows<{ hits: number }>(sql`select hits from slug_redirects where old_path = '/ancien-catalogue'`);
    expect(hits).toBe(1);
  });
});
