"use server";

import { AdminApiError, adminApi } from "@/lib/admin-api";
import { checkbox, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

type Item = { label: string; linkType: "url"; target: string; children?: Item[] };

/** Une ligne par lien « Libellé | /adresse » ; deux espaces en début de ligne = sous-lien du précédent. */
function parseItems(raw: string): Item[] {
  const items: Item[] = [];
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) continue;
    const [label, target] = line.split("|").map((part) => part?.trim() ?? "");
    if (!label || !target) throw new AdminApiError(400, "BAD_REQUEST", `Ligne incomplète : « ${line.trim()} » (format : Libellé | /adresse).`);
    const item: Item = { label, linkType: "url", target };
    if (/^\s{2,}/.test(line) && items.length) (items[items.length - 1].children ??= []).push(item);
    else items.push(item);
  }
  return items;
}

export async function saveMenuAction(form: FormData) {
  await requireEmployee("appearance.update");
  const code = text(form, "code");
  await runAndRedirect("/contenu/menus", "Menu enregistré.", async () => adminApi("PUT", `/admin/menus/${code}`, { body: { name: text(form, "name"), isActive: checkbox(form, "isActive"), items: parseItems(text(form, "items")) } }));
}
