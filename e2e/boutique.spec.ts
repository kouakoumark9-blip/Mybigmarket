import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "";

test.describe("vitrine", () => {
  test("accueil : menu des catégories, bannières, réassurance, produits, sans trace de l'ancien positionnement", async ({ page }) => {
    const console_ = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Catégories" }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Offres du moment" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Catégories de la boutique" }).getByRole("link", { name: "Lits" })).toBeVisible();
    await expect(page.getByText("Paiement mobile money sécurisé")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meilleures ventes" })).toBeVisible();
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["chine →", "prix indicatif", "livraison à confirmer", "vendu par", "afrique de l’ouest", "exemple de démonstration"]) expect(text).not.toContain(forbidden);
    console_.assertClean();
  });

  test("adresses propres des catégories, fil d'Ariane, filtres et FAQ", async ({ page }) => {
    await page.goto("/lits");
    await expect(page.getByRole("heading", { level: 1, name: "Lits" })).toBeVisible();
    // Colonne « Catégorie » (ordinateur) : intertitres en gras et liens en dessous
    const side = page.getByRole("navigation", { name: "Catégories Lits" });
    for (const title of ["Par taille", "Par type", "Par matière", "Packs"]) await expect(side.getByRole("heading", { name: title })).toBeVisible();
    await expect(side.getByRole("link", { name: "Lits 3 places" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Filtres" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Questions fréquentes" })).toBeVisible();
    await expect(page).toHaveTitle(/Lits à Abidjan/);
    await expect(page.locator(".mb-cat-banner")).toHaveCount(1);
    await page.goto("/lits/lits-2-places");
    await expect(page.locator(".mb-cat-banner")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Fil d'Ariane" }).getByText("Lits 2 places")).toBeVisible();
    expect((await page.goto("/lits/lits-1-place"))?.status()).toBe(200);
    await expect(page.locator(".mb-cat-banner")).toHaveCount(1);
    for (const withBanner of ["lits-2-5-places", "lits-3-places", "lits-pliables", "lits-en-bois", "lits-metal", "lits-enfants", "lits-superposes", "lits-mezzanine", "lits-avec-chevets", "lits-avec-rangement"]) {
      await page.goto(`/lits/${withBanner}`);
      await expect(page.locator(".mb-cat-banner"), withBanner).toHaveCount(1);
    }
    await page.goto("/lits/pack-lit-matelas");
    await expect(page.locator(".mb-cat-banner")).toHaveCount(0); // pas de bannière pour cette catégorie
    for (const path of ["lits-1-place", "lits-2-5-places", "lits-3-places", "lits-enfants", "lits-superposes", "lits-pliables", "lits-mezzanine", "lits-avec-chevets", "lits-avec-rangement", "lits-en-bois", "lits-metal", "pack-lit-matelas"]) {
      expect((await page.goto(`/lits/${path}`))?.status(), path).toBe(200);
    }
    const missing = await page.goto("/rubrique-qui-n-existe-pas");
    expect(missing?.status()).toBe(404);
  });

  test("commande sans compte : panier, une page, confirmation WhatsApp, suivi", async ({ page }) => {
    await page.goto("/lits/lits-2-places");
    await page.locator('a[href^="/produits/"]').first().click();
    await page.waitForURL(/\/produits\//);
    await page.waitForLoadState("networkidle"); // la fiche est servie du cache : on attend que la page soit active avant de cliquer
    await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
    await expect(page.locator(".pd-feedback").first()).toContainText("Ajouté au panier");
    await page.getByRole("link", { name: /^Panier/ }).first().click();
    await page.waitForURL(/\/panier/);
    await expect(page.getByText("En stock à Abidjan").first()).toBeVisible();
    await page.getByRole("link", { name: "Commander", exact: true }).click();
    await page.getByLabel("Nom et prénom").fill("Awa Koné");
    await page.getByLabel("Téléphone").fill("07 12 34 56 78");
    await page.getByLabel("Commune ou ville").selectOption("Cocody");
    await page.getByLabel("Adresse précise").fill("Riviera 2, rue des Jardins");
    // Paiement : uniquement le mobile money, aucune mention du paiement à la livraison, aucun prix dans la liste des communes
    await expect(page.getByRole("radio")).toHaveCount(4);
    await expect(page.getByText(/à la livraison/i)).toHaveCount(0);
    expect(await page.locator("#c-commune option").allInnerTexts()).not.toContainEqual(expect.stringMatching(/FCFA|\d/));
    await page.getByRole("radio", { name: /Orange Money/ }).check();
    await page.getByRole("button", { name: "Confirmer la commande" }).click();
    await page.waitForURL(/\/commande\/confirmation\/MBM-/);
    const reference = page.url().split("/").pop()!;
    await expect(page.getByRole("link", { name: "Envoyer ma commande sur WhatsApp" })).toHaveAttribute("href", new RegExp(`wa\\.me/.*${reference}`));
    await page.goto(`/suivi-commande?numero=${reference}&telephone=0712345678`);
    await expect(page.getByText(`Commande ${reference}`)).toBeVisible();
  });

  test("la fiche produit fonctionne et affiche le délai de livraison", async ({ page }) => {
    const console_ = watchConsole(page);
    await page.goto("/produits/lit-2-places-test-e2e");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lit 2 places");
    await expect(page.getByText("livraison 24 à 72 h").first()).toBeVisible();
    console_.assertClean();
  });
});

test.describe("administration", () => {
  test("adresse protégée, jamais indexée, absente du sitemap", async ({ page, request }) => {
    const response = await request.get("/gestion/connexion");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/gestion");
    await page.goto("/gestion/produits");
    await expect(page).toHaveURL(/\/gestion\/connexion/);
  });

  test("connexion, commande reçue, produit ajouté", async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "Identifiants d'administration non fournis.");
    await page.goto("/gestion/connexion");
    await page.getByLabel("Adresse e-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Mot de passe").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await page.goto("/gestion/commandes");
    await expect(page.getByRole("link", { name: /^MBM-/ }).first()).toBeVisible();
    await page.goto("/gestion/produits/nouveau");
    await page.getByLabel("Nom du produit").fill("Lit 1 place en métal e2e");
    await page.getByLabel("Catégorie").selectOption({ label: "Lits › Lits 1 place" });
    await page.getByLabel("Prix de vente (FCFA)").fill("12500");
    await page.getByLabel("Description", { exact: true }).fill("Lit en métal de test.");
    await page.getByRole("button", { name: "Enregistrer le produit" }).click();
    await page.waitForURL(/\/gestion\/produits\/[0-9a-f-]{36}/);
    await page.goto("/gestion");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/gestion\/connexion/);
  });
});
