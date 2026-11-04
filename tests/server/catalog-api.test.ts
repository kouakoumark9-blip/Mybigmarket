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
