"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { whatsappLink } from "@/lib/shop/config";

const productSchema = z.object({ productSlug: z.string().min(1).max(210) });

/** Bouton « Discuter » de la fiche produit : ouvre WhatsApp avec le produit déjà indiqué. */
export async function startConversationAction(formData: FormData): Promise<void> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  const slug = parsed.success ? parsed.data.productSlug : "";
  redirect(whatsappLink(slug ? `Bonjour MyBigMarket, je suis intéressé(e) par ce produit : ${process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.vercel.app"}/produits/${slug}` : undefined));
}
