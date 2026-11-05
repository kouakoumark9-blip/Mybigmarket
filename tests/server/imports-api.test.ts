/**
 * Import / export CSV de bout en bout (PGlite) : simulation de 1 000 produits sans aucune écriture,
 * rapport ligne par ligne, import réel isolant les lignes en erreur, lots reprenables, annulation,
 * mise à jour par référence, catégories et marques, droits, exports réimportables.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

const SELLER = "50000000-0000-4000-8000-0000000000c1";
const SELLER_EMAIL = "atelier-c@vendeurs.ci";
let db: Db;
let token: string;
let ordersToken: string;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;
const productCount = async (prefix: string) => Number((await rows<{ n: number }>(sql`select count(*)::int as n from products where reference like ${`${prefix}%`}`))[0].n);

function productCsv(count: number, prefix: string, mutate: (index: number, cells: string[]) => void = () => undefined) {
  const header = "reference;titre;prix;categorie;marque;vendeur;quantite;statut;etiquettes;description";
  const lines = Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const cells = [`${prefix}${String(index).padStart(4, "0")}`, `Produit d'essai n° ${index}`, index % 2 ? "12 500" : "9800", index % 3 ? "Maison > Cuisine" : "maison", "Kitchen Pro", SELLER_EMAIL, "10", "brouillon", "essai|import", "Description; avec séparateur"];
    mutate(index, cells);
    return cells.map((cell) => (/[;"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(";");
  });
  return [header, ...lines].join("\r\n");
}

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await createEmployeeRow(db, { email: "commandes@mybigmarket.test", password: ADMIN_PASSWORD, roleCode: "orders_manager" });
  ordersToken = (await loginAs("commandes@mybigmarket.test", ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER}, 'Atelier C', ${SELLER_EMAIL}, 'x', 'seller')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER}, 'U', 'Yiwu', 'approved')`);
  const maison = (await admin("POST", "/admin/categories", { name: "Maison", slug: "maison" })).json.data.id;
  await admin("POST", "/admin/categories", { name: "Cuisine", slug: "cuisine", parentId: maison });
  await admin("POST", "/admin/brands", { name: "Kitchen Pro", slug: "kitchen-pro" });
});

describe("simulation", () => {
  it("analyse 1 000 produits ligne par ligne sans rien écrire dans le catalogue", async () => {
    const csv = productCsv(1000, "SIM-", (index, cells) => {
      if (index === 10) cells[2] = "douze mille";
      if (index === 20) cells[3] = "Rayon inconnu";
      if (index === 30) cells[0] = "SIM-0001";
      if (index === 40) cells[5] = "personne@nulle-part.ci";
      if (index === 50) cells[7] = "publie";
    });
    const started = Date.now();
    const response = await admin("POST", "/admin/imports", { entity: "products", csv, fileName: "catalogue.csv" });
    const elapsed = Date.now() - started;
    expect(response.status).toBe(201);
    const job = response.json.data;
    expect(job).toMatchObject({ entity: "products", status: "simulated", fileName: "catalogue.csv", totalRows: 1000, planned: { create: 996, update: 0, skip: 0, error: 4 } });
    expect(job.progress).toMatchObject({ processed: 4, errors: 4, created: 0, remaining: 996 });
    // Les erreurs pointent la ligne du fichier (l'en-tête est la ligne 1) et la colonne.
    const errors = job.problems.filter((row: { status: string }) => row.status === "error").map((row: { line: number; messages: Array<{ field: string }> }) => [row.line, row.messages[0].field]);
    expect(errors).toEqual([[11, "prix"], [21, "categorie"], [31, "reference"], [41, "vendeur"]]);
    // Rien n'a été écrit : ni produit, ni stock, ni catégorie.
    expect(await productCount("SIM-")).toBe(0);
    expect(Number((await rows<{ n: number }>(sql`select count(*)::int as n from stock_movements`))[0].n)).toBe(0);
    expect(elapsed).toBeLessThan(30_000);
  });

  it("rend le rapport filtré, paginé et téléchargeable", async () => {
    const list = await admin("GET", "/admin/imports?filter[entity]=products");
    const job = list.json.data[0];
    const errors = await admin("GET", `/admin/imports/${job.id}/rows?status=error`);
    expect(errors.json.meta.total).toBe(4);
    expect(errors.json.data[0]).toMatchObject({ line: 11, plannedAction: "error", status: "error", data: { prix: "douze mille" } });
    const { handleApi } = await import("@/server/api/registry");
    const response = await handleApi(new Request(`http://shop.test/api/v1/admin/imports/${job.id}/report.csv`, { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.10" } }), ["admin", "imports", job.id, "report.csv"]);
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await response.text();
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(csv.split("\r\n")[0]).toBe("ligne;action_prevue;resultat;identifiant;messages;reference;titre;prix;categorie;marque;vendeur;quantite;statut;etiquettes;description");
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1001);
    expect(csv).toContain("11;erreur;erreur;;Erreur (prix) : Prix : nombre entier attendu");
  });

  it("refuse un fichier sans colonne d'identification ou à colonnes en double, et sans la permission", async () => {
    expect((await admin("POST", "/admin/imports", { entity: "products", csv: "prix;marque\n100;x" })).status).toBe(400);
    expect((await admin("POST", "/admin/imports", { entity: "products", csv: "titre;nom\nA;B" })).status).toBe(400);
    expect((await api("POST", "/admin/imports", { token: ordersToken, body: { entity: "products", csv: "titre\nA" } })).status).toBe(403);
  });
});

describe("import réel", () => {
  it("écrit les lignes valides, isole les erreurs, trace le stock et met à jour par référence", async () => {
    const csv = productCsv(30, "IMP-", (index, cells) => { if (index === 7) cells[2] = "-5"; if (index === 8) cells[1] = "AB"; });
    const response = await admin("POST", "/admin/imports", { entity: "products", csv, run: true });
    expect(response.status).toBe(201);
    expect(response.json.data).toMatchObject({ status: "completed", progress: { created: 28, errors: 2, remaining: 0, percent: 100 } });
    expect(await productCount("IMP-")).toBe(28);
    const [product] = await rows<{ id: string; price_xof: number; quantity: number; status: string; category_slug: string; brand_slug: string; tags: string }>(sql`
      select p.id, p.price_xof, p.quantity, p.status, c.slug as category_slug, b.slug as brand_slug,
        (select string_agg(tag, '|' order by tag) from product_tags t where t.product_id = p.id) as tags
      from products p join categories c on c.id = p.category_id left join brands b on b.id = p.brand_id where p.reference = 'IMP-0001'`);
    expect(product).toMatchObject({ price_xof: 12500, quantity: 10, status: "draft", category_slug: "cuisine", brand_slug: "kitchen-pro", tags: "essai|import" });
    // Stock initial passé par le grand livre (mouvement tracé), et audit de création.
    expect(Number((await rows<{ n: number }>(sql`select count(*)::int as n from stock_movements where product_id = ${product.id}`))[0].n)).toBe(1);

    // Deuxième passage : même référence → mise à jour ; le stock n'est pas modifié (avertissement).
    const update = productCsv(2, "IMP-", (_, cells) => { cells[2] = "15000"; cells[6] = "99"; });
    const second = await admin("POST", "/admin/imports", { entity: "products", csv: update, run: true });
    expect(second.json.data).toMatchObject({ status: "completed", planned: { update: 2, create: 0 }, progress: { updated: 2 } });
    expect(second.json.data.warningsCount).toBe(2);
    const [after] = await rows<{ price_xof: number; quantity: number }>(sql`select price_xof, quantity from products where reference = 'IMP-0001'`);
    expect(after).toEqual({ price_xof: 15000, quantity: 10 });
  });

  it("avance par lots, reprend où il s'est arrêté et n'écrit jamais une ligne deux fois", async () => {
    const { startImport, processImportBatch } = await import("@/server/modules/imports/service");
    const { principalForEmployee } = await import("@/server/core/auth/principal");
    const simulated = (await admin("POST", "/admin/imports", { entity: "products", csv: productCsv(12, "LOT-") })).json.data;
    const [employee] = await rows<{ id: string }>(sql`select id from employees where email = ${ADMIN_EMAIL}`);
    const actor = (await principalForEmployee(db, employee.id))!;
    const first = await startImport(db, simulated.id, { actor }, { maxRows: 5 });
    expect(first).toMatchObject({ status: "running", progress: { processed: 5, created: 5, remaining: 7 } });
    // Deux appels simultanés : le verrou laisse passer un seul lot à la fois.
    const [a, b] = await Promise.all([processImportBatch(db, simulated.id, { maxRows: 4 }), processImportBatch(db, simulated.id, { maxRows: 4 })]);
    expect([9, 12]).toContain(Math.max(a.progress.processed, b.progress.processed));
    const resumed = await admin("POST", `/admin/imports/${simulated.id}/process`);
    // Aucune ligne écrite deux fois : 12 créations, aucune erreur de doublon.
    expect(resumed.json.data).toMatchObject({ status: "completed", progress: { created: 12, processed: 12, errors: 0, remaining: 0 } });
    expect(await productCount("LOT-")).toBe(12);
    expect((await admin("POST", `/admin/imports/${simulated.id}/run`)).status).toBe(409);
  });

  it("annule un import en cours : les lignes restantes sont ignorées", async () => {
    const { startImport } = await import("@/server/modules/imports/service");
    const { principalForEmployee } = await import("@/server/core/auth/principal");
    const simulated = (await admin("POST", "/admin/imports", { entity: "products", csv: productCsv(6, "ANN-") })).json.data;
    const [employee] = await rows<{ id: string }>(sql`select id from employees where email = ${ADMIN_EMAIL}`);
    await startImport(db, simulated.id, { actor: (await principalForEmployee(db, employee.id))! }, { maxRows: 2 });
    const cancelled = await admin("POST", `/admin/imports/${simulated.id}/cancel`);
    expect(cancelled.json.data).toMatchObject({ status: "cancelled", progress: { created: 2, skipped: 4, remaining: 0 } });
    expect(await productCount("ANN-")).toBe(2);
  });

  it("crée à la demande les catégories et marques inconnues, une seule fois", async () => {
    const csv = productCsv(3, "OPT-", (_, cells) => { cells[3] = "Jardin"; cells[4] = "Verte Allée"; });
    const refused = await admin("POST", "/admin/imports", { entity: "products", csv });
    expect(refused.json.data.planned.error).toBe(3);
    const accepted = await admin("POST", "/admin/imports", { entity: "products", csv, options: { createCategories: true, createBrands: true }, run: true });
    expect(accepted.json.data).toMatchObject({ status: "completed", progress: { created: 3 } });
    expect(Number((await rows<{ n: number }>(sql`select count(*)::int as n from categories where name = 'Jardin'`))[0].n)).toBe(1);
    expect(Number((await rows<{ n: number }>(sql`select count(*)::int as n from brands where name = 'Verte Allée'`))[0].n)).toBe(1);
  });
});

describe("catégories et marques", () => {
  it("crée une arborescence dont les parents sont plus haut dans le fichier, puis la met à jour", async () => {
    const csv = "nom;slug;parent;actif\nÉlectronique;electronique;;oui\nTéléphones;telephones;electronique;oui\nAccessoires téléphone;accessoires-telephone;Électronique > Téléphones;non\nOrphelin;orphelin;Inexistant;oui";
    const result = await admin("POST", "/admin/imports", { entity: "categories", csv, run: true });
    expect(result.json.data).toMatchObject({ status: "completed", progress: { created: 3, errors: 1 } });
    const [child] = await rows<{ parent: string; is_active: boolean }>(sql`select p.slug as parent, c.is_active from categories c join categories p on p.id = c.parent_id where c.slug = 'accessoires-telephone'`);
    expect(child).toEqual({ parent: "telephones", is_active: false });
    const again = await admin("POST", "/admin/imports", { entity: "categories", csv: "slug;description\ntelephones;Smartphones et mobiles" });
    expect(again.json.data.planned).toEqual({ create: 0, update: 1, skip: 0, error: 0 });
  });

  it("importe des marques et refuse les doublons du fichier", async () => {
    const result = await admin("POST", "/admin/imports", { entity: "brands", csv: "nom;description\nSolaris;Énergie solaire\nsolaris;Doublon\nKitchen Pro;Mise à jour", run: true });
    expect(result.json.data).toMatchObject({ planned: { create: 1, update: 1, error: 1 }, progress: { created: 1, updated: 1, errors: 1 } });
  });
});

describe("exports", () => {
  it("exporte les produits avec les colonnes de l'import : le fichier se réimporte en mise à jour", async () => {
    await db.execute(sql`update products set title = '=HYPERLINK("http://evil.test")' where reference = 'IMP-0003'`);
    const { handleApi } = await import("@/server/api/registry");
    const response = await handleApi(new Request("http://shop.test/api/v1/admin/exports/products.csv", { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.10" } }), ["admin", "exports", "products.csv"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-total-count")).toBe(String(28 + 12 + 2 + 3));
    const csv = await response.text();
    expect(csv.split("\r\n")[0]).toBe("reference;titre;prix;categorie;categories_supplementaires;marque;vendeur;statut;visibilite;etat;resume;description;ean13;sku;poids_g;quantite_minimale;delai_jours;prix_achat;etiquettes;mis_en_avant;meta_titre;meta_description;slug");
    // Injection de formule neutralisée.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"")"`);
    const reimport = await admin("POST", "/admin/imports", { entity: "products", csv });
    expect(reimport.json.data.planned).toEqual({ create: 0, update: 45, skip: 0, error: 0 });
  });

  it("exporte catégories et marques réimportables, et journalise l'export des clients", async () => {
    const { handleApi } = await import("@/server/api/registry");
    const get = (path: string, bearer = token) => handleApi(new Request(`http://shop.test/api/v1${path}`, { headers: { authorization: `Bearer ${bearer}`, "x-forwarded-for": "203.0.113.10" } }), path.slice(1).split("/"));
    const categoriesCsv = await (await get("/admin/exports/categories.csv")).text();
    const replay = await admin("POST", "/admin/imports", { entity: "categories", csv: categoriesCsv });
    expect(replay.json.data.planned.create).toBe(0);
    expect(replay.json.data.planned.error).toBe(0);
    const brandsCsv = await (await get("/admin/exports/brands.csv")).text();
    expect((await admin("POST", "/admin/imports", { entity: "brands", csv: brandsCsv })).json.data.planned).toMatchObject({ create: 0, error: 0 });
    const customers = await get("/admin/exports/customers.csv");
    expect(customers.status).toBe(200);
    expect((await customers.text()).split("\r\n")[0]).toContain("identifiant;email;nom;telephone");
    expect(Number((await rows<{ n: number }>(sql`select count(*)::int as n from employee_audit_logs where action = 'customers.exported'`))[0].n)).toBe(1);
    expect((await get("/admin/exports/customers.csv", ordersToken)).status).toBe(200);
    expect((await get("/admin/exports/products.csv", ordersToken)).status).toBe(403);
  });

  it("fournit les modèles et la description des colonnes", async () => {
    const entities = await admin("GET", "/admin/imports/entities");
    expect(entities.json.data.map((entry: { code: string }) => entry.code)).toEqual(["products", "categories", "brands"]);
    const { handleApi } = await import("@/server/api/registry");
    const template = await handleApi(new Request("http://shop.test/api/v1/admin/imports/templates/products", { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.10" } }), ["admin", "imports", "templates", "products"]);
    const csv = await template.text();
    const simulated = await admin("POST", "/admin/imports", { entity: "products", csv, options: { createCategories: true, createBrands: true } });
    expect(simulated.json.data.columns.every((column: { key: string | null }) => column.key)).toBe(true);
  });
});
