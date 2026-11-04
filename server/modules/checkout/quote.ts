/**
 * Calcul unique d'un panier : utilisé par le panier serveur, la vérification des bons et le
 * passage de commande. Ce que le client voit au panier est exactement ce qui est facturé.
 *
 * Pour chaque ligne : prix client (lib/pricing via priceProducts : paliers, groupe, prix
 * spécifiques, règles catalogue, plancher, taxe du pays), contrôle de vente (disponible, minimum,
 * vente en rupture), puis bons de réduction (lib/vouchers) répartis au prorata des lignes
 * éligibles. La taxe contenue dans la remise est déduite de la taxe des lignes.
 *
 * Les lignes sont regroupées par vendeur : une commande par vendeur (marketplace, séquestre).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { canSell } from "@/lib/catalog-rules";
import type { PriceBreakdown } from "@/lib/pricing";
import { allocateProRata } from "@/lib/order-rules";
import { combineVouchers, evaluateVoucher, isLineEligible, normalizeVoucherCode, type VoucherEvaluation } from "@/lib/vouchers";
import { productCategories, productVariants, products, promoCodeRedemptions, promoCodes } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { getSetting } from "@/server/core/settings";
import { DEFAULT_SHOP_ID } from "@/lib/db/schema";
import { priceProducts, toVoucherRule, type ResolvedPrice } from "@/server/modules/pricing/service";
import { publicProductCondition } from "@/server/modules/storefront/service";
import { packAvailability } from "@/server/modules/catalog/products/service";
import type { CustomerContext } from "@/server/modules/checkout/customers";

export type QuoteLineInput = { productId: string; variantId?: number | null; quantity: number };

export type LineIssue = { code: "not_found" | "unavailable" | "insufficient_stock" | "below_minimum" | "variant_required"; message: string };

export type QuotedLine = {
  productId: string;
  variantId: number | null;
  sellerId: string;
  title: string;
  variantLabel: string | null;
  sku: string | null;
  slug: string;
  quantity: number;
  minimumQuantity: number;
  available: number;
  taxRatePercent: number;
  unitPriceExclTaxXof: number;
  unitPriceInclTaxXof: number;
  regularUnitPriceInclTaxXof: number;
  /** Remise des bons sur la ligne (TTC). */
  discountXof: number;
  /** Taxe de la ligne après remise. */
  taxXof: number;
  /** Total TTC de la ligne après remise. */
  totalXof: number;
  weightGrams: number;
  ecotaxXof: number;
  issue: LineIssue | null;
  price: (ResolvedPrice & { breakdown: PriceBreakdown }) | null;
};

export type SellerGroup = { sellerId: string; lines: QuotedLine[]; subtotalExclTaxXof: number; subtotalInclTaxXof: number; discountXof: number; taxXof: number; totalXof: number };

export type CartQuote = {
  currency: string;
  countryCode: string;
  lines: QuotedLine[];
  sellers: SellerGroup[];
  vouchers: { applied: Array<{ voucherId: string; code: string; discountXof: number; freeShipping: boolean }>; rejected: Array<{ code: string; reason: string; message: string }> };
  freeShipping: boolean;
  totals: { itemCount: number; subtotalExclTaxXof: number; subtotalInclTaxXof: number; discountXof: number; taxXof: number; shippingXof: number; totalXof: number };
  /** Le panier peut-il être commandé tel quel ? */
  orderable: boolean;
};

