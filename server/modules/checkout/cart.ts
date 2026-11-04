/**
 * Panier serveur : un panier par client connecté, ou un panier invité identifié par un cookie
 * (jeton aléatoire, seul son hash est stocké). À la connexion, le panier invité est fusionné dans
 * celui du compte (lib/customer-rules : quantités additionnées, plafonnées au disponible).
 */
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { mergeCarts, MAX_LINE_QUANTITY } from "@/lib/customer-rules";
import { normalizeVoucherCode } from "@/lib/vouchers";
import { cartItems, carts, productImages, productVariants, products } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { ensureCustomer, findCustomer, type CustomerContext } from "@/server/modules/checkout/customers";
import { publicLine, quoteCart } from "@/server/modules/checkout/quote";

export const CART_COOKIE = "mbm_cart";
const CART_TTL_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function readCartToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(/;\s*/).find((part) => part.startsWith(`${CART_COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(CART_COOKIE.length + 1)) : "";
  return /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : null;
}

export function cartCookie(token: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return token
    ? `${CART_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CART_TTL_DAYS * 86_400}${secure}`
    : `${CART_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

type CartRow = typeof carts.$inferSelect;
export type CartSession = { cart: CartRow | null; customer: CustomerContext | null; setCookie?: string };

async function activeCustomerCart(executor: Executor, customerId: string) {
  const [cart] = await executor.select().from(carts).where(and(eq(carts.customerId, customerId), eq(carts.status, "active"))).orderBy(asc(carts.createdAt)).limit(1);
  return cart ?? null;
}

async function activeGuestCart(executor: Executor, token: string | null) {
  if (!token) return null;
  const [cart] = await executor.select().from(carts).where(and(eq(carts.guestTokenHash, hashToken(token)), eq(carts.status, "active"), isNull(carts.customerId))).limit(1);
  return cart ?? null;
}

/**
 * Panier de la requête. `create` : en crée un s'il n'existe pas (écriture). Un client connecté
 * récupère son panier ; s'il arrive avec un panier invité, celui-ci est fusionné puis clôturé.
 */
export async function resolveCart(database: Db, input: { userId?: string | null; token: string | null; create: boolean }): Promise<CartSession> {
  if (input.userId) {
    const guest = await activeGuestCart(database, input.token);
    // Un panier invité à reprendre suffit à créer le profil client.
    const customer = input.create || guest ? await ensureCustomer(database, input.userId) : await findCustomer(database, input.userId);
    if (!customer) return { cart: null, customer: null };
    let cart = await activeCustomerCart(database, customer.customerId);
    if (!cart && (input.create || guest)) {
      [cart] = await database.insert(carts).values({ customerId: customer.customerId, voucherCodes: guest?.voucherCodes ?? [] }).returning();
    }
    if (guest && cart) {
      await mergeGuestCart(database, guest, cart);
      return { cart: (await database.select().from(carts).where(eq(carts.id, cart.id)))[0], customer, setCookie: cartCookie(null) };
    }
    return { cart, customer };
  }
  const guest = await activeGuestCart(database, input.token);
  if (guest || !input.create) return { cart: guest, customer: null };
  const token = randomBytes(32).toString("base64url");
  const [cart] = await database.insert(carts).values({ guestTokenHash: hashToken(token) }).returning();
  return { cart, customer: null, setCookie: cartCookie(token) };
}

async function mergeGuestCart(database: Db, guest: CartRow, target: CartRow) {
  await database.transaction(async (tx) => {
    const [existing, incoming] = await Promise.all([
      tx.select().from(cartItems).where(eq(cartItems.cartId, target.id)),
      tx.select().from(cartItems).where(eq(cartItems.cartId, guest.id)),
    ]);
    const merged = mergeCarts(existing.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })), incoming.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })));
    await tx.delete(cartItems).where(eq(cartItems.cartId, target.id));
    if (merged.lines.length) await tx.insert(cartItems).values(merged.lines.map((line) => ({ cartId: target.id, productId: line.productId, variantId: line.variantId ?? null, quantity: line.quantity })));
    const codes = [...new Set([...target.voucherCodes, ...guest.voucherCodes])].slice(0, 5);
    await tx.update(carts).set({ voucherCodes: codes, updatedAt: new Date() }).where(eq(carts.id, target.id));
    await tx.update(carts).set({ status: "merged", updatedAt: new Date() }).where(eq(carts.id, guest.id));
  });
}

