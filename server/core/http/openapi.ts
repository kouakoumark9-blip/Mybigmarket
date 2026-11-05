/**
 * Document OpenAPI 3.1 généré depuis les définitions de routes et leurs schémas Zod.
 */
import { z, type ZodType } from "zod";
import type { AnyRoute } from "@/server/core/http/route";
import { listParameters } from "@/server/core/http/list-query";
import { ERROR_STATUS } from "@/server/core/errors";
import { RATE_LIMIT_POLICIES } from "@/server/core/rate-limit";

type JsonSchema = Record<string, unknown>;

/** Schémas partagés remontés dans components.schemas pendant la construction du document. */
let hoisted: Record<string, JsonSchema> = {};

/**
 * Schéma JSON d'un schéma Zod. Les définitions locales ($defs, produites par les structures
 * récursives comme les blocs CMS) sont remontées dans components.schemas sous un nom propre à
 * l'opération, et leurs références réécrites : « #/$defs/… » ne se résoudrait pas à la racine.
 */
function toSchema(schema: ZodType | undefined, name = "schema"): JsonSchema | undefined {
  if (!schema) return undefined;
  try {
    const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
    delete json.$schema;
    const defs = json.$defs as Record<string, JsonSchema> | undefined;
    if (!defs) return json;
    delete json.$defs;
    const prefix = name.replace(/[^A-Za-z0-9_.-]/g, "_");
    const rewrite = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/"#\/\$defs\/([^"]+)"/g, (_match, key: string) => `"#/components/schemas/${prefix}.${key}"`));
    for (const [key, definition] of Object.entries(defs)) hoisted[`${prefix}.${key}`] = rewrite(definition);
    return rewrite(json);
  } catch {
    return { type: "object" };
  }
}

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: Object.keys(ERROR_STATUS), description: Object.entries(ERROR_STATUS).map(([code, status]) => `${code} (${status})`).join(", ") },
        message: { type: "string" },
        details: { description: "Validation : liste de { path, message } ; règle métier : contexte de l'erreur." },
        requestId: { type: "string" },
      },
    },
  },
};

const listMetaSchema = {
  type: "object",
  properties: {
    page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" },
    sort: { type: "string" }, filters: { type: "object" },
  },
};

function openApiPath(path: string) {
  return `/api/v1${path.replace(/:([A-Za-z]+)/g, "{$1}")}`;
}

