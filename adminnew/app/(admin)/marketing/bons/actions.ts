"use server";

import { adminApi } from "@/lib/admin-api";
import { checkbox, integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/marketing/bons";

export async function createVoucherAction(form: FormData) {
  await requireEmployee("pricing.create");
  const discountType = text(form, "discountType");
  await runAndRedirect(PATH, "Bon de réduction créé.", () => adminApi("POST", "/admin/vouchers", {
    idempotencyKey: text(form, "idempotencyKey") || undefined,
    body: {
      code: optionalText(form, "code") ?? undefined,
      name: optionalText(form, "name"),
      discountType,
      discountValue: discountType === "none" ? 0 : integer(form, "discountValue") ?? 0,
      maximumDiscountXof: integer(form, "maximumDiscountXof") ?? null,
      minimumSubtotalXof: integer(form, "minimumSubtotalXof") ?? 0,
      usageLimit: integer(form, "usageLimit") ?? null,
      perCustomerLimit: integer(form, "perCustomerLimit") ?? null,
      customerGroupId: integer(form, "customerGroupId") ?? null,
      startsAt: optionalText(form, "startsAt"),
      endsAt: optionalText(form, "endsAt"),
      freeShipping: checkbox(form, "freeShipping"),
      combinable: checkbox(form, "combinable"),
      excludeDiscountedProducts: checkbox(form, "excludeDiscountedProducts"),
      categoryIds: form.getAll("categoryIds").map(Number).filter(Boolean),
    },
  }));
}

export async function toggleVoucherAction(form: FormData) {
  await requireEmployee("pricing.update");
  await runAndRedirect(PATH, "Bon mis à jour.", () => adminApi("PATCH", `/admin/vouchers/${text(form, "voucherId")}`, { body: { isActive: text(form, "isActive") !== "true" } }));
}

export async function deleteVoucherAction(form: FormData) {
  await requireEmployee("pricing.delete");
  await runAndRedirect(PATH, "Bon supprimé.", () => adminApi("DELETE", `/admin/vouchers/${text(form, "voucherId")}`));
}
