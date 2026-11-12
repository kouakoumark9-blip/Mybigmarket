import { describe, expect, it } from "vitest";
import { orderSchema } from "@/lib/shop/orders";
import { catalogToProduct } from "@/lib/pdp/adapters";
import type { DemoProduct } from "@/lib/demo-data";

const base = { name: "Awa Koné", phone: "0712345678", commune: "Cocody", address: "Riviera, rue 12", payment: "wave" as const };

describe("commande : lits vendus en plusieurs tailles", () => {
  it("accepte une ligne avec sa taille, et refuse une taille qui n'est pas un entier positif", () => {
    expect(orderSchema.safeParse({ ...base, cart: [{ slug: "lit-bilbao", qty: 1, variant: 12 }] }).success).toBe(true);
    expect(orderSchema.safeParse({ ...base, cart: [{ slug: "lit-bilbao", qty: 1 }] }).success).toBe(true);
    for (const variant of [0, -1, 1.5, "12; drop table"]) expect(orderSchema.safeParse({ ...base, cart: [{ slug: "lit-bilbao", qty: 1, variant }] }).success).toBe(false);
  });

  it("la fiche affiche une option « Taille » par déclinaison et la fourchette de prix", () => {
    const item = { slug: "lit-bilbao", title: "Lit BILBAO", priceXof: 469000, leadTimeDays: 3, category: "Lits", categorySlug: "lits", seller: "", sellerSlug: "", university: "", city: "", rating: 0, reviewCount: 0, icon: "", tone: "", quantity: 10, availability: "in_stock_abidjan",
      variants: [{ id: 1, label: "180×190 cm", priceXof: 469000, quantity: 5 }, { id: 2, label: "180×200 cm", priceXof: 479000, quantity: 0 }] } as DemoProduct;
    const product = catalogToProduct(item, [item], "Description.");
    expect(product.designLabel).toBe("Taille");
    expect(product.designOptions).toEqual([{ id: "1", label: "180×190 cm" }, { id: "2", label: "180×200 cm" }]);
    expect([product.priceMin, product.priceMax]).toEqual([469000, 479000]);
    expect(product.availability).toBe("InStock");
  });
});
