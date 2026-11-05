/**
 * Recherche de bout en bout (PGlite avec unaccent et pg_trgm) : insensible aux accents et à la casse,
 * préfixes, fautes de frappe, facettes (catégories, marques, prix, stock, caractéristiques),
 * tri par meilleures ventes, suggestions, et filtre du navigateur de catalogue.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { foldText, matchesSearch, prefixTsQuery, searchTokens } from "@/lib/search";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));

const SELLER = "50000000-0000-4000-8000-0000000000b1";
let db: Db;
let token: string;
const ids: Record<string, string> = {};
let red: string;
let black: string;
const admin = (method: string, path: string, body?: unknown) => api(method, path, { token, body });
let ipCounter = 0;
// Une adresse par appel : la limite de débit de la recherche ne doit pas interférer.
const shop = (path: string) => api("GET", path, { ip: `198.51.100.${(ipCounter++ % 200) + 1}` });
const titles = (response: { json: { data: Array<{ title: string }> } }) => response.json.data.map((entry) => entry.title);

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER}, 'Atelier B', 'b@vendeurs.ci', 'x', 'seller')`);
  await db.execute(sql`insert into seller_profiles (user_id, university, city_china, verification_status) values (${SELLER}, 'U', 'Yiwu', 'approved')`);
  const phones = (await admin("POST", "/admin/categories", { name: "Téléphonie", slug: "telephonie" })).json.data.id;
  const fashion = (await admin("POST", "/admin/categories", { name: "Mode", slug: "mode" })).json.data.id;
  const brand = (await admin("POST", "/admin/brands", { name: "Élan", slug: "elan" })).json.data.id;
  const color = (await admin("POST", "/admin/features", { code: "couleur", name: "Couleur", values: ["Rouge", "Noir"] })).json.data;
  red = color.values.find((value: { value: string }) => value.value === "Rouge").id;
  black = color.values.find((value: { value: string }) => value.value === "Noir").id;
  const create = async (key: string, body: Record<string, unknown>, featureValueId?: string) => {
    const product = (await admin("POST", "/admin/products", { sellerId: SELLER, status: "approved", initialQuantity: 5, ...body })).json.data;
    ids[key] = product.id;
    if (featureValueId) await admin("PUT", `/admin/products/${product.id}/features`, { features: [{ featureId: color.id, featureValueId }] });
  };
  await create("phone", { title: "Téléphone portable écran 6 pouces", categoryId: phones, brandId: brand, priceXof: 45000, shortDescription: "Double SIM, batterie longue durée." }, black);
  await create("case", { title: "Coque de protection pour téléphone", categoryId: phones, priceXof: 3000, tags: ["étui"] }, red);
  await create("shoes", { title: "Chaussures de sport homme", categoryId: fashion, brandId: brand, priceXof: 18000 }, red);
  await create("cream", { title: "Crème hydratante visage", categoryId: fashion, priceXof: 7500, initialQuantity: 0 });
  // Ventes : 3 coques payées, 1 paire de chaussures payée, 9 téléphones jamais payés (non comptés).
  const sale = async (productId: string, quantity: number, status: string) => {
    const [order] = (await db.execute(sql`insert into orders (buyer_id, total_xof, status) values (${SELLER}, 1000, ${status}) returning id`) as unknown as { rows: Array<{ id: string }> }).rows;
    await db.execute(sql`insert into order_items (order_id, product_id, seller_id, quantity, unit_price_xof, product_title) values (${order.id}, ${productId}, ${SELLER}, ${quantity}, 1000, 'x')`);
  };
  await sale(ids.case, 3, "paid_escrow");
  await sale(ids.shoes, 1, "delivered");
  await sale(ids.phone, 9, "awaiting_payment");
});

describe("normalisation partagée", () => {
  it("retire accents, casse et ligatures, et découpe en mots sûrs", () => {
    expect(foldText("  TÉLÉPHONE  Cœur ")).toBe("telephone coeur");
    expect(searchTokens("Crème, crème & chaus:*!")).toEqual(["creme", "chaus"]);
    expect(prefixTsQuery(searchTokens("chaus sport"))).toBe("chaus:* & sport:*");
    expect(matchesSearch("Téléphone portable écran 6 pouces", "telephone ECRAN")).toBe(true);
    expect(matchesSearch("Téléphone portable", "telephone tablette")).toBe(false);
  });
});

describe("recherche plein texte", () => {
  it("trouve un produit avec ou sans accents, quelle que soit la casse", async () => {
    for (const q of ["téléphone portable", "telephone portable", "TELEPHONE PORTABLE", "Téléphone"]) {
      const response = await shop(`/shop/products?q=${encodeURIComponent(q)}`);
      expect(response.status).toBe(200);
      expect(titles(response)).toContain("Téléphone portable écran 6 pouces");
      expect(response.json.meta.fuzzy).toBe(false);
    }
    expect(titles(await shop("/shop/products?q=creme"))).toEqual(["Crème hydratante visage"]);
    expect(titles(await shop("/shop/products?q=ecran"))).toEqual(["Téléphone portable écran 6 pouces"]);
  });

  it("gère les préfixes, le résumé, les étiquettes et classe le titre en premier", async () => {
    expect(titles(await shop("/shop/products?q=chaus"))).toEqual(["Chaussures de sport homme"]);
    expect(titles(await shop("/shop/products?q=batterie"))).toEqual(["Téléphone portable écran 6 pouces"]);
    expect(titles(await shop("/shop/products?q=etui"))).toEqual(["Coque de protection pour téléphone"]);
    // « téléphone » est en tête du titre du téléphone, en fin de titre pour la coque.
    expect(titles(await shop("/shop/products?q=telephone")).slice(0, 2)).toEqual(["Téléphone portable écran 6 pouces", "Coque de protection pour téléphone"]);
  });

  it("tolère une faute de frappe quand rien ne correspond exactement", async () => {
    const response = await shop("/shop/products?q=chausure");
    expect(titles(response)).toEqual(["Chaussures de sport homme"]);
    expect(response.json.meta.fuzzy).toBe(true);
    expect((await shop("/shop/products?q=zzzzqqq")).json.data).toEqual([]);
  });

  it("neutralise les opérateurs saisis par le client", async () => {
    for (const q of ["chaus:* | !(", "'); drop table products; --", "&&&", "a\\b%_"]) {
      const response = await shop(`/shop/products?q=${encodeURIComponent(q)}`);
      expect(response.status).toBe(200);
    }
    expect(titles(await shop(`/shop/products?q=${encodeURIComponent("chaus:* | !(")}`))).toEqual(["Chaussures de sport homme"]);
  });
});

describe("facettes et tri", () => {
  it("compte catégories, marques, tranches de prix, stock et caractéristiques", async () => {
    const response = await shop("/shop/products?facets=1");
    expect(response.status).toBe(200);
    const { facets } = response.json.meta;
    expect(facets.categories.map((entry: { slug: string; count: number }) => [entry.slug, entry.count]).sort()).toEqual([["mode", 2], ["telephonie", 2]]);
    expect(facets.brands).toEqual([expect.objectContaining({ slug: "elan", count: 2, selected: false })]);
    expect(facets.price).toMatchObject({ min: 3000, max: 45000 });
    expect(facets.price.ranges).toEqual([
      { min: 0, max: 5000, count: 1 }, { min: 5000, max: 10000, count: 1 }, { min: 10000, max: 25000, count: 1 }, { min: 25000, max: 50000, count: 1 },
    ]);
    expect(facets.availability).toEqual({ total: 4, inStock: 3, selected: false });
    expect(facets.features).toEqual([{ id: expect.any(String), code: "couleur", name: "Couleur", values: [
      { id: red, value: "Rouge", count: 2, selected: false }, { id: black, value: "Noir", count: 1, selected: false },
    ] }]);
  });

  it("filtre par caractéristique sans masquer les autres valeurs de la même caractéristique", async () => {
    const response = await shop(`/shop/products?facets=1&features=${red}`);
    expect(titles(response).sort()).toEqual(["Chaussures de sport homme", "Coque de protection pour téléphone"]);
    const values = response.json.meta.facets.features[0].values;
    expect(values).toEqual([{ id: red, value: "Rouge", count: 2, selected: true }, { id: black, value: "Noir", count: 1, selected: false }]);
    // Les autres facettes tiennent compte de la couleur choisie.
    expect(response.json.meta.facets.availability.total).toBe(2);
    const both = await shop(`/shop/products?features=${red},${black}&category=telephonie`);
    expect(titles(both).sort()).toEqual(["Coque de protection pour téléphone", "Téléphone portable écran 6 pouces"]);
    expect((await shop("/shop/products?features=pas-un-uuid")).status).toBe(400);
  });

  it("combine recherche, stock et prix, et trie par meilleures ventes", async () => {
    expect(titles(await shop("/shop/products?inStock=1&maxPrice=10000"))).toEqual(["Coque de protection pour téléphone"]);
    const sold = await shop("/shop/products?sort=best_selling");
    expect(titles(sold).slice(0, 2)).toEqual(["Coque de protection pour téléphone", "Chaussures de sport homme"]);
    expect(sold.json.meta.sort).toBe("best_selling");
  });
});

describe("suggestions", () => {
  it("propose produits, catégories et marques sans tenir compte des accents", async () => {
    const response = await shop("/shop/search/suggest?q=tele");
    expect(response.status).toBe(200);
    expect(response.json.data.products.map((entry: { slug: string }) => entry.slug)).toHaveLength(2);
    expect(response.json.data.categories).toEqual([{ name: "Téléphonie", slug: "telephonie" }]);
    expect((await shop("/shop/search/suggest?q=elan")).json.data.brands).toEqual([{ name: "Élan", slug: "elan" }]);
    const typo = await shop("/shop/search/suggest?q=chausure");
    expect(typo.json.data).toMatchObject({ fuzzy: true, products: [{ title: "Chaussures de sport homme" }] });
    expect((await shop("/shop/search/suggest?q=a")).status).toBe(400);
  });
});