export async function quoteCart(executor: Executor, input: {
  lines: QuoteLineInput[]; customer?: CustomerContext | null; countryCode?: string; voucherCodes?: string[]; now?: Date;
  /** false : une ligne sans déclinaison reste au niveau du produit (panier historique de la boutique). */
  requireVariant?: boolean;
}): Promise<CartQuote> {
  const countryCode = (input.countryCode ?? "CI").toUpperCase();
  const merged = new Map<string, QuoteLineInput>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;
    const key = `${line.productId}:${line.variantId ?? ""}`;
    const current = merged.get(key);
    merged.set(key, { productId: line.productId, variantId: line.variantId ?? null, quantity: (current?.quantity ?? 0) + line.quantity });
  }
  const requested = [...merged.values()];
  const productIds = [...new Set(requested.map((line) => line.productId))];
  const rows = productIds.length ? await executor.select().from(products).where(and(inArray(products.id, productIds), publicProductCondition())) : [];
  const variantIds = requested.map((line) => line.variantId).filter((id): id is number => id != null);
  const [variants, variantCounts, links, allowBackorders] = await Promise.all([
    variantIds.length ? executor.select().from(productVariants).where(and(inArray(productVariants.id, variantIds), isNull(productVariants.deletedAt))) : Promise.resolve([]),
    productIds.length ? executor.select({ productId: productVariants.productId }).from(productVariants).where(and(inArray(productVariants.productId, productIds), isNull(productVariants.deletedAt), eq(productVariants.isActive, true))) : Promise.resolve([]),
    productIds.length ? executor.select({ productId: productCategories.productId, categoryId: productCategories.categoryId }).from(productCategories).where(inArray(productCategories.productId, productIds)) : Promise.resolve([]),
    getSetting(executor as unknown as Db, DEFAULT_SHOP_ID, "catalog.allow_out_of_stock_orders"),
  ]);

  // Disponible d'un pack : son composant le plus rare.
  const packAvailable = new Map<string, number>();
  for (const pack of rows.filter((row) => row.productType === "pack")) packAvailable.set(pack.id, (await packAvailability(executor, pack.id)) ?? 0);

  // Lignes vendables d'abord : on ne calcule un prix que pour un produit visible.
  const priceable = requested.filter((line) => {
    const product = rows.find((row) => row.id === line.productId);
    if (!product) return false;
    if (line.variantId != null) return variants.some((variant) => variant.id === line.variantId && variant.productId === product.id && variant.isActive);
    return true;
  });
  const prices = await priceProducts(executor, priceable.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })), {
    customerId: input.customer?.customerId ?? null, customerGroupId: input.customer?.groupId ?? null, countryCode, now: input.now,
  });

  const lines: QuotedLine[] = requested.map((line) => {
    const product = rows.find((row) => row.id === line.productId);
    const variant = line.variantId != null ? variants.find((entry) => entry.id === line.variantId) : null;
    const priceIndex = priceable.indexOf(line);
    const price = priceIndex >= 0 ? prices[priceIndex] : null;
    const base = {
      productId: line.productId, variantId: line.variantId ?? null, sellerId: product?.sellerId ?? "", title: product?.title ?? "Produit indisponible", variantLabel: variant?.value ?? null,
      sku: variant?.sku ?? product?.sku ?? null, slug: product?.slug ?? "", quantity: line.quantity, minimumQuantity: variant?.minimumQuantity ?? product?.minimumQuantity ?? 1,
      available: variant ? variant.stock : product?.productType === "pack" ? (packAvailable.get(product.id) ?? 0) : (product?.quantity ?? 0), taxRatePercent: price?.taxRatePercent ?? 0,
      unitPriceExclTaxXof: price?.unitPriceExclTaxXof ?? 0, unitPriceInclTaxXof: price?.unitPriceInclTaxXof ?? 0, regularUnitPriceInclTaxXof: price?.regularPriceInclTaxXof ?? 0,
      discountXof: 0, taxXof: 0, totalXof: 0, weightGrams: (product?.weightGrams ?? 0) + (variant?.weightImpactGrams ?? 0), ecotaxXof: product?.ecotaxXof ?? 0, price,
    };
    let issue: LineIssue | null = null;
    if (!product) issue = { code: "not_found", message: "Ce produit n'est plus disponible." };
    else if (line.variantId != null && !variant) issue = { code: "unavailable", message: "Cette déclinaison n'est plus disponible." };
    else if (input.requireVariant !== false && line.variantId == null && product.productType === "standard" && variantCounts.some((entry) => entry.productId === product.id)) issue = { code: "variant_required", message: "Choisissez une déclinaison." };
    else {
      const decision = canSell({
        available: product.productType === "virtual" ? Number.MAX_SAFE_INTEGER : base.available, requested: line.quantity, minimumQuantity: base.minimumQuantity,
        availableForOrder: product.availableForOrder, behavior: product.outOfStockBehavior, defaultBehavior: allowBackorders ? "backorder" : "refuse",
      });
      if (!decision.sellable) {
        issue = decision.reason === "below_minimum" ? { code: "below_minimum", message: `Quantité minimale : ${base.minimumQuantity}.` }
          : decision.reason === "out_of_stock" ? { code: "insufficient_stock", message: `Stock insuffisant : ${Math.max(0, base.available)} disponible(s).` }
          : { code: "unavailable", message: "Ce produit n'est pas disponible à la commande." };
      }
    }
    return { ...base, issue };
  });

  // Bons de réduction, évalués sur les lignes valides aux prix TTC payés.
  const valid = lines.filter((line) => !line.issue);
  const categoriesOf = (productId: string) => [...new Set([...rows.filter((row) => row.id === productId).map((row) => row.categoryId), ...links.filter((link) => link.productId === productId).map((link) => link.categoryId)])];
  const voucherLines = valid.map((line) => ({ productId: line.productId, categoryIds: categoriesOf(line.productId), unitPriceXof: line.unitPriceInclTaxXof, quantity: line.quantity, discounted: Boolean(line.price?.breakdown.specificRuleApplied) }));
  const subtotalIncl = valid.reduce((sum, line) => sum + line.unitPriceInclTaxXof * line.quantity, 0);
  const codes = [...new Set((input.voucherCodes ?? []).map(normalizeVoucherCode).filter(Boolean))].slice(0, 5);
  const voucherRows = codes.length ? await executor.select().from(promoCodes).where(and(inArray(promoCodes.code, codes), isNull(promoCodes.deletedAt))) : [];
  const evaluations: VoucherEvaluation[] = [];
  for (const row of voucherRows) {
    const used = input.customer ? await executor.select({ id: promoCodeRedemptions.id }).from(promoCodeRedemptions).where(and(eq(promoCodeRedemptions.promoCodeId, row.id), eq(promoCodeRedemptions.customerId, input.customer.customerId))) : [];
    evaluations.push(evaluateVoucher(toVoucherRule(row), { lines: voucherLines, customerId: input.customer?.customerId ?? null, customerGroupIds: input.customer?.groupIds ?? [], customerUsageCount: used.length, now: input.now }));
  }
  const combined = combineVouchers(evaluations, subtotalIncl);
  for (const applied of combined.applied) {
    const rule = toVoucherRule(voucherRows.find((row) => row.id === applied.voucherId)!);
    const eligible = valid.filter((line, index) => isLineEligible(rule, voucherLines[index]));
    const shares = allocateProRata(applied.discountXof, eligible.map((line) => line.unitPriceInclTaxXof * line.quantity - line.discountXof));
    eligible.forEach((line, index) => { line.discountXof += shares[index]; });
  }
  for (const line of lines) {
    if (line.issue) continue;
    const gross = line.unitPriceInclTaxXof * line.quantity;
    const discount = Math.min(gross, line.discountXof);
    line.discountXof = discount;
    line.totalXof = gross - discount;
    const grossTax = gross - line.unitPriceExclTaxXof * line.quantity;
    const discountTax = line.taxRatePercent > 0 ? Math.round((discount * line.taxRatePercent) / (100 + line.taxRatePercent)) : 0;
    line.taxXof = Math.max(0, grossTax - discountTax);
  }

  const sellers = new Map<string, SellerGroup>();
  for (const line of valid) {
    const group = sellers.get(line.sellerId) ?? { sellerId: line.sellerId, lines: [], subtotalExclTaxXof: 0, subtotalInclTaxXof: 0, discountXof: 0, taxXof: 0, totalXof: 0 };
    group.lines.push(line);
    group.subtotalExclTaxXof += line.unitPriceExclTaxXof * line.quantity;
    group.subtotalInclTaxXof += line.unitPriceInclTaxXof * line.quantity;
    group.discountXof += line.discountXof;
    group.taxXof += line.taxXof;
    group.totalXof += line.totalXof;
    sellers.set(line.sellerId, group);
  }
  const groups = [...sellers.values()];
  const unknownCodes = codes.filter((code) => !voucherRows.some((row) => row.code === code)).map((code) => ({ code, reason: "unknown", message: "Ce code de réduction n'existe pas." }));
  return {
    currency: "XOF",
    countryCode,
    lines,
    sellers: groups,
    vouchers: {
      applied: combined.applied.map((entry) => ({ voucherId: entry.voucherId, code: entry.code, discountXof: entry.discountXof, freeShipping: entry.freeShipping })),
      rejected: [...unknownCodes, ...combined.rejected.map((entry) => ({ code: entry.code, reason: entry.reason, message: entry.message }))],
    },
    freeShipping: combined.freeShipping,
    totals: {
      itemCount: valid.reduce((sum, line) => sum + line.quantity, 0),
      subtotalExclTaxXof: groups.reduce((sum, group) => sum + group.subtotalExclTaxXof, 0),
      subtotalInclTaxXof: groups.reduce((sum, group) => sum + group.subtotalInclTaxXof, 0),
      discountXof: groups.reduce((sum, group) => sum + group.discountXof, 0),
      taxXof: groups.reduce((sum, group) => sum + group.taxXof, 0),
      // Le transport Chine → Afrique de l'Ouest est confirmé après la commande (devis séparé).
      shippingXof: 0,
      totalXof: groups.reduce((sum, group) => sum + group.totalXof, 0),
    },
    orderable: valid.length > 0 && lines.every((line) => !line.issue),
  };
}

/** Vue publique d'une ligne (sans le détail interne du calcul de prix). */
export function publicLine(line: QuotedLine) {
  const { price, ...rest } = line;
  void price;
  return rest;
}
