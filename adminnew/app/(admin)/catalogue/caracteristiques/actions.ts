"use server";

import { adminApi } from "@/lib/admin-api";
import { codeFrom, list, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/catalogue/caracteristiques";

export async function createFeatureAction(form: FormData) {
  await requireEmployee("catalog.features.create");
  const name = text(form, "name");
  await runAndRedirect(PATH, `Caractéristique « ${name} » créée.`, () => adminApi("POST", "/admin/features", { body: { code: codeFrom(name), name, values: list(form, "values") } }));
}

export async function deleteFeatureAction(form: FormData) {
  await requireEmployee("catalog.features.delete");
  await runAndRedirect(PATH, "Caractéristique supprimée.", () => adminApi("DELETE", `/admin/features/${text(form, "featureId")}`));
}

export async function addFeatureValueAction(form: FormData) {
  await requireEmployee("catalog.features.create");
  await runAndRedirect(PATH, "Valeur ajoutée.", () => adminApi("POST", `/admin/features/${text(form, "featureId")}/values`, { body: { value: text(form, "value") } }));
}

export async function deleteFeatureValueAction(form: FormData) {
  await requireEmployee("catalog.features.delete");
  await runAndRedirect(PATH, "Valeur supprimée.", () => adminApi("DELETE", `/admin/features/${text(form, "featureId")}/values/${text(form, "valueId")}`));
}
