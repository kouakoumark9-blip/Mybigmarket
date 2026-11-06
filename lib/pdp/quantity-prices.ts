import "server-only";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { productPriceTiers, products, specificPrices } from "@/lib/db/schema";
import { db } from "@/server/core/db";
import { priceProducts } from "@/server/modules/pricing/service";
import type { QuantityPrice } from "@/lib/pdp/types";

/**
 * Prix par quantité affichés sur la fiche (« 1-9 pièces : … ; 10 et plus : … »).
 * Les seuils viennent des paliers et des prix spécifiques saisis au back-office ; chaque prix est
 * calculé par le même service que le panier, pour que l'affichage corresponde à ce qui est facturé.
 * Rien n'est affiché s'il n'existe qu'un seul prix.
 */
export async function getQuantityPrices(slug: string): Promise<QuantityPrice[] | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    const database = db();
    const [product] = await database.select({ id: products.id, minimumQuantity: products.minimumQuantity }).from(products).where(eq(products.slug, slug)).limit(1);
    if (!product) return undefined;
    const now = new Date();
    const [tiers, specifics] = await Promise.all([
      database.select({ from: productPriceTiers.minimumQuantity }).from(productPriceTiers).where(and(eq(productPriceTiers.productId, product.id), isNull(productPriceTiers.variantId))),
      database.select({ from: specificPrices.fromQuantity }).from(specificPrices).where(and(
        eq(specificPrices.productId, product.id), isNull(specificPrices.variantId), isNull(specificPrices.customerId), isNull(specificPrices.customerGroupId),
        or(isNull(specificPrices.countryCode), eq(specificPrices.countryCode, "CI")),
        or(isNull(specificPrices.dateFrom), lte(specificPrices.dateFrom, now)), or(isNull(specificPrices.dateTo), gte(specificPrices.dateTo, now)),
      )),
    ]);
    const start = Math.max(1, product.minimumQuantity);
    const thresholds = [...new Set([start, ...tiers.map((row) => row.from), ...specifics.map((row) => row.from)])].filter((quantity) => quantity >= start).sort((a, b) => a - b).slice(0, 6);
    if (thresholds.length < 2) return undefined;
    const prices = await priceProducts(database, thresholds.map((quantity) => ({ productId: product.id, quantity })), { countryCode: "CI", currency: "XOF" });
    const rows: QuantityPrice[] = [];
    prices.forEach((price, index) => {
      const unitPriceXof = price.unitPriceExclTaxXof;
      if (rows.length && rows[rows.length - 1].unitPriceXof === unitPriceXof) return; // même prix : on prolonge la tranche précédente
      rows.push({ minQuantity: thresholds[index], maxQuantity: null, unitPriceXof });
    });
    for (let index = 0; index < rows.length - 1; index += 1) rows[index].maxQuantity = rows[index + 1].minQuantity - 1;
    return rows.length > 1 ? rows : undefined;
  } catch (error) {
    console.error("[pdp] Prix par quantité indisponibles :", error instanceof Error ? error.message : error);
    return undefined;
  }
}
