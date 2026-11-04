"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { assertActiveAccount } from "@/lib/session-account";
import { getDb } from "@/lib/db";
import { orderEvents, orderItems, orders, payments, pickupPoints, products, sellerProfiles, users } from "@/lib/db/schema";
import { getPaymentProvider, type PayMethod } from "@/lib/payments/provider";
import { countryName, destinationCountries, destinationByCode } from "@/lib/west-africa";
import { reserveOrderStock, StockLedgerError } from "@/lib/stock-ledger";
import { AppError } from "@/server/core/errors";
import type { Db } from "@/server/core/db";
import { checkoutSchemaReady, placeOrder } from "@/server/modules/checkout/checkout";

const checkoutSchema = z.object({
  cart: z.string().min(2), method: z.enum(["orange_money", "mtn_momo", "wave", "card"]),
  deliveryMethod: z.enum(["delivery", "pickup"]), countryCode: z.string().length(2), language: z.enum(["fr", "en", "pt", "ar"]), name: z.string().optional(), phone: z.string().optional(),
  address: z.string().optional(), city: z.string().optional(), pickupPointId: z.coerce.number().int().positive().optional(),
});

type CartInput = { slug: string; qty: number };

export async function createCheckoutAction(formData: FormData): Promise<{ error?: string; orderIds?: string[] }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous ou créez un compte avant de commander." };
  try { await assertActiveAccount(session.user.id, "buyer"); }
  catch { return { error: "Votre compte ne permet pas de passer commande. Contactez le support." }; }
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les informations de livraison." };
  if (!destinationCountries.some((country) => country.code === parsed.data.countryCode)) return { error: "Choisissez un pays de livraison valide." };
  const destination = destinationByCode(parsed.data.countryCode);
  if (!(destination.languageOptions || [destination.language]).includes(parsed.data.language)) return { error: "La langue ne correspond pas à la destination sélectionnée." };
  let cart: CartInput[];
  try { cart = JSON.parse(parsed.data.cart) as CartInput[]; } catch { return { error: "Panier invalide." }; }
  if (!Array.isArray(cart) || !cart.length || cart.length > 50 || cart.some((line) => !line.slug || !Number.isInteger(line.qty) || line.qty < 1)) return { error: "Le panier est vide ou invalide." };

  const db = getDb();
  // Base migrée (0016) : calcul unique du backend — prix client, promotions, taxes, une commande
  // par vendeur, stock réservé. Sinon, parcours historique ci-dessous, inchangé.
  if (await checkoutSchemaReady(db as unknown as Db).catch(() => false)) {
    return placeFromStorefrontCart(db as unknown as Db, session.user.id, cart, parsed.data);
  }
  const slugs = [...new Set(cart.map((line) => line.slug))];
  const rows = await db.select({ product: products, seller: sellerProfiles, sellerStatus: users.status }).from(products).innerJoin(sellerProfiles, eq(products.sellerId, sellerProfiles.userId)).innerJoin(users, eq(users.id, products.sellerId)).where(inArray(products.slug, slugs));
  if (rows.length !== slugs.length) return { error: "Un ou plusieurs produits ne sont plus disponibles." };
  const bySlug = new Map(rows.map((row) => [row.product.slug, row]));
  for (const line of cart) {
    const row = bySlug.get(line.slug);
    if (!row || row.product.status !== "approved" || row.seller.verificationStatus !== "approved" || row.sellerStatus !== "active") return { error: "Un produit ou son vendeur n’est pas validé." };
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

  // Deux lignes du panier peuvent viser le même produit (variantes différentes) : on cumule,
  // sinon la contrainte unique (order_id, product_id) rejette la commande.
  const mergedQty = new Map<string, number>();
  for (const line of cart) mergedQty.set(line.slug, (mergedQty.get(line.slug) || 0) + line.qty);
  const grouped = new Map<string, { product: typeof products.$inferSelect; qty: number }[]>();
  for (const [slug, qty] of mergedQty) {
    const row = bySlug.get(slug)!;
    if (qty > row.product.quantity) return { error: `Stock insuffisant pour « ${row.product.title} ».` };
    const list = grouped.get(row.product.sellerId) || [];
    list.push({ product: row.product, qty });
    grouped.set(row.product.sellerId, list);
  }
  const provider = getPaymentProvider();
  try {
    const orderIds = await db.transaction(async (tx) => {
      const created: string[] = [];
      for (const [sellerId, lines] of grouped) {
        const total = lines.reduce((sum, line) => sum + line.product.priceXof * line.qty, 0);
        // Le produit doit toujours être validé au moment de réserver (verrou de ligne).
        for (const line of lines) {
          const [current] = await tx.select({ status: products.status }).from(products).where(eq(products.id, line.product.id)).for("update");
          if (current?.status !== "approved") throw new Error(`STOCK_CHANGED:${line.product.title}`);
        }
        const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        const [order] = await tx.insert(orders).values({
          buyerId: session.user.id,
          totalXof: total,
          status: "awaiting_payment",
          deliveryMethod: parsed.data.deliveryMethod,
          paymentExpiresAt,
          pickupPointId: parsed.data.deliveryMethod === "pickup" ? parsed.data.pickupPointId : null,
          deliveryAddress: parsed.data.deliveryMethod === "delivery" ? { name: parsed.data.name || "", phone: parsed.data.phone || "", address: parsed.data.address || "", city: parsed.data.city || "", countryCode: parsed.data.countryCode, countryName: countryName(parsed.data.countryCode, "fr"), currency: destination.currency, language: parsed.data.language } : { countryCode: parsed.data.countryCode, countryName: countryName(parsed.data.countryCode, "fr"), currency: destination.currency, language: parsed.data.language },
        }).returning();
        if (!order) throw new Error("Impossible de créer la commande.");
        created.push(order.id);
        // Réservation tracée (grand livre de stock) : libérée si le paiement expire ou échoue.
        try {
          await reserveOrderStock(tx, { orderId: order.id, expiresAt: paymentExpiresAt, lines: lines.map(({ product, qty }) => ({ productId: product.id, variantId: null, quantity: qty })) });
        } catch (error) {
          if (error instanceof StockLedgerError && error.code === "INSUFFICIENT_STOCK") {
            const title = lines.find(({ product }) => product.id === error.details.productId)?.product.title ?? "un produit";
            throw new Error(`STOCK_CHANGED:${title}`);
          }
          throw error;
        }
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

type CheckoutForm = z.infer<typeof checkoutSchema>;

/** Panier du navigateur (slugs) → commande via le calcul unique du backend. */
async function placeFromStorefrontCart(db: Db, userId: string, cart: CartInput[], form: CheckoutForm): Promise<{ error?: string; orderIds?: string[] }> {
  const slugs = [...new Set(cart.map((line) => line.slug))];
  const rows = await db.select({ id: products.id, slug: products.slug }).from(products).where(inArray(products.slug, slugs));
  if (rows.length !== slugs.length) return { error: "Un ou plusieurs produits ne sont plus disponibles." };
  const idOf = new Map(rows.map((row) => [row.slug, row.id]));
  try {
    const result = await placeOrder(db, {
      userId,
      requireVariant: false,
      paymentMethod: form.method as PayMethod,
      lines: cart.map((line) => ({ productId: idOf.get(line.slug)!, quantity: line.qty })),
      delivery: {
        method: form.deliveryMethod, countryCode: form.countryCode, language: form.language, pickupPointId: form.pickupPointId ?? null,
        address: form.deliveryMethod === "delivery" ? { name: form.name ?? "", phone: form.phone ?? "", address: form.address ?? "", city: form.city ?? "" } : null,
      },
    });
    return { orderIds: result.orders.map((order) => order.id) };
  } catch (error) {
    if (error instanceof AppError) {
      const issue = (error.details as { issues?: Array<{ title: string; message: string }> } | undefined)?.issues?.[0];
      if (issue) return { error: `« ${issue.title} » : ${issue.message}` };
      const field = Array.isArray(error.details) ? (error.details[0] as { message?: string } | undefined)?.message : undefined;
      return { error: field ?? error.message };
    }
    console.error("checkout_failed", error);
    return { error: error instanceof Error && error.message.includes("mock") ? error.message : "Le paiement n’a pas pu être initialisé. Réessayez plus tard." };
  }
}
