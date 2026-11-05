import { eq } from "drizzle-orm";
import { z } from "zod";
import { cartItems } from "@/lib/db/schema";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/types";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { countryCode } from "@/server/modules/catalog/shared";
import * as account from "@/server/modules/checkout/account";
import { cartView, clearCart, readCartToken, resolveCart, setCartLine, setCartVouchers } from "@/server/modules/checkout/cart";
import { placeOrder } from "@/server/modules/checkout/checkout";

const tags = ["Boutique : panier et commande"];
const accountTags = ["Boutique : compte client"];

const lineBody = z.object({ productId: z.string().uuid(), variantId: z.number().int().positive().nullable().optional(), quantity: z.number().int().min(0).max(10_000) }).strict();
const countryQuery = z.object({ country: countryCode.optional() }).strict();
const language = z.enum(["fr", "en", "pt", "ar"]);

const checkoutBody = z.object({
  delivery: z.object({
    method: z.enum(["delivery", "pickup"]),
    countryCode,
    language,
    addressId: z.string().uuid().nullable().optional(),
    address: z.object({ name: z.string().trim().min(2).max(160), phone: z.string().trim().min(6).max(32), address: z.string().trim().min(4).max(400), city: z.string().trim().min(2).max(120) }).strict().nullable().optional(),
    pickupPointId: z.number().int().positive().nullable().optional(),
  }).strict(),
  paymentMethod: z.enum(PAYMENT_METHOD_CODES),
}).strict();

const addressBody = z.object({
  label: z.string().trim().max(80).optional(), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), companyName: z.string().trim().max(190).nullable().optional(),
  phone: z.string().trim().min(6).max(32), line1: z.string().trim().min(4).max(190), line2: z.string().trim().max(190).nullable().optional(), city: z.string().trim().min(2).max(120),
  region: z.string().trim().max(120).nullable().optional(), postalCode: z.string().trim().max(24).nullable().optional(), countryCode, deliveryInstructions: z.string().trim().max(240).nullable().optional(),
  isDefaultShipping: z.boolean().optional(), isDefaultBilling: z.boolean().optional(),
}).strict();

const requireUser = (customer: { userId: string } | null) => {
  if (!customer) throw errors.unauthenticated("Connectez-vous pour accéder à votre compte.");
  return customer.userId;
};

/** Panier de la requête ; pose ou efface le cookie du panier invité si besoin. */
async function session(ctx: { db: Parameters<typeof resolveCart>[0]; request: Request; customer: { userId: string } | null; responseHeaders: Headers }, create: boolean) {
  const result = await resolveCart(ctx.db, { userId: ctx.customer?.userId ?? null, token: readCartToken(ctx.request), create });
  if (result.setCookie) ctx.responseHeaders.append("set-cookie", result.setCookie);
  return result;
}

