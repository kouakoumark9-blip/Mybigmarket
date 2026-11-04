"use server";

import { adminApi } from "@/lib/admin-api";
import { integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/marketing/regles";

export async function createRuleAction(form: FormData) {
  await requireEmployee("pricing.create");
  const ids = (key: string) => form.getAll(key).map(Number).filter(Boolean);
  await runAndRedirect(PATH, "Règle de prix créée.", () => adminApi("POST", "/admin/catalog-price-rules", {
    body: {
      name: text(form, "name"), reductionType: text(form, "reductionType"), reductionValue: Number(text(form, "reductionValue").replace(",", ".")),
      fromQuantity: integer(form, "fromQuantity") ?? 1, customerGroupId: integer(form, "customerGroupId") ?? null, countryCode: optionalText(form, "countryCode"),
      dateFrom: optionalText(form, "dateFrom"), dateTo: optionalText(form, "dateTo"),
      conditions: { ...(ids("categoryIds").length ? { categoryIds: ids("categoryIds") } : {}), ...(ids("brandIds").length ? { brandIds: ids("brandIds") } : {}) },
    },
  }));
}

export async function toggleRuleAction(form: FormData) {
  await requireEmployee("pricing.update");
  await runAndRedirect(PATH, "Règle mise à jour.", () => adminApi("PATCH", `/admin/catalog-price-rules/${text(form, "ruleId")}`, { body: { isActive: text(form, "isActive") !== "true" } }));
}

export async function deleteRuleAction(form: FormData) {
  await requireEmployee("pricing.delete");
  await runAndRedirect(PATH, "Règle supprimée.", () => adminApi("DELETE", `/admin/catalog-price-rules/${text(form, "ruleId")}`));
}
