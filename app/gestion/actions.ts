"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { categories, shopOrders } from "@/lib/db/schema";
import { requireAdmin, signInAdmin, signOutAdmin } from "@/lib/gestion/session";
import { importProductsCsv, type ImportReport } from "@/lib/gestion/import";
import { deleteProduct, productSchema, saveProduct } from "@/lib/gestion/products";
import { SHOP_ORDER_STATUSES } from "@/lib/shop/orders";
import { uploadPublicImages, validateFiles } from "@/lib/uploads";

export type FormState = { error?: string; ok?: string };
export type ImportState = { error?: string; report?: ImportReport };

/** Les pages publiques se rafraîchissent tout de suite après une modification. */
const refreshShop = () => { revalidatePath("/", "layout"); updateTag("boutique"); };

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await signInAdmin(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""), String(formData.get("code") ?? ""));
  if (result.error) return result;
  redirect("/gestion");
}

export async function logoutAction() {
  await signOutAdmin();
  redirect("/gestion/connexion");
}

export async function saveProductAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "") || null;
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.safeParse({ ...raw, isBestSeller: formData.get("isBestSeller") === "on", isPlaceholder: formData.get("isPlaceholder") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  try {
    const files = formData.getAll("photos").filter((file): file is File => file instanceof File && file.size > 0);
    await validateFiles(files, "image", 8);
    const uploaded = files.length ? await uploadPublicImages(files, "boutique") : [];
    const removed = formData.getAll("removeImage").map((value) => Number(value)).filter(Number.isInteger);
    const productId = await saveProduct(id, parsed.data, uploaded.map((blob) => ({ url: blob.url, alt: parsed.data.title })), removed);
    refreshShop();
    if (!id) redirect(`/gestion/produits/${productId}?cree=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
  return { ok: "Produit enregistré." };
}

export async function deleteProductAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (id.success) { await deleteProduct(id.data); refreshShop(); }
  redirect("/gestion/produits?supprime=1");
}

export async function updateOrderAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!id.success || !SHOP_ORDER_STATUSES.some((item) => item.value === status)) redirect("/gestion/commandes");
  await getDb().update(shopOrders).set({ status, internalNote: String(formData.get("internalNote") ?? "").slice(0, 2000), updatedAt: new Date() }).where(eq(shopOrders.id, id.data));
  revalidatePath("/gestion/commandes");
  redirect(`/gestion/commandes/${String(formData.get("reference"))}?maj=1`);
}

export async function saveCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Catégorie inconnue." };
  const faq = String(formData.get("faq") ?? "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block) => { const [question, ...rest] = block.split("\n"); return { question: question.replace(/^Q\s*:\s*/i, "").trim(), answer: rest.join(" ").replace(/^R\s*:\s*/i, "").trim() }; }).filter((item) => item.question && item.answer).slice(0, 12);
  const text = (name: string, max: number) => String(formData.get(name) ?? "").trim().slice(0, max) || null;
  await getDb().update(categories).set({ introText: text("introText", 2000), bodyText: text("bodyText", 8000), metaTitle: text("metaTitle", 190), metaDescription: text("metaDescription", 320), faq, updatedAt: new Date() }).where(eq(categories.id, id));
  refreshShop();
  return { ok: "Catégorie enregistrée." };
}

export async function importCsvAction(_previous: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1) return { error: "Choisissez un fichier CSV." };
  if (file.size > 2 * 1024 * 1024) return { error: "Fichier trop lourd (2 Mo maximum)." };
  const report = await importProductsCsv(await file.text());
  if (report.created) refreshShop();
  return { report };
}

/** Crée catégories, compte boutique et 6 fiches fictives (sans doublon si déjà fait). */
export async function installSeedAction() {
  await requireAdmin();
  const { SEED_STATEMENTS } = await import("@/lib/gestion/seed-data");
  const database = getDb();
  await database.transaction(async (tx) => { for (const statement of SEED_STATEMENTS) await tx.execute(sql.raw(statement)); });
  refreshShop();
  redirect("/gestion?installe=1");
}
