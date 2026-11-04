import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Incident réel (migration de production) : une fois la base migrée, la lecture du catalogue
 * réussit, mais aucun produit n'y est encore publié. L'accueil affiche le catalogue de
 * démonstration ; /produits et les fiches doivent rester cohérents avec lui tant qu'aucun
 * produit réel n'est publié, au lieu d'une liste vide et de fiches « introuvables ».
 */

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

/** Chaîne Drizzle factice : chaque appel renvoie la chaîne, l'attente renvoie `state.rows`. */
function chain(): unknown {
  return new Proxy(function () {}, {
    get: (_target, property) => (property === "then" ? (resolve: (value: unknown) => void) => resolve(state.rows) : () => chain()),
    apply: () => chain(),
  });
}

vi.mock("@/lib/db", () => ({ getDb: () => chain() }));

const { getCatalogProducts, getCatalogProduct, getStoreSellers } = await import("@/lib/catalog");

describe("catalogue public quand la base ne contient encore aucun produit publié", () => {
  const previous = process.env.DATABASE_URL;
  beforeEach(() => { process.env.DATABASE_URL = "postgres://test"; state.rows = []; });
  afterEach(() => { process.env.DATABASE_URL = previous; });

  it("garde le catalogue de démonstration, comme l'accueil", async () => {
    const demo = await getCatalogProducts({ forceDemo: true });
    const live = await getCatalogProducts();
    expect(live.map((product) => product.slug)).toEqual(demo.map((product) => product.slug));
    expect(await getCatalogProduct("smartphone-camon-50-pro")).toBeTruthy();
    expect((await getStoreSellers()).length).toBeGreaterThan(0);
  });

  it("bascule sur les produits réels dès qu'il y en a un de publié", async () => {
    state.rows = [{
      product: { id: "p1", slug: "produit-reel", title: "Produit réel", description: "", priceXof: 1000, minimumQuantity: 1, leadTimeDays: 7, quantity: 3 },
      category: { name: "Maison", slug: "maison" },
      user: { name: "Vendeur", email: "vendeur@example.com" },
      profile: { university: "", cityChina: "Yiwu", ratingAvg: "4.5", ratingCount: 2 },
    }];
    const live = await getCatalogProducts();
    expect(live.map((product) => product.slug)).toEqual(["produit-reel"]);
  });
});
