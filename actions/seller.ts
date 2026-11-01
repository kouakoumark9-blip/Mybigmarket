"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { assertActiveAccount } from "@/lib/session-account";
import { getDb } from "@/lib/db";
import { categories, productImages, products, sellerProfiles, users } from "@/lib/db/schema";
import { deletePublicBlobs, uploadPrivateDocuments, uploadPublicImages, validateFiles } from "@/lib/uploads";

export type FormState = { error?: string; success?: string };
const applicationSchema = z.object({ university: z.string().min(3), cityChina: z.string().min(2), whatsapp: z.string().min(8) });
const productSchema = z.object({ title: z.string().min(3).max(190), description: z.string().min(20), categoryId: z.coerce.number().int().positive(), priceXof: z.coerce.number().int().positive(), quantity: z.coerce.number().int().positive(), minimumQuantity: z.coerce.number().int().min(1), leadTimeDays: z.coerce.number().int().min(1).max(180) });

export async function createSellerApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous pour envoyer votre demande vendeur." };
  try { await assertActiveAccount(session.user.id); }
  catch { return { error: "Votre compte est suspendu : cette demande ne peut pas être envoyée." }; }
  const parsed = applicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Vérifiez les informations de votre profil." };
  const files = formData.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return { error: "Joignez au moins un justificatif (PDF, JPG ou PNG)." };
  let documents: Array<{ name: string; pathname: string; contentType: string }>;
  try { await validateFiles(files, "document", 4, 5 * 1024 * 1024); documents = await uploadPrivateDocuments(files, session.user.id); }
  catch (error) { return { error: error instanceof Error ? error.message : "Envoi des justificatifs impossible." }; }
  const db = getDb();
  const now = new Date();
  await db.insert(sellerProfiles).values({ userId: session.user.id, university: parsed.data.university, cityChina: parsed.data.cityChina, whatsapp: parsed.data.whatsapp, documents, verificationStatus: "pending", updatedAt: now }).onConflictDoUpdate({ target: sellerProfiles.userId, set: { university: parsed.data.university, cityChina: parsed.data.cityChina, whatsapp: parsed.data.whatsapp, documents, verificationStatus: "pending", updatedAt: now } });
  await db.update(users).set({ role: "seller", updatedAt: now }).where(eq(users.id, session.user.id));
  return { success: "Votre demande a été envoyée. Votre profil reste en attente de vérification." };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Accès vendeur requis." };
  const db = getDb();
  try { await assertActiveAccount(session.user.id, "seller"); }
  catch { return { error: "Accès vendeur requis." }; }
  const [profile] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, session.user.id)).limit(1);
  if (!profile || profile.verificationStatus !== "approved") return { error: "Seuls les vendeurs vérifiés peuvent proposer des produits." };
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les champs du produit." };
  const [category] = await db.select().from(categories).where(and(eq(categories.id, parsed.data.categoryId), eq(categories.isActive, true))).limit(1);
  if (!category) return { error: "Cette catégorie n’est pas disponible." };
  if (parsed.data.minimumQuantity > parsed.data.quantity) return { error: "Le stock doit être supérieur ou égal à la quantité minimum." };
  const files = formData.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return { error: "Ajoutez au moins une photo du produit." };
  let blobs: Awaited<ReturnType<typeof uploadPublicImages>>;
  try { await validateFiles(files, "image", 5, 5 * 1024 * 1024); blobs = await uploadPublicImages(files, session.user.id); }
  catch (error) { return { error: error instanceof Error ? error.message : "Envoi des images impossible." }; }
  const slugBase = parsed.data.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 170);
  const slug = `${slugBase}-${crypto.randomUUID().slice(0,8)}`;
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(products).values({ sellerId: session.user.id, categoryId: category.id, title: parsed.data.title, slug, description: parsed.data.description, priceXof: parsed.data.priceXof, quantity: parsed.data.quantity, minimumQuantity: parsed.data.minimumQuantity, leadTimeDays: parsed.data.leadTimeDays, status: "pending_review" }).returning({ id: products.id });
      if (!created) throw new Error("Produit non créé.");
      await tx.insert(productImages).values(blobs.map((blob,index)=>({ productId: created.id, url: blob.url, alt: parsed.data.title, sortOrder: index })));
    });
  } catch (error) {
    await deletePublicBlobs(blobs.map((blob)=>blob.url)).catch(()=>undefined);
    console.error("seller_product_create_failed",error);
    return { error: "Le produit a été soumis, mais l’enregistrement a échoué. Vérifiez les images et réessayez." };
  }
  return { success: "Produit soumis à la validation de l’équipe mybigmarket." };
}

export async function archiveProductAction(productId: string): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Accès vendeur requis." };
  const db = getDb();
  try { await assertActiveAccount(session.user.id, "seller"); }
  catch { return { error: "Accès vendeur requis." }; }
  await db.update(products).set({ status: "archived", updatedAt: new Date() }).where(and(eq(products.id, productId), eq(products.sellerId, session.user.id)));
  return { success: "Produit archivé." };
}