async function assertSellable(executor: Executor, productId: string, variantId: number | null) {
  const [product] = await executor.select({ id: products.id, status: products.status, deletedAt: products.deletedAt }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.deletedAt || !["approved", "published"].includes(product.status)) throw errors.notFound("Produit", productId);
  if (variantId != null) {
    const [variant] = await executor.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt), eq(productVariants.isActive, true))).limit(1);
    if (!variant) throw errors.notFound("Déclinaison", variantId);
  }
}

const sameLine = (variantId: number | null) => (variantId == null ? isNull(cartItems.variantId) : eq(cartItems.variantId, variantId));

/** Ajoute (cumule) ou fixe la quantité d'une ligne. Quantité 0 = suppression. */
export async function setCartLine(database: Db, cart: CartRow, input: { productId: string; variantId?: number | null; quantity: number; mode: "add" | "set" }) {
  const variantId = input.variantId ?? null;
  if (input.quantity > 0) await assertSellable(database, input.productId, variantId);
  await database.transaction(async (tx) => {
    const [line] = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, input.productId), sameLine(variantId))).limit(1).for("update");
    const quantity = Math.min(MAX_LINE_QUANTITY, input.mode === "add" ? (line?.quantity ?? 0) + input.quantity : input.quantity);
    if (quantity <= 0) {
      if (line) await tx.delete(cartItems).where(eq(cartItems.id, line.id));
    } else if (line) {
      await tx.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, line.id));
    } else {
      const existing = await tx.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cartId, cart.id));
      if (existing.length >= 100) throw errors.rule("Le panier est limité à 100 lignes.");
      await tx.insert(cartItems).values({ cartId: cart.id, productId: input.productId, variantId, quantity });
    }
    await tx.update(carts).set({ updatedAt: new Date(), abandonedAt: null }).where(eq(carts.id, cart.id));
  });
}

export async function setCartVouchers(database: Db, cart: CartRow, codes: string[]) {
  const normalized = [...new Set(codes.map(normalizeVoucherCode).filter(Boolean))].slice(0, 5);
  await database.update(carts).set({ voucherCodes: normalized, updatedAt: new Date() }).where(eq(carts.id, cart.id));
}

export async function clearCart(database: Db, cart: CartRow) {
  await database.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  await database.update(carts).set({ voucherCodes: [], updatedAt: new Date() }).where(eq(carts.id, cart.id));
}

/** Contenu du panier, entièrement recalculé (prix, disponibilité, bons, totaux). */
export async function cartView(database: Db, session: CartSession, options: { countryCode?: string } = {}) {
  if (!session.cart) {
    return { id: null, voucherCodes: [], ...(await quoteCart(database, { lines: [], customer: session.customer, countryCode: options.countryCode })) };
  }
  const items = await database.select().from(cartItems).where(eq(cartItems.cartId, session.cart.id)).orderBy(asc(cartItems.createdAt));
  const quote = await quoteCart(database, { lines: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })), customer: session.customer, countryCode: options.countryCode, voucherCodes: session.cart.voucherCodes });
  const ids = [...new Set(items.map((item) => item.productId))];
  const images = ids.length ? await database.select({ productId: productImages.productId, url: productImages.url, isPrimary: productImages.isPrimary }).from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder)) : [];
  const cover = (productId: string) => (images.find((image) => image.productId === productId && image.isPrimary) ?? images.find((image) => image.productId === productId))?.url ?? null;
  return {
    id: session.cart.id,
    voucherCodes: session.cart.voucherCodes,
    ...quote,
    lines: quote.lines.map((line) => ({ ...publicLine(line), imageUrl: cover(line.productId) })),
    sellers: quote.sellers.map((group) => ({ ...group, lines: group.lines.map(publicLine) })),
  };
}
