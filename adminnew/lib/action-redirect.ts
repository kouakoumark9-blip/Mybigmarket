import { redirect } from "next/navigation";
import { apiErrorMessage } from "@/lib/admin-api";

/**
 * Exécute une action vers l'API puis redirige avec un message de succès ou d'erreur.
 * La redirection est faite hors du try/catch : l'exception NEXT_REDIRECT n'est jamais avalée.
 */
export async function runAndRedirect(path: string, success: string, work: () => Promise<unknown>, options: { successPath?: (result: unknown) => string } = {}): Promise<never> {
  let target: string;
  try {
    const result = await work();
    target = withParam(options.successPath ? options.successPath(result) : path, "ok", success);
  } catch (error) {
    if (isRedirect(error)) throw error;
    target = withParam(path, "error", apiErrorMessage(error));
  }
  redirect(target);
}

/** Ajoute un paramètre de requête en conservant l'ancre (#section). */
function withParam(path: string, key: string, value: string): string {
  const [base, hash] = path.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

function isRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Lecture de champs de formulaire. */
export const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
export const optionalText = (form: FormData, key: string) => text(form, key) || null;
export const integer = (form: FormData, key: string) => {
  const value = text(form, key).replace(/\s/g, "");
  return value === "" ? undefined : Number(value);
};
export const checkbox = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";
