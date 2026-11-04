import { describe, expect, it } from "vitest";
import { computeMargin, visibleThumbs } from "../lib/pdp/margin";
import { catalogToProduct, productToCartItem } from "../lib/pdp/adapters";
import { sampleWatchProduct } from "../lib/pdp/sample-product";
import type { DemoProduct } from "../lib/demo-data";

const base: DemoProduct = { slug: "sac", title: "Sac", priceXof: 12_500, minimumQuantity: 2, leadTimeDays: 30, category: "Mode", categorySlug: "mode", seller: "Lina K.", sellerSlug: "lina-k", university: "Université", city: "Guangzhou", rating: 4.8, reviewCount: 24, icon: "", tone: "orange", quantity: 48 };
const products: DemoProduct[] = [base, { ...base, slug: "montre", title: "Montre" }, { ...base, slug: "lampe", title: "Lampe", categorySlug: "maison", sellerSlug: "aya-t" }];

describe("calculateur de marge", () => {
  it("répartit la livraison et applique la marge sur le prix de vente", () => {
    const result = computeMargin({ unitPrice: 919, quantity: 50, shippingTotal: 15_000, marginPercent: 35 });
    expect(result.unitCost).toBe(1219);
    expect(result.suggestedPrice).toBe(1875);
    expect(result.totalCost).toBe(60_950);
  });
  it("borne les valeurs incohérentes", () => {
    const result = computeMargin({ unitPrice: -5, quantity: 0, shippingTotal: -1, marginPercent: 200 });
    expect(result.unitCost).toBe(0);
    expect(Number.isFinite(result.suggestedPrice)).toBe(true);
  });
});

describe("vignettes de variantes", () => {
  const items = Array.from({ length: 14 }, (_, index) => index);
  it("affiche « +N » au-delà du nombre d'emplacements", () => {
    expect(visibleThumbs(items, 9)).toEqual({ shown: [0, 1, 2, 3, 4, 5, 6, 7], hidden: 6 });
    expect(visibleThumbs(items.slice(0, 5), 9).hidden).toBe(0);
  });
  it("garde la variante sélectionnée visible", () => {
    expect(visibleThumbs(items, 5, 12).shown).toEqual([0, 1, 2, 12]);
  });
});

describe("adaptateurs de la fiche produit", () => {
  it("convertit un produit du catalogue sans inventer de vérification", () => {
    const product = catalogToProduct(products[0], products, "Description.\n\nSecond paragraphe.");
    expect(product.slug).toBe(products[0].slug);
    expect(product.supplier.verified).toBe(false);
    expect(product.description.paragraphs).toHaveLength(2);
    expect(product.related.every((item) => item.slug !== products[0].slug)).toBe(true);
  });
  it("produit un article de panier valide pour l'exemple", () => {
    const item = productToCartItem(sampleWatchProduct);
    expect(item.priceXof).toBe(919);
    expect(item.minimumQuantity).toBe(1);
  });
  it("l'exemple respecte le format attendu", () => {
    expect(sampleWatchProduct.images.length).toBeGreaterThanOrEqual(6);
    expect(sampleWatchProduct.priceMin).toBeLessThanOrEqual(sampleWatchProduct.priceMax);
    expect(sampleWatchProduct.reviews.distribution.reduce((a, b) => a + b, 0)).toBe(sampleWatchProduct.reviews.count);
  });
});
