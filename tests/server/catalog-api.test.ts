/**
 * Tests d'intégration du catalogue, des prix et des stocks sur PostgreSQL réel (PGlite),
 * à travers tout le pipeline HTTP de l'API v1.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

// Session client de la boutique (Auth.js) simulée : null = visiteur.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

let db: Db;
let token: string;

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
});

const call = (method: string, path: string, body?: unknown) => api(method, path, { token, body });

describe("taxonomie", () => {
  let root: number;
  let child: number;
  let grandChild: number;

  it("crée un arbre de catégories avec slugs uniques et positions automatiques", async () => {
    const created = await call("POST", "/admin/categories", { name: "Électronique" });
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ slug: "electronique", parentId: null, sortOrder: 0 });
    root = created.json.data.id;
    child = (await call("POST", "/admin/categories", { name: "Téléphones", parentId: root })).json.data.id;
    grandChild = (await call("POST", "/admin/categories", { name: "Coques", parentId: child })).json.data.id;
    const duplicate = await call("POST", "/admin/categories", { name: "Électronique" });
    expect(duplicate.json.data.slug).toBe("electronique-2");
    const explicit = await call("POST", "/admin/categories", { name: "Autre", slug: "electronique" });
    expect(explicit.status).toBe(409);

    const tree = await call("GET", "/admin/categories/tree");
    const node = tree.json.data.find((entry: { id: number }) => entry.id === root);
    expect(node.children[0]).toMatchObject({ id: child, depth: 1, path: ["electronique", "telephones"] });
    expect(node.children[0].children[0]).toMatchObject({ id: grandChild, depth: 2 });
  });

  it("refuse un déplacement qui créerait un cycle", async () => {
    const response = await call("PATCH", `/admin/categories/${root}`, { parentId: grandChild });
    expect(response.status).toBe(422);
    const self = await call("POST", `/admin/categories/${child}/move`, { parentId: child });
    expect(self.status).toBe(422);
  });

  it("donne le fil d'Ariane et filtre la liste plate", async () => {
    const detail = await call("GET", `/admin/categories/${grandChild}`);
    expect(detail.json.data.breadcrumb.map((entry: { slug: string }) => entry.slug)).toEqual(["electronique", "telephones", "coques"]);
    const roots = await call("GET", "/admin/categories?filter[parentId][null]=true&sort=name");
    expect(roots.json.data.every((entry: { parentId: number | null }) => entry.parentId === null)).toBe(true);
  });

  it("supprime une catégorie en rattachant ses enfants au parent", async () => {
    const response = await call("DELETE", `/admin/categories/${child}`);
    expect(response.status).toBe(204);
    const detail = await call("GET", `/admin/categories/${grandChild}`);
    expect(detail.json.data.parentId).toBe(root);
    expect((await call("GET", `/admin/categories/${child}`)).status).toBe(404);
  });

  it("gère marques, fournisseurs, attributs et caractéristiques", async () => {
    const brand = await call("POST", "/admin/brands", { name: "Volta Tools" });
    expect(brand.json.data).toMatchObject({ slug: "volta-tools", isActive: true });
    const updated = await call("PATCH", `/admin/brands/${brand.json.data.id}`, { description: "Outillage électroportatif" });
    expect(updated.json.data.isActive).toBe(true);

    const supplier = await call("POST", "/admin/suppliers", { companyName: "Shenzhen Volta Co.", countryCode: "cn", city: "Shenzhen" });
    expect(supplier.json.data).toMatchObject({ countryCode: "CN", profileStatus: "unverified", slug: "shenzhen-volta-co" });

    const group = await call("POST", "/admin/attribute-groups", { code: "couleur", name: "Couleur", displayType: "color", values: [{ code: "noir", name: "Noir", colorHex: "#000000" }, { code: "orange", name: "Orange", colorHex: "#FF8000" }] });
    expect(group.status).toBe(201);
    expect(group.json.data.values.map((value: { code: string }) => value.code)).toEqual(["noir", "orange"]);
    const value = await call("POST", `/admin/attribute-groups/${group.json.data.id}/values`, { code: "blanc", name: "Blanc", colorHex: "#FFFFFF" });
    expect(value.json.data.position).toBe(2);

    const feature = await call("POST", "/admin/features", { code: "puissance", name: "Puissance", values: ["500 W", "750 W"] });
    expect(feature.json.data.values).toHaveLength(2);

    const audit = await db.execute(sql`select action from employee_audit_logs where action in ('brand.created', 'supplier.created', 'attribute_group.created', 'feature.created')`);
    expect((audit as unknown as { rows: unknown[] }).rows).toHaveLength(4);
  });
});

const SELLER_ID = "10000000-0000-4000-8000-0000000000a1";

async function ensureSeller() {
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER_ID}, 'Vendeur', 'vendeur-catalogue@exemple.ci', 'x', 'seller') on conflict do nothing`);
}

async function category(name: string): Promise<number> {
  return (await call("POST", "/admin/categories", { name })).json.data.id;
}

describe("produits", () => {
  let categoryId: number;
  let productId: string;

  beforeAll(async () => {
    await ensureSeller();
    categoryId = await category("Outillage");
  });

  it("crée un produit complet avec stock initial tracé, catégories et étiquettes", async () => {
    const secondary = await category("Promotions");
    const created = await call("POST", "/admin/products", {
      title: "Perceuse à percussion 750 W", sellerId: SELLER_ID, categoryId, categoryIds: [secondary], priceXof: 25000, purchasePriceXof: 15000,
      description: "Perceuse robuste.", tags: ["perceuse", "outillage", "perceuse"], ean13: "4006381333931", initialQuantity: 10, weightGrams: 2100,
    });
    expect(created.status).toBe(201);
    const product = created.json.data;
    productId = product.id;
    expect(product).toMatchObject({ slug: "perceuse-a-percussion-750-w", status: "draft", quantity: 10, lowStockThreshold: 5, version: 0 });
    expect(product.categories).toEqual([{ categoryId, isDefault: true }, { categoryId: secondary, isDefault: false }]);
    expect(product.tags).toEqual(["outillage", "perceuse"]);
    expect(product.stock.warehouses[0]).toMatchObject({ code: "principal", physical: 10, reserved: 0, available: 10 });
    const movements = await db.execute(sql`select reason, quantity_delta from stock_movements where product_id = ${productId}`);
    expect((movements as unknown as { rows: unknown[] }).rows).toEqual([{ reason: "inventory", quantity_delta: 10 }]);
  });

  it("refuse un code-barres invalide, une catégorie inconnue et un slug déjà pris", async () => {
    const badEan = await call("POST", "/admin/products", { title: "Produit test", sellerId: SELLER_ID, categoryId, priceXof: 1000, ean13: "4006381333932" });
    expect(badEan.status).toBe(400);
    const badCategory = await call("POST", "/admin/products", { title: "Produit test", sellerId: SELLER_ID, categoryId: 999_999, priceXof: 1000 });
    expect(badCategory.status).toBe(400);
    const taken = await call("POST", "/admin/products", { title: "Produit test", slug: "perceuse-a-percussion-750-w", sellerId: SELLER_ID, categoryId, priceXof: 1000 });
    expect(taken.status).toBe(409);
  });

  it("modifie avec verrou optimiste et crée une redirection 301 au changement de slug", async () => {
    const updated = await call("PATCH", `/admin/products/${productId}`, { slug: "perceuse-750-w", priceXof: 24000, version: 0 });
    expect(updated.status).toBe(200);
    expect(updated.json.data).toMatchObject({ slug: "perceuse-750-w", priceXof: 24000, version: 1 });
    const stale = await call("PATCH", `/admin/products/${productId}`, { priceXof: 23000, version: 0 });
    expect(stale.status).toBe(409);
    const again = await call("PATCH", `/admin/products/${productId}`, { slug: "perceuse-pro-750-w" });
    expect(again.status).toBe(200);
    const redirects = await db.execute(sql`select old_path, new_path from slug_redirects order by old_path`);
    expect((redirects as unknown as { rows: unknown[] }).rows).toEqual([
      { old_path: "/produits/perceuse-750-w", new_path: "/produits/perceuse-pro-750-w" },
      { old_path: "/produits/perceuse-a-percussion-750-w", new_path: "/produits/perceuse-pro-750-w" },
    ]);
    const events = await db.execute(sql`select name from domain_events where aggregate_id = ${productId} and name like 'product.%' order by occurred_at`);
    expect((events as unknown as { rows: Array<{ name: string }> }).rows.map((row) => row.name)).toEqual(["product.created", "product.updated", "product.updated"]);
  });

  it("exige la permission de publication pour publier", async () => {
    const role = await call("POST", "/admin/roles", { code: "redacteur_catalogue", name: "Rédacteur catalogue", permissions: ["catalog.products.create", "catalog.products.update"] });
    expect(role.status).toBe(201);
    await createEmployeeRow(db, { email: "redacteur@mybigmarket.test", password: "Redacteur-Password-2026", roleCode: "redacteur_catalogue" });
    const writer = (await loginAs("redacteur@mybigmarket.test", "Redacteur-Password-2026")).accessToken;
    const denied = await api("PATCH", `/admin/products/${productId}`, { token: writer, body: { status: "approved" } });
    expect(denied.status).toBe(403);
    const allowed = await api("PATCH", `/admin/products/${productId}`, { token: writer, body: { shortDescription: "750 W, mandrin 13 mm" } });
    expect(allowed.status).toBe(200);
    const published = await call("PATCH", `/admin/products/${productId}`, { status: "approved" });
    expect(published.json.data.status).toBe("approved");
    expect(published.json.data.publishedAt).toBeTruthy();
  });

  it("gère les images : couverture, ordre et remplacement de la couverture supprimée", async () => {
    const first = await call("POST", `/admin/products/${productId}/images`, { url: "https://cdn.exemple.ci/perceuse-1.jpg", alt: "Perceuse de face" });
    expect(first.json.data.isCover).toBe(true);
    const second = await call("POST", `/admin/products/${productId}/images`, { url: "https://cdn.exemple.ci/perceuse-2.jpg", isCover: true });
    expect(second.json.data.isCover).toBe(true);
    const order = await call("PUT", `/admin/products/${productId}/images/order`, { imageIds: [second.json.data.id, first.json.data.id] });
    expect(order.json.data.map((image: { id: number }) => image.id)).toEqual([second.json.data.id, first.json.data.id]);
    expect((await call("DELETE", `/admin/products/${productId}/images/${second.json.data.id}`)).status).toBe(204);
    const images = await call("GET", `/admin/products/${productId}/images`);
    expect(images.json.data).toEqual([expect.objectContaining({ id: first.json.data.id, isCover: true })]);
  });

  it("génère les déclinaisons sans doublon et gère la déclinaison par défaut", async () => {
    const color = await call("POST", "/admin/attribute-groups", { code: "coloris", name: "Coloris", position: 0, values: [{ code: "noir", name: "Noir" }, { code: "orange", name: "Orange" }] });
    const size = await call("POST", "/admin/attribute-groups", { code: "tension", name: "Tension", position: 1, values: [{ code: "220v", name: "220 V" }, { code: "110v", name: "110 V" }] });
    const valueIds = [...color.json.data.values, ...size.json.data.values].map((value: { id: string }) => value.id);
    const generated = await call("POST", `/admin/products/${productId}/combinations/generate`, { attributeValueIds: valueIds, priceImpactXof: 500 });
    expect(generated.status).toBe(200);
    expect(generated.json.data.created).toBe(4);
    const combinations = generated.json.data.combinations as Array<{ id: number; value: string; isDefault: boolean; priceDeltaXof: number; attributes: unknown[] }>;
    expect(combinations.filter((entry) => entry.isDefault)).toHaveLength(1);
    expect(combinations[0].attributes).toHaveLength(2);
    expect(combinations.map((entry) => entry.value)).toContain("Noir / 220 V");
    const again = await call("POST", `/admin/products/${productId}/combinations/generate`, { attributeValueIds: valueIds });
    expect(again.json.data).toMatchObject({ created: 0, skipped: 4 });

    const target = combinations.find((entry) => !entry.isDefault)!;
    const updated = await call("PATCH", `/admin/products/${productId}/combinations/${target.id}`, { isDefault: true, sku: "PERC-OR-110", priceDeltaXof: 1500 });
    expect(updated.json.data).toMatchObject({ isDefault: true, sku: "PERC-OR-110", priceDeltaXof: 1500 });
    expect((await call("DELETE", `/admin/products/${productId}/combinations/${target.id}`)).status).toBe(204);
    const remaining = await call("GET", `/admin/products/${productId}/combinations`);
    expect(remaining.json.data).toHaveLength(3);
    expect(remaining.json.data.filter((entry: { isDefault: boolean }) => entry.isDefault)).toHaveLength(1);
  });

  it("compose un pack dont le disponible est celui du composant le plus rare", async () => {
    const battery = (await call("POST", "/admin/products", { title: "Batterie 18 V", sellerId: SELLER_ID, categoryId, priceXof: 9000, initialQuantity: 6 })).json.data;
    const pack = (await call("POST", "/admin/products", { title: "Kit perceuse + 2 batteries", sellerId: SELLER_ID, categoryId, priceXof: 40000, productType: "pack" })).json.data;
    const composed = await call("PUT", `/admin/products/${pack.id}/pack`, { items: [{ productId, quantity: 1 }, { productId: battery.id, quantity: 2 }] });
    expect(composed.status).toBe(200);
    expect(composed.json.data.available).toBe(3);
    const nested = await call("PUT", `/admin/products/${battery.id}/pack`, { items: [{ productId: pack.id, quantity: 1 }] });
    expect(nested.status).toBe(422);
    const self = await call("PUT", `/admin/products/${pack.id}/pack`, { items: [{ productId: pack.id, quantity: 1 }] });
    expect(self.status).toBe(422);
  });

  it("duplique, met à la corbeille, restaure et applique des actions groupées", async () => {
    const copy = await call("POST", `/admin/products/${productId}/duplicate`, {});
    expect(copy.status).toBe(201);
    expect(copy.json.data).toMatchObject({ status: "draft", quantity: 0, ean13: null, sku: null });
    expect(copy.json.data.combinations).toHaveLength(3);
    expect(copy.json.data.tags).toEqual(["outillage", "perceuse"]);

    expect((await call("DELETE", `/admin/products/${copy.json.data.id}`)).status).toBe(204);
    expect((await call("GET", `/admin/products/${copy.json.data.id}`)).status).toBe(404);
    const trash = await call("GET", "/admin/products/trash");
    expect(trash.json.data.map((entry: { id: string }) => entry.id)).toContain(copy.json.data.id);
    const restored = await call("POST", `/admin/products/${copy.json.data.id}/restore`);
    expect(restored.json.data.deletedAt).toBeNull();

    const bulk = await call("POST", "/admin/products/bulk", { ids: [copy.json.data.id, productId, "30000000-0000-4000-8000-000000000000"], action: "publish" });
    expect(bulk.json.data).toEqual({ updated: 2, notFound: ["30000000-0000-4000-8000-000000000000"] });
    const listed = await call("GET", `/admin/products?filter[status]=approved&q=perceuse&sort=title`);
    expect(listed.json.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("prix et promotions", () => {
  let productId: string;
  let categoryId: number;
  let groupId: number;
  let customerId: string;

  beforeAll(async () => {
    await ensureSeller();
    categoryId = await category("Électroportatif");
    const group = await db.execute(sql`insert into customer_groups (code, name, discount_basis_points) values ('pro', 'Professionnels', 500) returning id`);
    groupId = (group as unknown as { rows: Array<{ id: number }> }).rows[0].id;
    await db.execute(sql`insert into users (id, name, email, password_hash) values ('10000000-0000-4000-8000-0000000000c1', 'Client Pro', 'client-pro@exemple.ci', 'x')`);
    const customer = await db.execute(sql`insert into customers (user_id, customer_group_id) values ('10000000-0000-4000-8000-0000000000c1', ${groupId}) returning id`);
    customerId = (customer as unknown as { rows: Array<{ id: string }> }).rows[0].id;
    const taxGroup = await db.execute(sql`insert into tax_rule_groups (name) values ('TVA standard') returning id`);
    const taxGroupId = (taxGroup as unknown as { rows: Array<{ id: string }> }).rows[0].id;
    const rule = await db.execute(sql`insert into tax_rules (code, country_code, label, rate_percent, is_active) values ('tva', 'CI', 'TVA 18 %', 18, true) returning id`);
    await db.execute(sql`insert into tax_rule_group_rules (tax_rule_group_id, tax_rule_id) values (${taxGroupId}, ${(rule as unknown as { rows: Array<{ id: string }> }).rows[0].id})`);
    productId = (await call("POST", "/admin/products", { title: "Meuleuse 125 mm", sellerId: SELLER_ID, categoryId, priceXof: 24000, purchasePriceXof: 15000, taxRuleGroupId: taxGroupId, initialQuantity: 50 })).json.data.id;
  });

  it("calcule HT, TTC et prix barré sans remise", async () => {
    const price = await call("GET", `/admin/products/${productId}/price?country=CI`);
    expect(price.json.data).toMatchObject({ unitPriceExclTaxXof: 24000, unitPriceInclTaxXof: 28320, regularPriceInclTaxXof: 28320, hasDiscount: false, taxRatePercent: 18, marginXof: 9000 });
  });

  it("applique la règle la plus favorable : prix spécifique de groupe contre règle catalogue", async () => {
    const rule = await call("POST", "/admin/catalog-price-rules", { name: "Promo électroportatif -10 %", reductionType: "percent", reductionValue: 10, conditions: { categoryIds: [categoryId] } });
    expect(rule.status).toBe(201);
    expect(rule.json.data.matchingProductCount).toBe(1);
    const anonymous = await call("GET", `/admin/products/${productId}/price`);
    expect(anonymous.json.data).toMatchObject({ unitPriceExclTaxXof: 21600, regularPriceExclTaxXof: 24000, hasDiscount: true, discountPercent: 10, appliedRule: { source: "catalog_rule", id: rule.json.data.id } });

    const specific = await call("POST", `/admin/products/${productId}/specific-prices`, { customerGroupId: groupId, reductionType: "fixed_price", reductionValue: 20000 });
    expect(specific.status).toBe(201);
    // Groupe -5 % → 22 800 ; règle catalogue -10 % → 20 520 ; prix fixe 20 000 : le prix fixe gagne.
    const pro = await call("GET", `/admin/products/${productId}/price?customerId=${customerId}`);
    expect(pro.json.data).toMatchObject({ unitPriceExclTaxXof: 20000, groupDiscountXof: 1200, appliedRule: { source: "specific_price", id: specific.json.data.id } });

    const invalid = await call("POST", `/admin/products/${productId}/specific-prices`, { reductionType: "percent", reductionValue: 150 });
    expect(invalid.status).toBe(400);
  });

  it("ne vend jamais sous le prix d'achat et applique les paliers dégressifs", async () => {
    const deep = await call("POST", "/admin/catalog-price-rules", { name: "Destockage", reductionType: "percent", reductionValue: 50, conditions: { productIds: [productId] } });
    const floored = await call("GET", `/admin/products/${productId}/price`);
    expect(floored.json.data).toMatchObject({ unitPriceExclTaxXof: 15000, floorApplied: true });
    await call("DELETE", `/admin/catalog-price-rules/${deep.json.data.id}`);

    const overlap = await call("PUT", `/admin/products/${productId}/price-tiers`, { tiers: [{ minimumQuantity: 1, maximumQuantity: 10, unitPriceXof: 24000 }, { minimumQuantity: 5, unitPriceXof: 22000 }] });
    expect(overlap.status).toBe(400);
    const tiers = await call("PUT", `/admin/products/${productId}/price-tiers`, { tiers: [{ minimumQuantity: 10, unitPriceXof: 22000 }] });
    expect(tiers.status).toBe(200);
    const bulk = await call("GET", `/admin/products/${productId}/price?quantity=10`);
    // Palier 22 000, puis règle catalogue -10 % : 19 800 HT par unité.
    expect(bulk.json.data).toMatchObject({ tierApplied: true, unitPriceExclTaxXof: 19800, totalExclTaxXof: 198000 });
  });

  it("crée des bons et les vérifie depuis la boutique sur les prix TTC", async () => {
    const voucher = await call("POST", "/admin/vouchers", { code: "bienvenue10", discountType: "percent", discountValue: 10, maximumDiscountXof: 5000 });
    expect(voucher.status).toBe(201);
    expect(voucher.json.data.code).toBe("BIENVENUE10");
    expect((await call("POST", "/admin/vouchers", { code: "BIENVENUE10", discountType: "amount", discountValue: 1000 })).status).toBe(409);
    expect((await call("POST", "/admin/vouchers", { discountType: "percent", discountValue: 120 })).status).toBe(400);
    const generated = await call("POST", "/admin/vouchers", { discountType: "none", freeShipping: true, perCustomerLimit: 1 });
    expect(generated.json.data.code).toMatch(/^MBM-[A-Z2-9]{8}$/);

    const check = await api("POST", "/shop/vouchers/check", { body: { codes: ["bienvenue10", "INCONNU", generated.json.data.code], lines: [{ productId, quantity: 1 }] } });
    expect(check.status).toBe(200);
    // 21 600 HT → 25 488 TTC ; 10 % = 2 549, plafonné à 5 000.
    expect(check.json.data).toMatchObject({ subtotalInclTaxXof: 25488, discountXof: 2549, freeShipping: false });
    expect(check.json.data.rejected.map((entry: { code: string; reason: string }) => [entry.code, entry.reason])).toEqual([["INCONNU", "unknown"], [generated.json.data.code, "login_required"]]);

    // Client professionnel connecté : son prix (20 000 HT → 23 600 TTC) et le meilleur bon non cumulable.
    session.current = { user: { id: "10000000-0000-4000-8000-0000000000c1", role: "buyer", email: "client-pro@exemple.ci" } };
    try {
      const logged = await api("POST", "/shop/vouchers/check", { body: { codes: ["BIENVENUE10", generated.json.data.code], lines: [{ productId, quantity: 1 }] } });
      expect(logged.json.data).toMatchObject({ subtotalInclTaxXof: 23600, discountXof: 2360, applied: [{ code: "BIENVENUE10" }] });
      expect(logged.json.data.rejected).toEqual([expect.objectContaining({ code: generated.json.data.code, reason: "not_combinable" })]);
    } finally {
      session.current = null;
    }
  });
});

describe("stocks", () => {
  let productId: string;
  let transitId: string;
  const DEFAULT_WAREHOUSE = "00000000-0000-4000-8000-000000000002";

  beforeAll(async () => {
    await ensureSeller();
    const categoryId = await category("Quincaillerie");
    productId = (await call("POST", "/admin/products", { title: "Cadenas laiton 50 mm", sellerId: SELLER_ID, categoryId, priceXof: 3500, purchasePriceXof: 1800, reference: "CAD-50", sku: "CAD50", lowStockThreshold: 10, initialQuantity: 40 })).json.data.id;
  });

  it("gère les entrepôts et protège l'entrepôt par défaut", async () => {
    const transit = await call("POST", "/admin/warehouses", { code: "transit-gz", name: "Transit Guangzhou", countryCode: "CN", isSellable: false });
    expect(transit.status).toBe(201);
    transitId = transit.json.data.id;
    expect((await call("PATCH", `/admin/warehouses/${DEFAULT_WAREHOUSE}`, { isActive: false })).status).toBe(422);
    expect((await call("DELETE", `/admin/warehouses/${DEFAULT_WAREHOUSE}`)).status).toBe(422);
    const list = await call("GET", "/admin/warehouses");
    expect(list.json.data.map((entry: { code: string }) => entry.code)).toEqual(expect.arrayContaining(["principal", "transit-gz"]));
  });

  it("trace réception, transfert, perte et inventaire, avec alerte de stock bas", async () => {
    const receipt = await call("POST", "/admin/stock/receipts", { warehouseId: transitId, reference: "BL-2026-001", items: [{ productId, quantity: 100, unitCostXof: 1700 }] });
    expect(receipt.status).toBe(201);
    let stock = await call("GET", `/admin/products/${productId}/stock`);
    expect(stock.json.data.available).toBe(40); // le transit n'est pas vendable

    const moved = await call("POST", "/admin/stock/transfers", { productId, fromWarehouseId: transitId, toWarehouseId: DEFAULT_WAREHOUSE, quantity: 60 });
    expect(moved.status).toBe(201);
    stock = await call("GET", `/admin/products/${productId}/stock`);
    expect(stock.json.data.available).toBe(100);
    expect(stock.json.data.warehouses.find((entry: { code: string }) => entry.code === "transit-gz")).toMatchObject({ physical: 40, counted: false });

    const tooMuch = await call("POST", "/admin/stock/adjustments", { productId, delta: -500, reason: "loss" });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.json.error.details.reason).toBe("insufficient_stock");
    const loss = await call("POST", "/admin/stock/adjustments", { productId, delta: -3, reason: "loss", note: "Cartons abîmés" });
    expect(loss.json.data).toMatchObject({ physicalBefore: 100, physicalAfter: 97, counterAfter: 97 });

    const counted = await call("POST", "/admin/stock/inventory", { reference: "INV-Q4", items: [{ productId, quantity: 8 }] });
    expect(counted.json.data).toMatchObject({ lines: 1, changed: 1 });
    expect(counted.json.data.results[0]).toMatchObject({ before: 97, after: 8, delta: -89 });

    const alerts = await call("GET", "/admin/stock/alerts");
    expect(alerts.json.data.products.map((entry: { productId: string }) => entry.productId)).toContain(productId);
    const low = await call("GET", "/admin/stock?lowStock=true&limit=50");
    expect(low.json.data.some((entry: { productId: string; lowStock: boolean }) => entry.productId === productId && entry.lowStock)).toBe(true);
    const events = await db.execute(sql`select count(*)::int as n from domain_events where name = 'stock.low' and aggregate_id = ${productId}`);
    expect((events as unknown as { rows: Array<{ n: number }> }).rows[0].n).toBe(1);

    const movements = await call("GET", `/admin/stock/movements?filter[productId]=${productId}&sort=createdAt`);
    expect(movements.json.data.map((entry: { reason: string }) => entry.reason)).toEqual(["inventory", "purchase", "transfer", "transfer", "loss", "inventory"]);
  });

  it("refuse de supprimer un entrepôt non vide puis le rend non comptable sans écart", async () => {
    expect((await call("DELETE", `/admin/warehouses/${transitId}`)).status).toBe(422);
    const sellable = await call("PATCH", `/admin/warehouses/${transitId}`, { isSellable: true });
    expect(sellable.status).toBe(200);
    expect((await call("GET", `/admin/products/${productId}/stock`)).json.data.available).toBe(48);
    await call("PATCH", `/admin/warehouses/${transitId}`, { isSellable: false });
    expect((await call("GET", `/admin/products/${productId}/stock`)).json.data.available).toBe(8);
    const drifts = await call("GET", "/admin/stock/drifts");
    expect(drifts.json.data.drifts).toEqual([]);
  });

  it("exporte le stock en CSV protégé contre l'injection de formules", async () => {
    await call("PATCH", `/admin/products/${productId}`, { title: "=HYPERLINK(\"x\") Cadenas" });
    const { handleApi } = await import("@/server/api/registry");
    const response = await handleApi(new Request("http://shop.test/api/v1/admin/stock/export.csv", { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.10" } }), ["admin", "stock", "export.csv"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const text = await response.text();
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("reference;sku;ean13;titre;sku_declinaison;declinaison;entrepot;physique;reserve;disponible;emplacement");
    // La formule est neutralisée (apostrophe) et la cellule est entre guillemets.
    expect(lines.find((line) => line.startsWith("CAD-50;") && line.includes(";principal;"))).toBe(`CAD-50;CAD50;;"'=HYPERLINK(""x"") Cadenas";;;principal;8;0;8;`);
  });

  it("simule puis importe un CSV, tout ou rien", async () => {
    const csv = "reference;quantite;entrepot\nCAD-50;25;principal\nINCONNU;3;principal\n";
    const simulation = await call("POST", "/admin/stock/import", { csv, mode: "set", dryRun: true });
    expect(simulation.status).toBe(200);
    expect(simulation.json.data.summary).toEqual({ lines: 2, ok: 1, unchanged: 0, errors: 1 });
    expect((await call("GET", `/admin/products/${productId}/stock`)).json.data.available).toBe(8);

    const refused = await call("POST", "/admin/stock/import", { csv, mode: "set", dryRun: false });
    expect(refused.status).toBe(422);
    expect((await call("GET", `/admin/products/${productId}/stock`)).json.data.available).toBe(8);

    const applied = await call("POST", "/admin/stock/import", { csv: "sku,quantite\nCAD50,5\n", mode: "add", dryRun: false });
    expect(applied.json.data.summary).toMatchObject({ ok: 1, errors: 0 });
    expect((await call("GET", `/admin/products/${productId}/stock`)).json.data.available).toBe(13);
  });

  it("suggère un réapprovisionnement regroupé par fournisseur", async () => {
    const response = await call("GET", "/admin/stock/replenishment?days=30");
    expect(response.status).toBe(200);
    const line = response.json.data.suppliers.flatMap((entry: { lines: Array<{ productId: string; suggestedQuantity: number }> }) => entry.lines).find((entry: { productId: string }) => entry.productId === productId);
    expect(line).toBeUndefined(); // 13 en stock > seuil 10, aucune vente : rien à commander
    await call("POST", "/admin/stock/adjustments", { productId, delta: -10, reason: "loss" });
    const after = await call("GET", "/admin/stock/replenishment?days=30");
    const suggested = after.json.data.suppliers.flatMap((entry: { lines: Array<{ productId: string; suggestedQuantity: number }> }) => entry.lines).find((entry: { productId: string }) => entry.productId === productId);
    expect(suggested).toMatchObject({ suggestedQuantity: 8, targetStock: 11 });
  });
});
