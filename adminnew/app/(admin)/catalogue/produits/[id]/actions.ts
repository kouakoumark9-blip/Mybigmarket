"use server";

import { revalidatePath } from "next/cache";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { checkbox, integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const page = (form: FormData, section: string) => `/catalogue/produits/${text(form, "productId")}#${section}`;
const id = (form: FormData) => text(form, "productId");

export async function updateGeneralAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "general"), "Informations enregistrées.", () => adminApi("PATCH", `/admin/products/${id(form)}`, {
    body: {
      version: integer(form, "version"),
      title: text(form, "title"),
      slug: text(form, "slug"),
      reference: optionalText(form, "reference"),
      sku: optionalText(form, "sku"),
      ean13: optionalText(form, "ean13"),
      mpn: optionalText(form, "mpn"),
      shortDescription: optionalText(form, "shortDescription"),
      description: text(form, "description"),
      categoryId: integer(form, "categoryId"),
      brandId: integer(form, "brandId") ?? null,
      condition: text(form, "condition"),
      visibility: text(form, "visibility"),
      availableForOrder: checkbox(form, "availableForOrder"),
      showPrice: checkbox(form, "showPrice"),
      isFeatured: checkbox(form, "isFeatured"),
      minimumQuantity: integer(form, "minimumQuantity"),
      lowStockThreshold: integer(form, "lowStockThreshold"),
      leadTimeDays: integer(form, "leadTimeDays"),
      outOfStockBehavior: text(form, "outOfStockBehavior"),
      weightGrams: integer(form, "weightGrams") ?? 0,
      lengthMm: integer(form, "lengthMm") ?? 0,
      widthMm: integer(form, "widthMm") ?? 0,
      heightMm: integer(form, "heightMm") ?? 0,
      tags: text(form, "tags").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 50),
    },
  }));
}

export async function updatePricesAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "prix"), "Prix enregistrés.", () => adminApi("PATCH", `/admin/products/${id(form)}`, {
    body: { version: integer(form, "version"), priceXof: integer(form, "priceXof"), purchasePriceXof: integer(form, "purchasePriceXof") ?? null, ecotaxXof: integer(form, "ecotaxXof") ?? 0, taxRuleGroupId: optionalText(form, "taxRuleGroupId") },
  }));
}

export async function updateSeoAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  const redirectType = optionalText(form, "redirectType");
  await runAndRedirect(page(form, "seo"), "Référencement enregistré.", () => adminApi("PATCH", `/admin/products/${id(form)}`, {
    body: {
      version: integer(form, "version"), seoTitle: optionalText(form, "seoTitle"), seoDescription: optionalText(form, "seoDescription"), canonicalPath: optionalText(form, "canonicalPath"),
      redirectType, redirectTargetType: redirectType ? optionalText(form, "redirectTargetType") : null, redirectTarget: redirectType ? optionalText(form, "redirectTarget") : null,
    },
  }));
}

export async function setStatusAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  const status = text(form, "status");
  await runAndRedirect(page(form, "general"), status === "approved" ? "Produit mis en ligne." : "Statut mis à jour.", () => adminApi("PATCH", `/admin/products/${id(form)}`, { body: { status } }));
}

export async function duplicateAction(form: FormData) {
  await requireEmployee("catalog.products.create");
  await runAndRedirect(page(form, "general"), "Copie créée en brouillon.", () => adminApi<{ id: string }>("POST", `/admin/products/${id(form)}/duplicate`, { body: {} }), { successPath: (result) => `/catalogue/produits/${(result as { id: string }).id}` });
}

export async function trashAction(form: FormData) {
  await requireEmployee("catalog.products.delete");
  await runAndRedirect(page(form, "general"), "Produit placé dans la corbeille.", () => adminApi("DELETE", `/admin/products/${id(form)}`), { successPath: () => "/catalogue/produits" });
}

/* Images */
export type PhotoUploadResult = { ok: true; added: number } | { ok: false; error: string };

/**
 * Téléversement d'une ou plusieurs photos (déjà réduites dans le navigateur) vers l'API, qui vérifie
 * le format, les stocke et les ajoute au produit. Rend un résultat au lieu de rediriger : le
 * composant d'envoi enchaîne les photos et affiche l'avancement.
 */
export async function uploadPhotosAction(form: FormData): Promise<PhotoUploadResult> {
  await requireEmployee("catalog.products.update");
  const productId = text(form, "productId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return { ok: false, error: "Produit invalide." };
  const files = form.getAll("files").filter((entry): entry is File => typeof entry === "object" && entry !== null && "arrayBuffer" in entry && (entry as File).size > 0);
  if (!files.length) return { ok: false, error: "Aucune photo reçue." };
  const payload = new FormData();
  for (const file of files) payload.append("files", file, file.name);
  const alt = optionalText(form, "alt");
  if (alt) payload.set("alt", alt);
  if (checkbox(form, "isCover")) payload.set("isCover", "1");
  try {
    const result = await adminApi<{ added: unknown[] }>("POST", `/admin/products/${productId}/images/upload`, { form: payload });
    revalidatePath(`/catalogue/produits/${productId}`);
    return { ok: true, added: result.added.length };
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) };
  }
}

