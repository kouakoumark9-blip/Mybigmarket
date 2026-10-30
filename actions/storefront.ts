"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { sellerProfiles, sellerStorefronts, users } from "@/lib/db/schema";

export type StorefrontFormState = { error?: string; success?: string; slug?: string };
const storefrontSchema = z.object({
  storeName: z.string().trim().min(2, "Le nom de boutique doit contenir au moins 2 caractères.").max(120),
  slug: z.string().trim().toLowerCase().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "L’adresse doit utiliser des lettres minuscules, chiffres et tirets."),
  headline: z.string().trim().min(3).max(190),
  description: z.string().trim().max(1500),
  announcement: z.string().trim().max(200),
  isPublished: z.boolean(),
});

export async function saveStorefrontAction(_previous: StorefrontFormState, formData: FormData): Promise<StorefrontFormState> {
  if (!process.env.DATABASE_URL) return { error: "Neon n’est pas connecté. Les réglages ne peuvent pas être enregistrés durablement." };
  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous avec un compte vendeur." };
  const parsed = storefrontSchema.safeParse({ ...Object.fromEntries(formData), isPublished: formData.get("isPublished") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les champs de la boutique." };
  const db = getDb();
  const [actor] = await db.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, session.user.id)).limit(1);
  const [profile] = await db.select({ verificationStatus: sellerProfiles.verificationStatus }).from(sellerProfiles).where(eq(sellerProfiles.userId, session.user.id)).limit(1);
  if (!actor || actor.role !== "seller" || actor.status !== "active" || !profile || profile.verificationStatus !== "approved") {
    return { error: "Seuls les vendeurs vérifiés peuvent modifier leur boutique." };
  }
  const [slugOwner] = await db.select({ sellerId: sellerStorefronts.sellerId }).from(sellerStorefronts)
    .where(and(eq(sellerStorefronts.slug, parsed.data.slug), ne(sellerStorefronts.sellerId, session.user.id))).limit(1);
  if (slugOwner) return { error: "Cette adresse de boutique est déjà utilisée. Choisissez-en une autre." };
  const now = new Date();
  try {
    await db.insert(sellerStorefronts).values({
      sellerId: session.user.id, slug: parsed.data.slug, storeName: parsed.data.storeName,
      headline: parsed.data.headline, description: parsed.data.description,
      announcement: parsed.data.announcement || null, isPublished: parsed.data.isPublished, updatedAt: now,
    }).onConflictDoUpdate({ target: sellerStorefronts.sellerId, set: {
      slug: parsed.data.slug, storeName: parsed.data.storeName, headline: parsed.data.headline,
      description: parsed.data.description, announcement: parsed.data.announcement || null,
      isPublished: parsed.data.isPublished, updatedAt: now,
    } });
  } catch (error) {
    console.error("storefront_save_failed", error);
    return { error: "Impossible d’enregistrer ces réglages. Vérifiez l’adresse de la boutique et réessayez." };
  }
  revalidatePath("/vendeur");
  revalidatePath("/vendeur/boutique");
  revalidatePath(`/boutiques/${parsed.data.slug}`);
  return { success: "Réglages de boutique enregistrés.", slug: parsed.data.slug };
}
