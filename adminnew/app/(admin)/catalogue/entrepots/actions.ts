"use server";

import { adminApi } from "@/lib/admin-api";
import { checkbox, codeFrom, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/catalogue/entrepots";

export async function createWarehouseAction(form: FormData) {
  await requireEmployee("catalog.stock.manage");
  const name = text(form, "name");
  await runAndRedirect(PATH, `Entrepôt « ${name} » créé.`, () => adminApi("POST", "/admin/warehouses", {
    body: { code: codeFrom(text(form, "code") || name).slice(0, 40), name, countryCode: (text(form, "countryCode") || "CI").toUpperCase(), city: optionalText(form, "city"), address: optionalText(form, "address"), isSellable: checkbox(form, "isSellable") },
  }));
}

export async function updateWarehouseAction(form: FormData) {
  await requireEmployee("catalog.stock.manage");
  const field = text(form, "field");
  const body = field === "default" ? { isDefault: true } : { [field]: text(form, "value") === "true" };
  await runAndRedirect(PATH, "Entrepôt mis à jour (compteurs de la boutique recalés si besoin).", () => adminApi("PATCH", `/admin/warehouses/${text(form, "warehouseId")}`, { body }));
}

export async function deleteWarehouseAction(form: FormData) {
  await requireEmployee("catalog.stock.manage");
  await runAndRedirect(PATH, "Entrepôt supprimé.", () => adminApi("DELETE", `/admin/warehouses/${text(form, "warehouseId")}`));
}
