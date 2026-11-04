"use server";

import { adminApi } from "@/lib/admin-api";
import { checkbox, integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const tagsFrom = (value: string) => value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 50);

/** Création d'un produit via l'API (stock initial tracé dans l'entrepôt par défaut). */
export async function createProductAction(form: FormData) {
  await requireEmployee("catalog.products.create");
  const initialQuantity = integer(form, "initialQuantity");
  await runAndRedirect("/catalogue/produits/nouveau", "Produit créé.", () => adminApi<{ id: string }>("POST", "/admin/products", {
    idempotencyKey: text(form, "idempotencyKey") || undefined,
    body: {
      title: text(form, "title"),
      sellerId: text(form, "sellerId"),
      categoryId: integer(form, "categoryId"),
      brandId: integer(form, "brandId") ?? null,
      taxRuleGroupId: optionalText(form, "taxRuleGroupId"),
      productType: text(form, "productType") || "standard",
      priceXof: integer(form, "priceXof"),
      purchasePriceXof: integer(form, "purchasePriceXof") ?? null,
      reference: optionalText(form, "reference"),
      sku: optionalText(form, "sku"),
      shortDescription: optionalText(form, "shortDescription"),
      description: text(form, "description"),
      minimumQuantity: integer(form, "minimumQuantity") ?? 1,
      tags: tagsFrom(text(form, "tags")),
      status: checkbox(form, "publish") ? "approved" : undefined,
      ...(initialQuantity ? { initialQuantity } : {}),
    },
  }), { successPath: (result) => `/catalogue/produits/${(result as { id: string }).id}` });
}
