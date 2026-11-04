/**
 * Erreurs applicatives au format uniforme { code, message, details }.
 *
 * Les services lèvent des AppError ; la couche HTTP les traduit en réponse JSON.
 * Toute autre exception devient une erreur INTERNAL dont le détail n'est jamais
 * renvoyé au client (il est journalisé avec l'identifiant de requête).
 */

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ErrorBody = { error: { code: ErrorCode; message: string; details?: unknown; requestId?: string } };

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(code: ErrorCode, message: string, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
    this.headers = headers;
  }
}

export const errors = {
  validation: (details: unknown, message = "Les données envoyées sont invalides.") => new AppError("VALIDATION_ERROR", message, details),
  badRequest: (message: string, details?: unknown) => new AppError("BAD_REQUEST", message, details),
  unauthenticated: (message = "Authentification requise.") => new AppError("UNAUTHENTICATED", message),
  forbidden: (permission?: string) => new AppError("FORBIDDEN", "Vous n'avez pas la permission d'effectuer cette action.", permission ? { permission } : undefined),
  notFound: (entity: string, id?: string | number) => new AppError("NOT_FOUND", `${entity} introuvable.`, id === undefined ? undefined : { id: String(id) }),
  conflict: (message: string, details?: unknown) => new AppError("CONFLICT", message, details),
  rule: (message: string, details?: unknown) => new AppError("BUSINESS_RULE", message, details),
  rateLimited: (retryAfterSeconds: number) => new AppError("RATE_LIMITED", "Trop de requêtes. Réessayez dans quelques instants.", { retryAfterSeconds }, { "retry-after": String(retryAfterSeconds) }),
  unavailable: (message: string) => new AppError("SERVICE_UNAVAILABLE", message),
};

/** Erreurs Zod → liste { path, message } lisible côté client. */
export function zodIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string; code?: string }>) {
  return issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message, code: issue.code }));
}

/** Code PostgreSQL → erreur métier (violation d'unicité, de clé étrangère…). */
export function fromDatabaseError(error: unknown): AppError | null {
  const cause = (error as { cause?: unknown })?.cause ?? error;
  const code = (cause as { code?: string })?.code;
  const constraint = (cause as { constraint_name?: string; constraint?: string })?.constraint_name ?? (cause as { constraint?: string })?.constraint;
  if (code === "23505") return new AppError("CONFLICT", "Cette valeur existe déjà.", constraint ? { constraint } : undefined);
  if (code === "23503") return new AppError("BUSINESS_RULE", "Cette ressource est liée à d'autres données.", constraint ? { constraint } : undefined);
  if (code === "23514" || code === "22P02") return new AppError("VALIDATION_ERROR", "Valeur refusée par la base de données.", constraint ? { constraint } : undefined);
  // Table ou colonne absente : la base n'a pas reçu les dernières migrations.
  if (code === "42P01" || code === "42703") return new AppError("SERVICE_UNAVAILABLE", "La base de données n'est pas à jour : appliquez migrate-all.sql (voir docs/backend).", { reason: "schema_outdated" });
  return null;
}

export function toErrorBody(error: AppError, requestId?: string): ErrorBody {
  return { error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }), ...(requestId ? { requestId } : {}) } };
}
