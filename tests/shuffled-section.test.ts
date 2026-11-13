import { describe, expect, it } from "vitest";
import { pickVaried } from "@/components/shop/shuffled-section";
import type { ShopProduct } from "@/lib/shop/types";

const pool = Array.from({ length: 12 }, (_, i) => ({ id: String(i), priceXof: (i + 1) * 10000 })) as unknown as ShopProduct[];

describe("accueil : « Prix les plus bas » varie à chaque visite", () => {
  it("tire le nombre demandé de produits distincts, rangés du moins cher au plus cher", () => {
    const picked = pickVaried(pool, 8);
    expect(picked).toHaveLength(8);
    expect(new Set(picked.map((item) => item.id)).size).toBe(8);
    expect(picked.map((item) => item.priceXof)).toEqual([...picked.map((item) => item.priceXof)].sort((a, b) => a - b));
  });
  it("ne donne pas toujours les mêmes produits", () => {
    const sets = new Set(Array.from({ length: 30 }, () => pickVaried(pool, 8).map((item) => item.id).join(",")));
    expect(sets.size).toBeGreaterThan(1);
  });
  it("ne touche pas à la liste d'origine", () => {
    const before = pool.map((item) => item.id).join(",");
    pickVaried(pool, 8);
    expect(pool.map((item) => item.id).join(",")).toBe(before);
  });
});
