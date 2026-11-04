/**
 * Client de l'API d'administration v1 (application boutique), utilisé par les écrans du back-office.
 *
 * Les règles métier (prix, stock, permissions, audit) vivent une seule fois, dans l'API. Le
 * back-office signe un jeton d'accès court (2 minutes) pour l'employé connecté, avec le secret
 * partagé ADMIN_API_JWT_SECRET (même valeur sur les deux projets Vercel). L'API revérifie le compte,
 * le mot de passe et les permissions à chaque appel : le jeton ne donne aucun droit supplémentaire.
 */
import { requireEmployee } from "@/lib/permissions";
import { accessTokensConfigured, signAccessToken } from "@/lib/api-tokens";

export type ApiListMeta = { page: number; limit: number; total: number; totalPages: number };

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export function apiBaseUrl(): string {
  return (process.env.ADMIN_API_BASE_URL || process.env.STOREFRONT_URL || "https://mybigmarket.vercel.app").replace(/\/+$/, "");
}

/** Le branchement à l'API est-il configuré (secret partagé présent) ? */
export function adminApiConfigured(): boolean {
  return accessTokensConfigured();
}

type CallOptions = { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; raw?: boolean; idempotencyKey?: string };

async function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
  if (!adminApiConfigured()) {
    throw new AdminApiError(503, "NOT_CONFIGURED", "Le back-office n'est pas relié à l'API : ajoutez ADMIN_API_JWT_SECRET (même valeur que sur le projet mybigmarket) dans les variables Vercel de ce projet.");
  }
  const { employeeId, passwordChangedAt } = await requireEmployee();
  const token = signAccessToken({ sub: employeeId, pwd: Math.floor(passwordChangedAt.getTime() / 1000) }, undefined, 120);
  const url = new URL(`${apiBaseUrl()}/api/v1${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: options.raw ? "text/csv" : "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new AdminApiError(503, "UNREACHABLE", `L'API (${url.host}) ne répond pas. Réessayez dans un instant.`);
  }
  if (!response.ok && !(options.raw && response.status < 400)) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
    throw new AdminApiError(response.status, payload?.error?.code ?? "HTTP_ERROR", payload?.error?.message ?? `Erreur ${response.status} de l'API.`, payload?.error?.details);
  }
  return response;
}

/** Appel renvoyant `data` (objet) — 204 renvoie null. */
export async function adminApi<T = unknown>(method: string, path: string, options: CallOptions = {}): Promise<T> {
  const response = await call(method, path, options);
  if (response.status === 204) return null as T;
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

/** Appel d'une liste paginée : `{ data, meta }`. */
export async function adminApiList<T = unknown>(path: string, query: CallOptions["query"] = {}): Promise<{ data: T[]; meta: ApiListMeta }> {
  const response = await call("GET", path, { query });
  return (await response.json()) as { data: T[]; meta: ApiListMeta };
}

/** Réponse brute (export CSV). */
export async function adminApiRaw(path: string, query: CallOptions["query"] = {}): Promise<Response> {
  return call("GET", path, { query, raw: true });
}

/** Message lisible pour l'utilisateur (détails de validation compris). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    const issues = Array.isArray(error.details) ? (error.details as Array<{ path?: string; message?: string }>).map((issue) => (issue.path ? `${issue.path} : ${issue.message}` : issue.message)).filter(Boolean) : [];
    return [error.message, ...issues].join(" — ").slice(0, 400);
  }
  return "Une erreur inattendue est survenue.";
}
