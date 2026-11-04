/**
 * Définition des routes de l'API v1 et pipeline commun.
 *
 * Une route est une déclaration (méthode, chemin, schémas Zod, permission, handler).
 * Le pipeline applique dans l'ordre : contexte de requête → identification → permission
 * → limite de débit → validation → idempotence → handler → réponse uniforme.
 * Le handler appelle un service : aucune règle métier ni SQL dans les routes.
 */
import { z, type ZodType } from "zod";
import type { Db } from "@/server/core/db";
import { AppError, errors, fromDatabaseError, toErrorBody, zodIssues } from "@/server/core/errors";
import { logger, errorContext } from "@/server/core/logger";
import { parseListQuery, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { requestMeta, type RequestMeta } from "@/server/core/http/request-context";
import { assertPermission, resolveAdminPrincipal, resolveCustomerPrincipal, type AdminPrincipal, type CustomerPrincipal } from "@/server/core/auth/principal";
import type { PermissionCode } from "@/server/core/permissions";
import { enforceRateLimit, type RateLimitPolicyName } from "@/server/core/rate-limit";
import { beginIdempotent, completeIdempotent, readIdempotencyKey, releaseIdempotent } from "@/server/core/idempotency";
import { resolveShop, type ShopContext } from "@/server/core/shop";
import { scheduleDispatch } from "@/server/core/events";
import { DEFAULT_SHOP_ID } from "@/lib/db/schema";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Surface = "admin" | "shop" | "public";

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

export type RouteContext<P, Q, B, S extends Surface> = {
  request: Request;
  params: P;
  query: Q;
  body: B;
  list: ListQuery;
  meta: RequestMeta;
  shop: ShopContext;
  db: Db;
  admin: [S] extends ["admin"] ? AdminPrincipal : AdminPrincipal | null;
  customer: CustomerPrincipal | null;
  /** En-têtes ajoutés à la réponse (ex. Set-Cookie du panier invité). */
  responseHeaders: Headers;
};

export type RouteDefinition<PS extends ZodType | undefined = ZodType | undefined, QS extends ZodType | undefined = ZodType | undefined, BS extends ZodType | undefined = ZodType | undefined, S extends Surface = Surface> = {
  /** Identifiant stable, utilisé pour l'OpenAPI (operationId) et l'idempotence. */
  id: string;
  method: HttpMethod;
  /** Chemin sous /api/v1, avec paramètres `:id`. */
  path: string;
  surface: S;
  summary: string;
  description?: string;
  tags: string[];
  /** API admin : permission requise (absente uniquement pour les routes d'authentification). */
  permission?: PermissionCode;
  /** `none` : route publique (connexion). Par défaut : obligatoire en admin, facultative en boutique. */
  auth?: "required" | "optional" | "none";
  params?: PS;
  query?: QS;
  body?: BS;
  /** Route de liste : ?page, ?limit, ?sort, ?filter[...], ?q. */
  list?: ListSpec;
  rateLimit?: RateLimitPolicyName;
  idempotency?: "required" | "optional";
  status?: number;
  /** Schéma de la réponse (documentation OpenAPI). */
  response?: ZodType;
  handler: (context: RouteContext<Infer<PS>, Infer<QS>, Infer<BS>, S>) => Promise<unknown>;
};

/**
 * Aide au typage : conserve les types des schémas dans le handler. Sur une route `admin`,
 * `context.admin` est garanti non nul (le pipeline a déjà authentifié l'appelant).
 */
export function defineRoute<PS extends ZodType | undefined = undefined, QS extends ZodType | undefined = undefined, BS extends ZodType | undefined = undefined, const S extends Surface = Surface>(definition: RouteDefinition<PS, QS, BS, S>): AnyRoute {
  return definition as AnyRoute;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRoute = RouteDefinition<any, any, any, any>;

/** Réponse de liste ou objet simple : les listes renvoient déjà { data, meta }. */
export function isListResult(value: unknown): value is { data: unknown[]; meta: unknown } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data) && "meta" in (value as object));
}

const MAX_BODY_BYTES = 1_000_000;

async function readJsonBody(request: Request): Promise<{ raw: string; value: unknown }> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw errors.badRequest("Corps de requête trop volumineux (1 Mo maximum).");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw errors.badRequest("Corps de requête trop volumineux (1 Mo maximum).");
  if (!raw.trim()) return { raw: "", value: undefined };
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw errors.badRequest("Content-Type attendu : application/json.");
  try {
    return { raw, value: JSON.parse(raw) };
  } catch {
    throw errors.badRequest("JSON invalide.");
  }
}

function parseWith<T extends ZodType | undefined>(schema: T, value: unknown, location: string): Infer<T> {
  if (!schema) return undefined as Infer<T>;
  const parsed = schema.safeParse(value ?? (location === "body" ? undefined : {}));
  if (!parsed.success) throw errors.validation(zodIssues(parsed.error.issues).map((issue) => ({ ...issue, path: issue.path ? `${location}.${issue.path}` : location })));
  return parsed.data as Infer<T>;
}

function queryObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) if (!key.startsWith("filter[")) out[key] = value;
  return out;
}

