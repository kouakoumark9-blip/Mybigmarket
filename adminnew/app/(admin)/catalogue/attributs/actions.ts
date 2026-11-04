"use server";

import { adminApi } from "@/lib/admin-api";
import { checkbox, codeFrom, list, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/catalogue/attributs";

export async function createGroupAction(form: FormData) {
  await requireEmployee("catalog.attributes.create");
  const name = text(form, "name");
  const values = list(form, "values").map((value, position) => ({ code: codeFrom(value), name: value, position }));
  await runAndRedirect(PATH, `Groupe « ${name} » créé.`, () => adminApi("POST", "/admin/attribute-groups", { body: { code: codeFrom(text(form, "code") || name), name, displayType: text(form, "displayType") || "select", values } }));
}

export async function toggleGroupAction(form: FormData) {
  await requireEmployee("catalog.attributes.update");
  await runAndRedirect(PATH, "Groupe mis à jour.", () => adminApi("PATCH", `/admin/attribute-groups/${text(form, "groupId")}`, { body: { isActive: !checkbox(form, "isActive") } }));
}

export async function deleteGroupAction(form: FormData) {
  await requireEmployee("catalog.attributes.delete");
  await runAndRedirect(PATH, "Groupe supprimé.", () => adminApi("DELETE", `/admin/attribute-groups/${text(form, "groupId")}`));
}

export async function addValueAction(form: FormData) {
  await requireEmployee("catalog.attributes.create");
  const name = text(form, "name");
  await runAndRedirect(PATH, `Valeur « ${name} » ajoutée.`, () => adminApi("POST", `/admin/attribute-groups/${text(form, "groupId")}/values`, { body: { code: codeFrom(name), name, colorHex: optionalText(form, "colorHex") } }));
}

export async function deleteValueAction(form: FormData) {
  await requireEmployee("catalog.attributes.delete");
  await runAndRedirect(PATH, "Valeur supprimée.", () => adminApi("DELETE", `/admin/attribute-groups/${text(form, "groupId")}/values/${text(form, "valueId")}`));
}
