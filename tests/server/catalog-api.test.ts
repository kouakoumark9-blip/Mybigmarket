/**
 * Tests d'intégration du catalogue, des prix et des stocks sur PostgreSQL réel (PGlite),
 * à travers tout le pipeline HTTP de l'API v1.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

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