function operation(route: AnyRoute) {
  const parameters: JsonSchema[] = [];
  const paramsSchema = toSchema(route.params, `${route.id}.params`) as { properties?: Record<string, JsonSchema> } | undefined;
  for (const name of [...route.path.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1])) {
    parameters.push({ name, in: "path", required: true, schema: paramsSchema?.properties?.[name] ?? { type: "string" } });
  }
  const querySchema = toSchema(route.query, `${route.id}.query`) as { properties?: Record<string, JsonSchema>; required?: string[] } | undefined;
  for (const [name, schema] of Object.entries(querySchema?.properties ?? {})) {
    parameters.push({ name, in: "query", required: querySchema?.required?.includes(name) ?? false, schema });
  }
  if (route.list) {
    const info = listParameters(route.list);
    parameters.push(
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: info.maxLimit, default: route.list.defaultLimit ?? 20 } },
      { name: "sort", in: "query", description: `Champs : ${info.sortable.join(", ")}. Préfixe « - » pour l'ordre décroissant.`, schema: { type: "string", default: route.list.defaultSort } },
      ...(info.searchable ? [{ name: "q", in: "query", description: "Recherche libre.", schema: { type: "string" } }] : []),
      ...Object.entries(info.filterable).map(([field, spec]) => ({
        name: `filter[${field}]`, in: "query", description: `Filtre ${spec.type}${"values" in spec ? ` (${(spec.values as string[]).join(", ")})` : ""}. Opérateurs : filter[${field}][eq|ne|in|gt|gte|lt|lte|like|null].`,
        schema: { type: "string" },
      })),
    );
  }
  if (route.idempotency) {
    parameters.push({ name: "Idempotency-Key", in: "header", required: route.idempotency === "required", description: "Clé unique (8 à 128 caractères) : une requête rejouée avec la même clé ne produit pas de second effet.", schema: { type: "string" } });
  }
  const responseSchema = toSchema(route.response, `${route.id}.response`);
  const successStatus = String(route.status ?? (route.method === "POST" ? 201 : 200));
  const successBody = route.list
    ? { type: "object", properties: { data: { type: "array", items: responseSchema ?? {} }, meta: listMetaSchema } }
    : { type: "object", properties: { data: responseSchema ?? {} } };
  const authRequired = route.auth !== "none" && (route.surface === "admin" || route.auth === "required");
  const hasPathParams = /:[A-Za-z]+/.test(route.path);
  const isWrite = route.method !== "GET";
  const policyName = route.rateLimit ?? (route.surface === "admin" ? (route.method === "GET" ? "admin.default" : "admin.write") : "shop.default");
  const policy = RATE_LIMIT_POLICIES[policyName];
  const multipart = route.bodyType === "multipart"
    ? { requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { files: { type: "array", items: { type: "string", format: "binary" } } }, additionalProperties: true } } } } }
    : {};
  return {
    operationId: route.id,
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    tags: route.tags,
    ...(route.permission ? { "x-permission": route.permission } : {}),
    parameters,
    ...(route.body ? { requestBody: { required: true, content: { "application/json": { schema: toSchema(route.body, `${route.id}.body`) } } } } : multipart),
    "x-rate-limit": { policy: policyName, limit: policy.limit, windowSeconds: policy.windowSeconds },
    ...(isWrite && route.bodyType !== "multipart" ? { "x-max-body-bytes": route.maxBodyBytes ?? 1_000_000 } : {}),
    ...(route.surface === "shop" && isWrite ? { "x-csrf": "Écriture depuis un navigateur : l'en-tête Origin doit être celui de la boutique (ou une origine autorisée)." } : {}),
    ...(authRequired ? { security: route.surface === "admin" ? [{ bearerAuth: [] }, { apiKey: [] }] : [{ sessionCookie: [] }] } : { security: [] }),
    responses: {
      [successStatus]: successStatus === "204" ? { description: "Succès, sans contenu." } : { description: "Succès", content: { "application/json": { schema: successBody } } },
      "400": { $ref: "#/components/responses/Error" },
      ...(authRequired ? { "401": { $ref: "#/components/responses/Error" } } : {}),
      ...(authRequired || (route.surface === "shop" && isWrite) ? { "403": { $ref: "#/components/responses/Error" } } : {}),
      ...(hasPathParams ? { "404": { $ref: "#/components/responses/Error" } } : {}),
      ...(isWrite ? { "409": { $ref: "#/components/responses/Error" }, "422": { $ref: "#/components/responses/Error" } } : {}),
      "429": { $ref: "#/components/responses/RateLimited" },
      "500": { $ref: "#/components/responses/Error" },
      "503": { $ref: "#/components/responses/Error" },
    },
  };
}

export function buildOpenApi(routes: AnyRoute[], serverUrl?: string) {
  hoisted = {};
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = openApiPath(route.path);
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = operation(route);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "API mybigmarket",
      version: "1.0.0",
      description: "API REST versionnée. Deux surfaces : /api/v1/admin (back-office, permissions par rôle) et /api/v1/shop (boutique). Erreurs au format { error: { code, message, details, requestId } }. Listes : ?page, ?limit, ?sort, ?filter[champ], ?q.",
    },
    ...(serverUrl ? { servers: [{ url: serverUrl }] } : {}),
    tags: [...new Set(routes.flatMap((route) => route.tags))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Jeton d'accès employé (10 minutes), obtenu via POST /api/v1/admin/auth/login puis /refresh." },
        apiKey: { type: "http", scheme: "bearer", description: "Clé d'API d'intégration : Authorization: Bearer mbm_…" },
        sessionCookie: { type: "apiKey", in: "cookie", name: "authjs.session-token", description: "Session client de la boutique." },
      },
      schemas: { Error: errorSchema, ...hoisted },
      responses: {
        Error: { description: "Erreur (voir error.code)", headers: { "x-request-id": { schema: { type: "string" }, description: "Identifiant à communiquer au support." } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        RateLimited: { description: "Trop de requêtes", headers: { "retry-after": { schema: { type: "integer" }, description: "Secondes avant de réessayer." } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}
