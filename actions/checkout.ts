"use server";

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { orderEvents, orderItems, orders, payments, pickupPoints, products, sellerProfiles } from "@/lib/db/schema";
import { getPaymentProvider, type PayMethod } from "@/lib/payments/provider";
import { countryName, destinationCountries, destinationByCode } from "@/lib/west-africa";

const checkoutSchema = z.object({
  cart: z.string().min(2), method: z.enum(["orange_money", "mtn_momo", "wave", "card"]),
  deliveryMethod: z.enum(["delivery", "pickup"]), countryCode: z.string().length(2), language: z.enum(["fr", "en", "pt", "ar"]), name: z.string().optional(), phone: z.string().optional(),
  address: z.string().optional(), city: z.string().optional(), pickupPointId: z.coerce.number().int().positive().optional(),
});

type CartInput = { slug: string; qty: number };

export async function createCheckoutAction(formData: FormData): Promise<{ error?: string; orderIds?: string[] }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous ou créez un compte avant de commander." };
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les informations de livraison." };
  if (!destinationCountries.some((country) => country.code === parsed.data.countryCode)) return { error: "Choisissez un pays de livraison valide." };
  const destination = destinationByCode(parsed.data.countryCode);
  if (!(destination.languageOptions || [destination.language]).includes(parsed.data.language)) return { error: "La langue ne correspond pas à la destination sélectionnée." };
  let cart: CartInput[];
  try { cart = JSON.parse(parsed.data.cart) as CartInput[]; } catch { return { error: "Panier invalide." }; }
  if (!Array.isArray(cart) || !cart.length || cart.length > 50 || cart.some((line) => !line.slug || !Number.isInteger(line.qty) || line.qty < 1)) return { error: "Le panier est vide ou invalide." };

  const db = getDb();
  const slugs = [...new Set(cart.map((line) => line.slug))];
  const rows = await db.select({ product: products, seller: sellerProfiles }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.userId)).where(inArray(products.slug, slugs));
  if (rows.length !== slugs.length) return { error: "Un ou plusieurs produits ne sont plus disponibles." };
  const bySlug = new Map(rows.map((row) => [row.product.slug, row]));
  for (const line of cart) {
    const row = bySlug.get(line.slug);
    if (!row || row.product.status !== "approved" || row.seller.verificationStatus !== "approved") return { error: "Un produit ou son vendeur n’est pas validé." };
    if (line.qty < row.product.minimumQuantity) return { error: `La quantité minimum pour « ${row.product.title} » est de ${row.product.minimumQuantity}.` };
    if (line.qty > row.product.quantity) return { error: `Stock insuffisant pour « ${row.product.title} ».` };
  }
  if (parsed.data.deliveryMethod === "delivery" && (!parsed.data.name?.trim() || !parsed.data.phone?.trim() || !parsed.data.address?.trim() || !parsed.data.city?.trim())) return { error: "Renseignez le nom, le téléphone, la ville et l’adresse complète." };
  if (parsed.data.deliveryMethod === "pickup" && parsed.data.countryCode !== "CI") return { error: "Le point relais est actuellement proposé uniquement pour la Côte d’Ivoire." };
  if (parsed.data.deliveryMethod === "pickup") {
    if (!parsed.data.pickupPointId) return { error: "Choisissez un point relais." };
    const [point] = await db.select().from(pickupPoints).where(and(eq(pickupPoints.id, parsed.data.pickupPointId), eq(pickupPoints.isActive, true))).limit(1);
    if (!point) return { error: "Ce point relais n’est plus disponible." };
  }

  const grouped = new Map<string, { product: typeof products.$inferSelect; qty: number }[]>();
  for (const line of cart) {
    const row = bySlug.get(line.slug)!;
    const list = grouped.get(row.product.sellerId) || [];
    list.push({ product: row.product, qty: line.qty });
    grouped.set(row.product.sellerId, list);
  }
  const provider = getPaymentProvider();
  try {
    const orderIds = await db.transaction(async (tx) => {
      const created: string[] = [];
      for (const [sellerId, lines] of grouped) {
        const total = lines.reduce((sum, line) => sum + line.product.priceXof * line.qty, 0);
        for (const line of lines) {
          const [reserved] = await tx.update(products).set({ quantity: sql`${products.quantity} - ${line.qty}`, updatedAt: new Date() }).where(and(eq(products.id, line.product.id), eq(products.status, "approved"), gte(products.quantity, line.qty))).returning({ id: products.id });
          if (!reserved) throw new Error(`STOCK_CHANGED:${line.product.title}`);
        }
        const [order] = await tx.insert(orders).values({
          buyerId: session.user.id,
          totalXof: total,
          status: "awaiting_payment",
          deliveryMethod: parsed.data.deliveryMethod,
          paymentExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          pickupPointId: parsed.data.deliveryMethod === "pickup" ? parsed.data.pickupPointId : null,
          deliveryAddress: parsed.data.deliveryMethod === "delivery" ? { name: parsed.data.name || "", phone: parsed.data.phone || "", address: parsed.data.address || "", city: parsed.data.city || "", countryCode: parsed.data.countryCode, countryName: countryName(parsed.data.countryCode, "fr"), currency: destination.currency, language: parsed.data.language } : { countryCode: parsed.data.countryCode, countryName: countryName(parsed.data.countryCode, "fr"), currency: destination.currency, language: parsed.data.language },
        }).returning();
        if (!order) throw new Error("Impossible de créer la commande.");
        created.push(order.id);
        await tx.insert(orderItems).values(lines.map(({ product, qty }) => ({ orderId: order.id, productId: product.id, sellerId, quantity: qty, unitPriceXof: product.priceXof, productTitle: product.title })));
        const paymentIntent = await provider.createPayment(order.id, total, parsed.data.method as PayMethod);
        await tx.insert(payments).values({ orderId: order.id, method: parsed.data.method, amountXof: total, status: "pending", provider: paymentIntent.provider, externalReference: paymentIntent.reference });
        await tx.insert(orderEvents).values({ orderId: order.id, status: "awaiting_payment", note: "Commande créée; en attente de confirmation du paiement." });
      }
      return created;
    });
    return { orderIds };
  } catch (error) {
    console.error("checkout_failed", error);
    if (error instanceof Error && error.message.startsWith("STOCK_CHANGED:")) return { error: `Le stock de « ${error.message.slice(14)} » vient de changer. Actualisez votre panier.` };
    return { error: error instanceof Error && error.message.includes("mock") ? error.message : "Le paiement n’a pas pu être initialisé. Réessayez plus tard." };
  }
}
