import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { products, shopOrderItems, shopOrders } from "@/lib/db/schema";
import { availabilityLabel } from "./availability";
import { DELIVERY_ZONES, deliveryFee } from "./delivery";

export class OrderError extends Error {}

/** Numéro de téléphone ivoirien : 10 chiffres (07…, 05…, 01…), avec ou sans +225. */
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("00225")) digits = digits.slice(5);
  else if (digits.startsWith("225") && digits.length === 13) digits = digits.slice(3);
  return /^\d{10}$/.test(digits) ? digits : null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newReference(date = new Date()) {
  const day = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `MBM-${day}-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
}

export const orderSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(120),
  phone: z.string().trim().min(1, "Indiquez votre numéro de téléphone."),
  commune: z.string().trim().min(1, "Choisissez votre commune.").max(80),
  address: z.string().trim().min(5, "Indiquez une adresse précise (quartier, rue, repère).").max(300),
  note: z.string().trim().max(500).optional().default(""),
  cart: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,210}$/), qty: z.number().int().min(1).max(99) })).min(1, "Votre panier est vide.").max(30),
});
export type OrderInput = z.infer<typeof orderSchema>;

export type PlacedOrder = { reference: string; totalXof: number };

/** Crée la commande : prix, stock et frais sont recalculés côté serveur, jamais lus dans le navigateur. */
export async function createShopOrder(input: OrderInput): Promise<PlacedOrder> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new OrderError("Numéro de téléphone invalide : 10 chiffres, par exemple 07 12 34 56 78.");
  const commune = DELIVERY_ZONES.some((zone) => zone.commune === input.commune) ? input.commune : "Autre ville de Côte d'Ivoire";
  const quantities = new Map<string, number>();
  for (const line of input.cart) quantities.set(line.slug, (quantities.get(line.slug) ?? 0) + line.qty);

  return getDb().transaction(async (tx) => {
    const rows = await tx.select().from(products).where(and(inArray(products.slug, [...quantities.keys()]), eq(products.status, "approved"), isNull(products.deletedAt)));
    if (rows.length !== quantities.size) throw new OrderError("Un produit de votre panier n'est plus disponible. Retirez-le puis recommencez.");
    for (const row of rows) if (row.isPlaceholder) throw new OrderError("Ce produit n'est pas encore disponible à la commande. Écrivez-nous sur WhatsApp pour le commander.");

    let subtotal = 0;
    const lines: Array<{ productId: string; title: string; unit: number; qty: number; label: string }> = [];
    for (const row of rows) {
      const qty = quantities.get(row.slug)!;
      if (row.availability !== "on_order") {
        const updated = await tx.update(products).set({ quantity: sql`${products.quantity} - ${qty}`, updatedAt: new Date() }).where(and(eq(products.id, row.id), sql`${products.quantity} >= ${qty}`)).returning({ id: products.id });
        if (!updated.length) throw new OrderError(`Stock insuffisant pour « ${row.title} ». Réduisez la quantité ou écrivez-nous sur WhatsApp.`);
      }
      subtotal += row.priceXof * qty;
      lines.push({ productId: row.id, title: row.title, unit: row.priceXof, qty, label: availabilityLabel(row.availability, row.leadTimeDays) });
    }
    const fee = deliveryFee(commune);
    for (let attempt = 0; ; attempt += 1) {
      const reference = newReference();
      try {
        const [order] = await tx.insert(shopOrders).values({ reference, customerName: input.name, phone, commune, address: input.address, deliveryFeeXof: fee, subtotalXof: subtotal, totalXof: subtotal + fee, customerNote: input.note }).returning({ id: shopOrders.id });
        await tx.insert(shopOrderItems).values(lines.map((line) => ({ orderId: order.id, productId: line.productId, title: line.title, unitPriceXof: line.unit, quantity: line.qty, availabilityLabel: line.label })));
        return { reference, totalXof: subtotal + fee };
      } catch (error) {
        if (attempt < 3 && /shop_orders_reference_unique/.test(String((error as Error).message))) continue;
        throw error;
      }
    }
  });
}

export const SHOP_ORDER_STATUSES = [
  { value: "new", label: "Nouvelle" },
  { value: "confirmed", label: "Confirmée" },
  { value: "delivering", label: "En livraison" },
  { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
] as const;
export const statusLabel = (status: string) => SHOP_ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;
