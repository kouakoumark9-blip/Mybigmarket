"use server";

import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/catalogue/stock/operations";

/** Champ « produit » : « uuid » ou « uuid:idDéclinaison ». */
const target = (form: FormData) => {
  const [productId, variantId] = text(form, "target").split(":");
  return { productId, variantId: variantId ? Number(variantId) : null };
};

export async function transferAction(form: FormData) {
  await requireEmployee("catalog.stock.update");
  await runAndRedirect(`${PATH}#transfert`, "Transfert enregistré.", () => adminApi("POST", "/admin/stock/transfers", {
    body: { ...target(form), fromWarehouseId: text(form, "fromWarehouseId"), toWarehouseId: text(form, "toWarehouseId"), quantity: integer(form, "quantity"), note: optionalText(form, "note") },
  }));
}

export async function receiptAction(form: FormData) {
  await requireEmployee("catalog.stock.update");
  await runAndRedirect(`${PATH}#reception`, "Réception enregistrée.", () => adminApi("POST", "/admin/stock/receipts", {
    body: { warehouseId: optionalText(form, "warehouseId"), reference: text(form, "reference"), note: optionalText(form, "note"), items: [{ ...target(form), quantity: integer(form, "quantity"), unitCostXof: integer(form, "unitCostXof") ?? null }] },
  }));
}

export async function inventoryAction(form: FormData) {
  await requireEmployee("catalog.stock.update");
  await runAndRedirect(`${PATH}#inventaire`, "Inventaire enregistré.", () => adminApi("POST", "/admin/stock/inventory", {
    body: { warehouseId: optionalText(form, "warehouseId"), reference: optionalText(form, "reference"), items: [{ ...target(form), quantity: integer(form, "quantity") }] },
  }));
}

export type ImportState = { error?: string; result?: { dryRun: boolean; summary: { lines: number; ok: number; unchanged: number; errors: number }; report: Array<{ line: number; status: string; message?: string; before?: number; after?: number; warehouse?: string }> } };

/** Import CSV : simulation par défaut, rapport ligne par ligne affiché sur la page. */
export async function importAction(_previous: ImportState, form: FormData): Promise<ImportState> {
  await requireEmployee("catalog.import");
  const file = form.get("file");
  const csv = file instanceof File && file.size ? await file.text() : text(form, "csv");
  if (!csv) return { error: "Choisissez un fichier CSV ou collez son contenu." };
  if (csv.length > 900_000) return { error: "Fichier trop volumineux (900 Ko au maximum par import)." };
  try {
    const result = await adminApi<NonNullable<ImportState["result"]>>("POST", "/admin/stock/import", { body: { csv, mode: text(form, "mode") === "add" ? "add" : "set", dryRun: form.get("apply") !== "on" } });
    return { result };
  } catch (error) {
    const details = (error as { details?: { report?: NonNullable<ImportState["result"]>["report"] } }).details;
    if (details?.report) return { error: apiErrorMessage(error).split(" — ")[0], result: { dryRun: false, summary: { lines: details.report.length, ok: details.report.filter((line) => line.status === "ok").length, unchanged: details.report.filter((line) => line.status === "unchanged").length, errors: details.report.filter((line) => line.status === "error").length }, report: details.report } };
    return { error: apiErrorMessage(error) };
  }
}