export async function addImageAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "images"), "Image ajoutée.", () => adminApi("POST", `/admin/products/${id(form)}/images`, { body: { url: text(form, "url"), alt: optionalText(form, "alt"), isCover: checkbox(form, "isCover") } }));
}

export async function setCoverAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "images"), "Image de couverture changée.", () => adminApi("PATCH", `/admin/products/${id(form)}/images/${text(form, "imageId")}`, { body: { isCover: true } }));
}

export async function deleteImageAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "images"), "Image supprimée.", () => adminApi("DELETE", `/admin/products/${id(form)}/images/${text(form, "imageId")}`));
}

export async function moveImageAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  const order = text(form, "order").split(",").map(Number).filter(Boolean);
  const index = order.indexOf(Number(text(form, "imageId")));
  const target = index + (text(form, "direction") === "up" ? -1 : 1);
  if (index >= 0 && target >= 0 && target < order.length) [order[index], order[target]] = [order[target], order[index]];
  await runAndRedirect(page(form, "images"), "Ordre des images enregistré.", () => adminApi("PUT", `/admin/products/${id(form)}/images/order`, { body: { imageIds: order } }));
}

/* Déclinaisons */
export async function generateCombinationsAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  const attributeValueIds = form.getAll("attributeValueIds").map(String).filter(Boolean);
  await runAndRedirect(page(form, "declinaisons"), "Déclinaisons générées.", () => adminApi("POST", `/admin/products/${id(form)}/combinations/generate`, { body: { attributeValueIds, priceImpactXof: integer(form, "priceImpactXof") ?? 0 } }));
}

export async function updateCombinationAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "declinaisons"), "Déclinaison enregistrée.", () => adminApi("PATCH", `/admin/products/${id(form)}/combinations/${text(form, "variantId")}`, {
    body: { sku: optionalText(form, "sku"), priceDeltaXof: integer(form, "priceDeltaXof") ?? 0, lowStockThreshold: integer(form, "lowStockThreshold") ?? 0, isActive: checkbox(form, "isActive"), ...(checkbox(form, "isDefault") ? { isDefault: true as const } : {}) },
  }));
}

export async function deleteCombinationAction(form: FormData) {
  await requireEmployee("catalog.products.update");
  await runAndRedirect(page(form, "declinaisons"), "Déclinaison supprimée.", () => adminApi("DELETE", `/admin/products/${id(form)}/combinations/${text(form, "variantId")}`));
}

/* Prix spécifiques et paliers */
export async function addSpecificPriceAction(form: FormData) {
  await requireEmployee("pricing.create");
  const value = Number(text(form, "reductionValue").replace(",", "."));
  await runAndRedirect(page(form, "prix-specifiques"), "Prix spécifique ajouté.", () => adminApi("POST", `/admin/products/${id(form)}/specific-prices`, {
    body: {
      reductionType: text(form, "reductionType"), reductionValue: value, fromQuantity: integer(form, "fromQuantity") ?? 1,
      customerGroupId: integer(form, "customerGroupId") ?? null, variantId: integer(form, "variantId") ?? null, countryCode: optionalText(form, "countryCode"),
      dateFrom: optionalText(form, "dateFrom"), dateTo: optionalText(form, "dateTo"),
    },
  }));
}

export async function deleteSpecificPriceAction(form: FormData) {
  await requireEmployee("pricing.delete");
  await runAndRedirect(page(form, "prix-specifiques"), "Prix spécifique supprimé.", () => adminApi("DELETE", `/admin/specific-prices/${text(form, "specificPriceId")}`));
}

export async function setTiersAction(form: FormData) {
  await requireEmployee("pricing.update");
  const tiers = [0, 1, 2, 3, 4, 5].map((index) => ({ minimumQuantity: integer(form, `min${index}`), maximumQuantity: integer(form, `max${index}`) ?? null, unitPriceXof: integer(form, `price${index}`) }))
    .filter((tier): tier is { minimumQuantity: number; maximumQuantity: number | null; unitPriceXof: number } => tier.minimumQuantity !== undefined && tier.unitPriceXof !== undefined);
  await runAndRedirect(page(form, "paliers"), "Prix dégressifs enregistrés.", () => adminApi("PUT", `/admin/products/${id(form)}/price-tiers`, { body: { tiers } }));
}

/* Stock */
export async function adjustProductStockAction(form: FormData) {
  await requireEmployee("catalog.stock.update");
  const quantity = integer(form, "quantity") ?? 0;
  const direction = text(form, "direction") === "out" ? -1 : 1;
  await runAndRedirect(page(form, "stock"), "Mouvement de stock enregistré.", () => adminApi("POST", "/admin/stock/adjustments", {
    body: { productId: id(form), variantId: integer(form, "variantId") ?? null, warehouseId: optionalText(form, "warehouseId"), delta: direction * quantity, reason: text(form, "reason"), note: optionalText(form, "note") },
  }));
}
