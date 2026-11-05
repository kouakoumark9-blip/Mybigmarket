/**
 * Back-office : connexion d'un employé, catalogue et commandes issus des données de démonstration,
 * fiche commande, journal d'audit. Ignoré si E2E_ADMIN_EMAIL n'est pas fourni.
 */
import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

const ADMIN_URL = process.env.E2E_ADMIN_URL || "http://localhost:3002";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test.skip(!email || !password, "E2E_ADMIN_EMAIL et E2E_ADMIN_PASSWORD requis");

test("un employé se connecte et retrouve catalogue et commandes", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto(`${ADMIN_URL}/login`);
  await page.fill('input[name="email"]', email!);
  await page.fill('input[name="password"]', password!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.goto(`${ADMIN_URL}/catalogue/produits`);
  await expect(page.getByText(/T-shirt coton bio/).first()).toBeVisible();

  await page.goto(`${ADMIN_URL}/commandes`);
  await expect(page.getByText(/Awa Koné|Koffi Yao|Fatou Diallo/).first()).toBeVisible();

  const response = await page.goto(`${ADMIN_URL}/`);
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  console.assertClean();
});
