import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fous sur la page d'accueil et le diagnostic de production.
 *
 * Incident réel : la base Neon n'était pas migrée. La première requête
 * catalogue levait `relation "products" does not exist`, et l'accueil comme
 * /produits renvoyaient 500 — « This page couldn't load » sur tout le domaine.
 * Un visiteur ne doit jamais voir un écran d'erreur à la place de l'accueil.
 */

const root = resolve(__dirname, "..");
const catalog = readFileSync(resolve(root, "lib/catalog.ts"), "utf8");
const home = readFileSync(resolve(root, "app/page.tsx"), "utf8");
const health = readFileSync(resolve(root, "app/api/health/route.ts"), "utf8");

describe("accueil résilient aux pannes de base", () => {
  it("la page d'accueil lit le catalogue par le chemin protégé (repli sur la démonstration)", () => {
    // L'accueil montre les vrais produits ; getCatalogProducts intercepte toute panne de base.
    expect(home).toMatch(/getCatalogProducts\(\s*\)/);
    expect(catalog).toMatch(/catch \(error\) \{\s*\n\s*console\.error\("\[catalog\] Base injoignable, repli/);
  });

  it("le catalogue et les vendeurs encapsulent l'accès base", () => {
    expect(catalog).toMatch(/async function queryCatalog[\s\S]*?/);
    // Deux replis distincts : produits et vendeurs.
    expect(catalog.match(/Base injoignable, repli/g) ?? []).toHaveLength(2);
  });

  it("le repli est journalisé, jamais silencieux", () => {
    expect(catalog).toContain("console.error");
  });

  it("quand la base est configurée, la lecture en base reste le chemin normal", () => {
    expect(catalog).toMatch(/if \(!process\.env\.DATABASE_URL\) return demoCatalog\(options\);/);
    expect(catalog).toMatch(/try \{\s*\n\s*const rows = await queryCatalog\(options\);/);
  });
});

describe("route /api/health", () => {
  it("ne renvoie jamais la valeur d'un secret", () => {
    const responses = health.split("Response.json").slice(1);
    for (const block of responses) expect(block).not.toMatch(/process\.env/);
  });

  it("répond même quand la base est en panne", () => {
    expect(health).toMatch(/try\s*\{/);
    expect(health).toMatch(/catch\s*\(/);
  });

  it("distingue configuration, connexion et schéma", () => {
    expect(health).toContain('etape: "configuration"');
    expect(health).toContain('etape: "connexion"');
    expect(health).toContain("tablesManquantes");
  });

  it("n'a qu'un seul chemin vers 200 : base joignable et schéma complet", () => {
    expect(health.split("status: 200").length - 1).toBe(1);
  });

  it("interdit la mise en cache", () => {
    expect(health).toContain("no-store");
  });
});
