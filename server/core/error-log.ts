/**
 * Journal des erreurs serveur (étape 7). Chaque erreur inattendue de l'API, d'une tâche planifiée
 * ou d'un abonné aux événements y est enregistrée, avec une empreinte qui regroupe les répétitions.
 * L'enregistrement ne lève jamais d'exception : une base indisponible n'aggrave pas l'erreur d'origine.
 */
import { createHash } from "node:crypto";
import { errorLogs } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { logger, redact } from "@/server/core/logger";

export type ErrorSource = "api" | "task" | "event" | "page";

export type ErrorEntry = {
  source: ErrorSource;
  error: unknown;
  level?: "error" | "warning";
  code?: string;
  status?: number;
  requestId?: string;
  method?: string;
  path?: string;
  route?: string;
  actor?: string | null;
  shopId?: string | null;
  context?: Record<string, unknown>;
};

/** Message sans identifiants variables (UUID, nombres, chaînes entre guillemets) pour l'empreinte. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/(["'«»]).*?\1/g, "<valeur>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
}

export function errorFingerprint(source: string, code: string | undefined, route: string | undefined, message: string): string {
  return createHash("sha256").update(`${source}|${code ?? ""}|${route ?? ""}|${normalizeMessage(message)}`).digest("hex");
}

function describe(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) return { name: error.name, message: error.message || error.name, stack: error.stack?.split("\n").slice(0, 12).join("\n") ?? null };
  return { name: "Error", message: typeof error === "string" ? error : JSON.stringify(error) ?? "Erreur inconnue", stack: null };
}

export async function recordError(database: Db | Executor, entry: ErrorEntry): Promise<void> {
  try {
    const { name, message, stack } = describe(entry.error);
    const code = entry.code ?? name;
    await database.insert(errorLogs).values({
      source: entry.source, level: entry.level ?? "error", code: code.slice(0, 60), message: message.slice(0, 4000), stack: stack?.slice(0, 8000) ?? null,
      fingerprint: errorFingerprint(entry.source, code, entry.route, message),
      requestId: entry.requestId?.slice(0, 80) ?? null, method: entry.method?.slice(0, 10) ?? null, path: entry.path?.slice(0, 500) ?? null,
      route: entry.route?.slice(0, 120) ?? null, status: entry.status ?? null, actor: entry.actor?.slice(0, 120) ?? null, shopId: entry.shopId ?? null,
      context: (redact(entry.context ?? {}) as Record<string, unknown>),
    });
  } catch (failure) {
    logger.warn("error_log.write_failed", { reason: failure instanceof Error ? failure.message : String(failure) });
  }
}
