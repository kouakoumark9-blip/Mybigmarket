/**
 * Téléversement des photos d'un produit (API d'administration, PGlite, stockage simulé) :
 * envoi multipart, contrôle du type et de la signature binaire, couverture, ordre, droits,
 * stockage absent, et nettoyage d'une photo envoyée mais non enregistrée.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetLedgerReadiness } from "@/lib/stock-ledger";
import type { Db } from "@/server/core/db";
import { ADMIN_EMAIL, ADMIN_PASSWORD, api, createEmployeeRow, createTestDatabase, loginAs } from "../helpers/test-api";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => runtime.db }));
const blob = vi.hoisted(() => ({ stored: [] as string[], deleted: [] as string[] }));
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => {
    blob.stored.push(pathname);
    return { url: `https://store.public.blob.vercel-storage.com/${pathname}`, pathname };
  }),
  del: vi.fn(async (urls: string[]) => { blob.deleted.push(...urls); }),
}));

const SELLER = "50000000-0000-4000-8000-0000000000e1";
let db: Db;
let token: string;
let readOnlyToken: string;
let productId: string;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

async function upload(files: Array<{ name: string; type: string; bytes: Uint8Array<ArrayBuffer> }>, fields: Record<string, string> = {}, bearer = token, id = productId) {
  const { handleApi } = await import("@/server/api/registry");
  const form = new FormData();
  for (const file of files) form.append("files", new File([file.bytes], file.name, { type: file.type }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const path = `/api/v1/admin/products/${id}/images/upload`;
  const response = await handleApi(new Request(`http://shop.test${path}`, { method: "POST", headers: { authorization: `Bearer ${bearer}`, "x-forwarded-for": "203.0.113.10" }, body: form }), path.replace(/^\/api\/v1\//, "").split("/"));
  return { status: response.status, json: await response.json() };
}

beforeAll(async () => {
  resetLedgerReadiness();
  ({ db } = await createTestDatabase());
  runtime.db = db;
  await createEmployeeRow(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleCode: "super_admin" });
  token = (await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  await createEmployeeRow(db, { email: "lecture@mybigmarket.test", password: ADMIN_PASSWORD, roleCode: "read_only" });
  readOnlyToken = (await loginAs("lecture@mybigmarket.test", ADMIN_PASSWORD)).accessToken;
  await db.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER}, 'Atelier E', 'e@vendeurs.ci', 'x', 'seller')`);
  const categoryId = (await api("POST", "/admin/categories", { token, body: { name: "Cuisine", slug: "cuisine" } })).json.data.id;
  productId = (await api("POST", "/admin/products", { token, body: { title: "Mixeur plongeant", sellerId: SELLER, categoryId, priceXof: 15000 } })).json.data.id;
});

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  blob.stored.length = 0;
  blob.deleted.length = 0;
});

describe("photos d'un produit", () => {
  it("téléverse plusieurs photos : la première d'un produit sans image devient la couverture", async () => {
    const response = await upload([{ name: "face.jpg", type: "image/jpeg", bytes: JPEG }, { name: "dos.png", type: "image/png", bytes: PNG }], { alt: "Mixeur, vue de face" });
    expect(response.status).toBe(201);
    expect(response.json.data.added).toHaveLength(2);
    expect(blob.stored).toHaveLength(2);
    expect(blob.stored.every((path) => path.startsWith(`product-images/${productId}/`))).toBe(true);
    const images = response.json.data.images as Array<{ url: string; alt: string; isCover: boolean; position: number }>;
    expect(images.map((image) => [image.isCover, image.position, image.alt])).toEqual([[true, 0, "Mixeur, vue de face"], [false, 1, "Mixeur, vue de face"]]);
    expect(images[0].url).toMatch(/^https:\/\/store\.public\.blob\.vercel-storage\.com\/product-images\//);
    // La fiche publique et l'audit voient les nouvelles images.
    const detail = await api("GET", `/admin/products/${productId}`, { token });
    expect(detail.json.data.images).toHaveLength(2);
  });

  it("peut désigner la nouvelle photo comme couverture", async () => {
    const response = await upload([{ name: "ambiance.webp", type: "image/webp", bytes: new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]) }], { isCover: "true" });
    expect(response.status).toBe(201);
    const images = response.json.data.images as Array<{ isCover: boolean; position: number }>;
    expect(images.find((image) => image.isCover)?.position).toBe(2);
  });

  it("refuse un fichier dont le contenu ne correspond pas au type annoncé, sans rien stocker", async () => {
    const disguised = await upload([{ name: "photo.jpg", type: "image/jpeg", bytes: new TextEncoder().encode("<script>alert(1)</script>") }]);
    expect(disguised.status).toBe(400);
    expect(disguised.json.error.details[0].message).toContain("Format de fichier refusé");
    const pdf = await upload([{ name: "doc.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7") }]);
    expect(pdf.status).toBe(400);
    expect((await upload([])).status).toBe(400);
    expect(blob.stored).toHaveLength(0);
  });

  it("exige la permission de modifier les produits et un produit existant", async () => {
    expect((await upload([{ name: "a.jpg", type: "image/jpeg", bytes: JPEG }], {}, readOnlyToken)).status).toBe(403);
    expect((await upload([{ name: "a.jpg", type: "image/jpeg", bytes: JPEG }], {}, token, "00000000-0000-4000-8000-00000000ffff")).status).toBe(404);
    expect(blob.stored).toHaveLength(0);
  });

  it("signale un stockage non configuré au lieu d'échouer en silence", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
    const response = await upload([{ name: "a.jpg", type: "image/jpeg", bytes: JPEG }]);
    expect(response.status).toBe(503);
    expect(response.json.error.message).toContain("stockage des photos");
  });

  it("refuse un envoi qui n'est pas multipart", async () => {
    const response = await api("POST", `/admin/products/${productId}/images/upload`, { token, body: { url: "https://exemple.ci/a.jpg" } });
    expect(response.status).toBe(400);
    expect(response.json.error.message).toContain("multipart/form-data");
  });

  it("retire du stockage une photo envoyée mais non enregistrée", async () => {
    const relations = await import("@/server/modules/catalog/products/relations");
    vi.spyOn(relations, "addImage").mockRejectedValueOnce(new Error("base indisponible"));
    const response = await upload([{ name: "a.jpg", type: "image/jpeg", bytes: JPEG }]);
    expect(response.status).toBe(500);
    expect(blob.deleted).toHaveLength(1);
    expect(blob.deleted[0]).toContain("product-images/");
  });
});