/** Vérification CSRF des écritures authentifiées par cookie (boutique) : même origine exigée. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // Clients non navigateurs : pas de cookie tiers envoyé automatiquement.
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const allowed = new Set((process.env.CORS_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw errors.forbidden();
  }
  if (originHost !== host && !allowed.has(origin)) throw new AppError("FORBIDDEN", "Origine de la requête refusée (protection CSRF).");
}

export type ExecuteOptions = { database: () => Db; params: Record<string, string> };

export async function executeRoute(route: AnyRoute, request: Request, options: ExecuteOptions): Promise<Response> {
  const meta = requestMeta(request);
  const started = Date.now();
  const baseHeaders: Record<string, string> = { "x-request-id": meta.requestId, "cache-control": "no-store" };
  let idempotency: { scope: string; key: string } | null = null;
  let database: Db | null = null;
  try {
    try {
      database = options.database();
    } catch (error) {
      // Seules les routes publiques sans base (ex. /openapi.json) fonctionnent sans DATABASE_URL.
      if (route.surface !== "public") throw error;
    }
    const url = new URL(request.url);
    const shop = database ? await resolveShop(database, request.headers) : { id: DEFAULT_SHOP_ID, code: "default", name: "mybigmarket" };
    const authMode = route.auth ?? (route.surface === "admin" ? "required" : "optional");

    let admin: AdminPrincipal | null = null;
    let customer: CustomerPrincipal | null = null;
    if (!database && route.surface !== "public") throw errors.unavailable("La base de données n'est pas configurée.");
    if (route.surface === "admin" && authMode !== "none") {
      admin = await resolveAdminPrincipal(database!, request.headers, meta.ip);
      if (route.permission) assertPermission(admin, route.permission);
      if (admin.shopId !== shop.id && admin.kind === "api_key") throw errors.forbidden();
    } else if (route.surface === "shop" && authMode !== "none") {
      customer = await resolveCustomerPrincipal();
      if (authMode === "required" && !customer) throw errors.unauthenticated("Connectez-vous pour accéder à cette ressource.");
      if (route.method !== "GET" && customer) assertSameOrigin(request);
    }

    const policy = route.rateLimit ?? (route.surface === "admin" ? (route.method === "GET" ? "admin.default" : "admin.write") : "shop.default");
    const subject = admin?.actorId ?? customer?.userId ?? meta.ip ?? "anonymous";
    const limit = database ? await enforceRateLimit(() => database!, policy, subject) : null;
    if (limit) {
      baseHeaders["x-ratelimit-limit"] = String(limit.limit);
      baseHeaders["x-ratelimit-remaining"] = String(limit.remaining);
    }

    const params = parseWith(route.params, options.params, "params");
    const query = parseWith(route.query, queryObject(url.searchParams), "query");
    const list = route.list ? parseListQuery(url.searchParams, route.list) : { page: 1, limit: 20, offset: 0, sort: [], filters: [] };
    const needsBody = route.method !== "GET" && route.method !== "DELETE";
    const bodyInput = needsBody ? await readJsonBody(request) : { raw: "", value: undefined };
    const body = parseWith(route.body, bodyInput.value, "body");

    if (route.idempotency && route.method !== "GET") {
      const key = readIdempotencyKey(request.headers, route.idempotency === "required");
      if (key) {
        const scope = `${route.id}:${subject}`;
        const replay = await beginIdempotent(database!, scope, key, `${url.pathname}\n${bodyInput.raw}`);
        if (replay) return Response.json(replay.body, { status: replay.status, headers: { ...baseHeaders, "idempotent-replayed": "true" } });
        idempotency = { scope, key };
      }
    }

    const responseHeaders = new Headers();
    const result = await route.handler({ request, params, query, body, list, meta, shop, db: database, admin, customer, responseHeaders } as never);
    if (result instanceof Response) return result;
    const status = route.status ?? (route.method === "POST" ? 201 : 200);
    const payload = result === undefined ? null : isListResult(result) ? result : { data: result };
    if (idempotency) await completeIdempotent(database!, idempotency.scope, idempotency.key, { status, body: payload });
    // Les événements écrits par le handler sont distribués après la réponse (outbox).
    if (route.method !== "GET" && database) await scheduleDispatch(options.database);
    logger.info("api.request", { requestId: meta.requestId, route: route.id, status, ms: Date.now() - started, actor: admin?.actorId ?? customer?.userId });
    const headers = new Headers(baseHeaders);
    responseHeaders.forEach((value, name) => headers.append(name, value));
    if (status === 204) return new Response(null, { status, headers });
    return Response.json(payload, { status, headers });
  } catch (error) {
    if (idempotency && database) await releaseIdempotent(database, idempotency.scope, idempotency.key).catch(() => undefined);
    const appError = error instanceof AppError ? error : fromDatabaseError(error);
    if (appError) {
      if (appError.status >= 500) logger.error("api.error", { requestId: meta.requestId, route: route.id, code: appError.code, ...errorContext(error) });
      return Response.json(toErrorBody(appError, meta.requestId), { status: appError.status, headers: { ...baseHeaders, ...appError.headers } });
    }
    logger.error("api.unhandled", { requestId: meta.requestId, route: route.id, ...errorContext(error) });
    return Response.json(toErrorBody(new AppError("INTERNAL", "Erreur interne. Communiquez l'identifiant de requête au support."), meta.requestId), { status: 500, headers: baseHeaders });
  }
}
