"use server";

import { adminApi } from "@/lib/admin-api";
import { integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/contenu/bannieres";
const iso = (value: string) => (value ? new Date(`${value}T00:00:00Z`).toISOString() : null);

export async function createBannerAction(form: FormData) {
  await requireEmployee("appearance.create");
  await runAndRedirect(PATH, "Bannière créée.", () => adminApi("POST", "/admin/banners", {
    body: { name: text(form, "name"), imageUrl: text(form, "imageUrl"), alt: text(form, "alt"), targetUrl: optionalText(form, "targetUrl"), placement: text(form, "placement") || "home", startsAt: iso(text(form, "startsAt")), endsAt: iso(text(form, "endsAt")), sortOrder: integer(form, "sortOrder") ?? 0, isActive: true },
  }));
}

export async function toggleBannerAction(form: FormData) {
  await requireEmployee("appearance.update");
  await runAndRedirect(PATH, "Bannière mise à jour.", () => adminApi("PATCH", `/admin/banners/${text(form, "bannerId")}`, { body: { isActive: text(form, "isActive") !== "true" } }));
}

export async function deleteBannerAction(form: FormData) {
  await requireEmployee("appearance.delete");
  await runAndRedirect(PATH, "Bannière supprimée.", () => adminApi("DELETE", `/admin/banners/${text(form, "bannerId")}`));
}