export const checkoutRoutes: AnyRoute[] = [
  defineRoute({
    id: "shop.cart.get", method: "GET", path: "/shop/cart", surface: "shop", tags, rateLimit: "shop.cart",
    summary: "Panier (recalculé à chaque lecture)", description: "Prix du client, disponibilité, bons appliqués ou refusés avec leur motif, totaux par vendeur. Invité : panier lié à un cookie HttpOnly.",
    query: countryQuery,
    handler: async (ctx) => cartView(ctx.db, await session(ctx, false), { countryCode: ctx.query.country }),
  }),
  defineRoute({
    id: "shop.cart.add", method: "POST", path: "/shop/cart/items", surface: "shop", tags, rateLimit: "shop.cart", status: 200,
    summary: "Ajouter un article (quantité cumulée)", body: lineBody,
    handler: async (ctx) => {
      const current = await session(ctx, true);
      await setCartLine(ctx.db, current.cart!, { ...ctx.body, mode: "add" });
      return cartView(ctx.db, current);
    },
  }),
  defineRoute({
    id: "shop.cart.set", method: "PATCH", path: "/shop/cart/items", surface: "shop", tags, rateLimit: "shop.cart",
    summary: "Fixer la quantité d'un article (0 = retirer)", body: lineBody,
    handler: async (ctx) => {
      const current = await session(ctx, true);
      await setCartLine(ctx.db, current.cart!, { ...ctx.body, mode: "set" });
      return cartView(ctx.db, current);
    },
  }),
  defineRoute({
    id: "shop.cart.vouchers", method: "PUT", path: "/shop/cart/vouchers", surface: "shop", tags, rateLimit: "shop.cart",
    summary: "Codes de réduction du panier (remplace la liste)", body: z.object({ codes: z.array(z.string().trim().min(1).max(64)).max(5) }).strict(),
    handler: async (ctx) => {
      const current = await session(ctx, true);
      await setCartVouchers(ctx.db, current.cart!, ctx.body.codes);
      return cartView(ctx.db, { ...current, cart: { ...current.cart!, voucherCodes: ctx.body.codes.map((code) => code.trim().toUpperCase().replace(/\s+/g, "")) } });
    },
  }),
  defineRoute({
    id: "shop.cart.clear", method: "DELETE", path: "/shop/cart", surface: "shop", tags, rateLimit: "shop.cart", status: 204,
    summary: "Vider le panier",
    handler: async (ctx) => {
      const current = await session(ctx, false);
      if (current.cart) await clearCart(ctx.db, current.cart);
    },
  }),
  defineRoute({
    id: "shop.checkout", method: "POST", path: "/shop/checkout", surface: "shop", auth: "required", tags, idempotency: "required", rateLimit: "shop.cart",
    summary: "Passer commande à partir du panier", description: "Une commande par vendeur, stock réservé jusqu'à l'expiration du paiement, bons consommés. En-tête Idempotency-Key obligatoire : un double envoi ne crée pas de seconde commande.",
    body: checkoutBody,
    handler: async (ctx) => {
      const current = await session(ctx, false);
      if (!current.cart) throw errors.rule("Le panier est vide.");
      const lines = await ctx.db.select().from(cartItems).where(eq(cartItems.cartId, current.cart.id));
      return placeOrder(ctx.db, {
        userId: requireUser(ctx.customer), cartId: current.cart.id, voucherCodes: current.cart.voucherCodes, paymentMethod: ctx.body.paymentMethod,
        lines: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })), delivery: ctx.body.delivery,
      });
    },
  }),

  defineRoute({
    id: "shop.account.get", method: "GET", path: "/shop/account", surface: "shop", auth: "required", tags: accountTags,
    summary: "Mon compte", handler: (ctx) => account.getAccount(ctx.db, requireUser(ctx.customer)),
  }),
  defineRoute({
    id: "shop.account.update", method: "PATCH", path: "/shop/account", surface: "shop", auth: "required", tags: accountTags,
    summary: "Modifier mon compte (consentement newsletter horodaté)",
    body: z.object({ name: z.string().trim().min(2).max(160).optional(), phone: z.string().trim().max(32).nullable().optional(), companyName: z.string().trim().max(190).nullable().optional(), taxNumber: z.string().trim().max(80).nullable().optional(), preferredLanguage: language.optional(), newsletter: z.boolean().optional() }).strict(),
    handler: (ctx) => account.updateAccount(ctx.db, requireUser(ctx.customer), ctx.body),
  }),
  defineRoute({
    id: "shop.account.export", method: "GET", path: "/shop/account/export", surface: "shop", auth: "required", tags: accountTags,
    summary: "Exporter mes données (RGPD)", handler: (ctx) => account.exportAccount(ctx.db, requireUser(ctx.customer)),
  }),
  defineRoute({
    id: "shop.addresses.list", method: "GET", path: "/shop/addresses", surface: "shop", auth: "required", tags: accountTags,
    summary: "Mes adresses", handler: (ctx) => account.listAddresses(ctx.db, requireUser(ctx.customer)),
  }),
  defineRoute({
    id: "shop.addresses.create", method: "POST", path: "/shop/addresses", surface: "shop", auth: "required", tags: accountTags,
    summary: "Ajouter une adresse (la première devient l'adresse par défaut)", body: addressBody,
    handler: (ctx) => account.createAddress(ctx.db, requireUser(ctx.customer), ctx.body),
  }),
  defineRoute({
    id: "shop.addresses.update", method: "PATCH", path: "/shop/addresses/:id", surface: "shop", auth: "required", tags: accountTags,
    summary: "Modifier une adresse", params: z.object({ id: z.string().uuid() }), body: addressBody.partial().strict(),
    handler: (ctx) => account.updateAddress(ctx.db, requireUser(ctx.customer), ctx.params.id, ctx.body),
  }),
  defineRoute({
    id: "shop.addresses.delete", method: "DELETE", path: "/shop/addresses/:id", surface: "shop", auth: "required", tags: accountTags, status: 204,
    summary: "Supprimer une adresse", params: z.object({ id: z.string().uuid() }),
    handler: async (ctx) => { await account.deleteAddress(ctx.db, requireUser(ctx.customer), ctx.params.id); },
  }),
  defineRoute({
    id: "shop.orders.list", method: "GET", path: "/shop/orders", surface: "shop", auth: "required", tags: accountTags,
    summary: "Mes commandes", query: z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(),
    handler: (ctx) => account.listCustomerOrders(ctx.db, requireUser(ctx.customer), ctx.query.page),
  }),
  defineRoute({
    id: "shop.orders.get", method: "GET", path: "/shop/orders/:id", surface: "shop", auth: "required", tags: accountTags,
    summary: "Détail d'une commande (identifiant ou référence)", params: z.object({ id: z.string().trim().min(3).max(60) }),
    handler: (ctx) => account.getCustomerOrder(ctx.db, requireUser(ctx.customer), ctx.params.id),
  }),
];
