import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "";

test.describe("vitrine", () => {
  test("accueil : menu des catégories, bannières, produits, sans trace de l'ancien positionnement", async ({ page }) => {
    const console_ = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Catégories" }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Offres du moment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meilleures ventes" })).toBeVisible();
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["chine →", "prix indicatif", "livraison à confirmer", "vendu par", "afrique de l’ouest", "exemple de démonstration"]) expect(text).not.toContain(forbidden);
    console_.assertClean();
  });

  test("adresses propres des catégories, fil d'Ariane, filtres et FAQ", async ({ page }) => {
    await page.goto("/climatiseurs");
    await expect(page.getByRole("heading", { level: 1, name: "Climatiseurs" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Filtres" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Questions fréquentes" })).toBeVisible();
    await expect(page).toHaveTitle(/Climatiseurs à Abidjan/);
    await page.goto("/climatiseurs/inverter");
    await expect(page.getByRole("navigation", { name: "Fil d'Ariane" }).getByText("Climatiseurs inverter")).toBeVisible();
    const missing = await page.goto("/rubrique-qui-n-existe-pas");
    expect(missing?.status()).toBe(404);
  });

  test("commande sans compte : panier, une page, confirmation WhatsApp, suivi", async ({ page }) => {
    await page.goto("/petit-electromenager/friteuses-a-air");
    await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
    await expect(page.getByRole("status")).toContainText("ajouté au panier");
    await page.goto("/panier");
    await expect(page.getByText("En stock à Abidjan").first()).toBeVisible();
    await page.getByRole("link", { name: "Commander", exact: true }).click();
    await page.getByLabel("Nom et prénom").fill("Awa Koné");
    await page.getByLabel("Téléphone").fill("07 12 34 56 78");
    await page.getByLabel("Commune ou ville").selectOption("Cocody");
    await page.getByLabel("Adresse précise").fill("Riviera 2, rue des Jardins");
    await expect(page.getByText("Paiement à la livraison").first()).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la commande" }).click();
    await page.waitForURL(/\/commande\/confirmation\/MBM-/);
    const reference = page.url().split("/").pop()!;
    await expect(page.getByRole("link", { name: "Envoyer ma commande sur WhatsApp" })).toHaveAttribute("href", new RegExp(`wa\\.me/.*${reference}`));
    await page.goto(`/suivi-commande?numero=${reference}&telephone=0712345678`);
    await expect(page.getByText(`Commande ${reference}`)).toBeVisible();
  });

  test("la fiche produit fonctionne et affiche le délai de livraison", async ({ page }) => {
    const console_ = watchConsole(page);
    await page.goto("/produits/friteuse-a-air-4-5-l-fictif");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Friteuse à air");
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
    await page.getByLabel("Nom du produit").fill("Bouilloire inox 1,7 L e2e");
    await page.getByLabel("Catégorie").selectOption({ label: "Petit électroménager › Bouilloires" });
    await page.getByLabel("Prix de vente (FCFA)").fill("12500");
    await page.getByLabel("Description", { exact: true }).fill("Bouilloire inox de test.");
    await page.getByRole("button", { name: "Enregistrer le produit" }).click();
    await page.waitForURL(/\/gestion\/produits\/[0-9a-f-]{36}/);
    await page.goto("/gestion");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/gestion\/connexion/);
  });
});
