"use server";

import { adminApi } from "@/lib/admin-api";
import { optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/systeme/boutiques";

export async function createShopAction(form: FormData) {
  await requireEmployee("shops.manage");
  await runAndRedirect(PATH, "Boutique créée.", () => adminApi("POST", "/admin/shops", {
    body: { code: text(form, "code"), name: text(form, "name"), domain: optionalText(form, "domain"), copySettingsFrom: optionalText(form, "copySettingsFrom") ?? undefined },
  }));
}

export async function updateShopAction(form: FormData) {
  await requireEmployee("shops.manage");
  const action = text(form, "do");
  const body = action === "default" ? { isDefault: true } : action === "toggle" ? { isActive: text(form, "isActive") !== "true" } : { name: text(form, "name"), domain: optionalText(form, "domain") };
  await runAndRedirect(PATH, "Boutique mise à jour.", () => adminApi("PATCH", `/admin/shops/${text(form, "shopId")}`, { body }));
}
