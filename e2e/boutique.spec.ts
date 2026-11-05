/**
 * Parcours client complet sur la boutique : recherche, fiche produit, panier, création de compte,
 * commande enregistrée en base, suivi dans l'espace client, demande au service client.
 */
import { expect, test } from "@playwright/test";
import { uniqueEmail, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

test("la boutique s'affiche avec ses en-têtes de sécurité", async ({ page }) => {
  const console = watchConsole(page);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator("header").first()).toBeVisible();
  console.assertClean();
});

test("un client trouve un produit, commande et suit sa commande", async ({ page }) => {
  const console = watchConsole(page);

  // Recherche plein texte, tolérante aux accents.
  await page.goto("/produits?q=mixeur");
  const card = page.getByRole("link", { name: /Mixeur 3 vitesses 600 W/ }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { level: 1, name: /Mixeur 3 vitesses 600 W/ })).toBeVisible();

  // Panier (navigateur), puis création de compte qui ramène au tunnel.
  await page.getByRole("button", { name: /Ajouter au panier/ }).first().click();
  await page.goto("/panier");
  await expect(page.getByText(/Mixeur 3 vitesses 600 W/).first()).toBeVisible();

  const email = uniqueEmail("client");
  await page.goto("/inscription?callbackUrl=%2Fcheckout");
  await page.fill('input[name="name"]', "Client Parcours E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "+225 07 11 22 33 44");
  await page.fill('input[name="password"]', "Parcours-E2E-2026!");
  await page.locator("form.auth-form button").click();
  await page.waitForURL(/\/checkout/);

  // Tunnel : adresse en Côte d'Ivoire, paiement mobile (prestataire simulé), commande en base.
  await page.fill('input[name="name"]', "Client Parcours E2E");
  await page.fill('input[name="phone"]', "+225 07 11 22 33 44");
  await page.fill('[name="address"]', "Rue des Jardins, Cocody");
  await page.fill('input[name="city"]', "Abidjan");
  await page.getByRole("main").getByText("Wave", { exact: true }).click();
  await page.getByRole("button", { name: /Confirmer la commande/ }).click();
  await expect(page.getByRole("heading", { name: /Commande enregistrée/ })).toBeVisible();

  // Espace client : commande en attente de paiement, montant calculé par le serveur
  // (18 000 FCFA − 15 % de promotion = 15 300 HT, + TVA 18 % = 18 054 FCFA TTC).
  await page.goto("/compte/commandes");
  const order = page.getByRole("link", { name: /Commande #\w+ .*En attente de paiement.*18\s?054/ });
  await expect(order).toBeVisible();
  await order.click();
  await expect(page.getByText(/Mixeur 3 vitesses 600 W/).first()).toBeVisible();

  // Service client : demande liée au compte, visible dans l'historique.
  await page.goto("/compte/support");
  await page.fill('input[name="subject"]', "Délai de livraison à Abidjan");
  await page.fill('textarea[name="message"]', "Bonjour, quel est le délai de livraison pour ma commande ?");
  await page.getByRole("button", { name: /Envoyer ma demande/ }).click();
  await expect(page.getByText(/Délai de livraison à Abidjan/).first()).toBeVisible();

  console.assertClean();
});

test("une écriture envoyée depuis un autre site est refusée (CSRF)", async ({ request }) => {
  const response = await request.post("/api/v1/shop/support/tickets", {
    headers: { origin: "https://site-malveillant.example", "content-type": "application/json" },
    data: { subject: "Test", message: "Message envoyé par un site tiers.", email: "tiers@exemple.ci", name: "Tiers" },
  });
  expect(response.status()).toBe(403);
});
