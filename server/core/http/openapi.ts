/**
 * Document OpenAPI 3.1 généré depuis les définitions de routes et leurs schémas Zod.
 */
import { z, type ZodType } from "zod";
import type { AnyRoute } from "@/server/core/http/route";
import { listParameters } from "@/server/core/http/list-query";

type JsonSchema = Record<string, unknown>;

function toSchema(schema: ZodType | undefined): JsonSchema | undefined {
  if (!schema) return undefined;
  try {
    const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
    delete json.$schema;
    return json;
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
        code: { type: "string", examples: ["VALIDATION_ERROR", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED"] },
        message: { type: "string" },
        details: {},
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
  const paramsSchema = toSchema(route.params) as { properties?: Record<string, JsonSchema> } | undefined;
  for (const name of [...route.path.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1])) {
    parameters.push({ name, in: "path", required: true, schema: paramsSchema?.properties?.[name] ?? { type: "string" } });
  }
  const querySchema = toSchema(route.query) as { properties?: Record<string, JsonSchema>; required?: string[] } | undefined;
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
  const responseSchema = toSchema(route.response);
  const successStatus = String(route.status ?? (route.method === "POST" ? 201 : 200));
  const successBody = route.list
    ? { type: "object", properties: { data: { type: "array", items: responseSchema ?? {} }, meta: listMetaSchema } }
    : { type: "object", properties: { data: responseSchema ?? {} } };
  const authRequired = route.auth !== "none" && (route.surface === "admin" || route.auth === "required");
  return {
    operationId: route.id,
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    tags: route.tags,
    ...(route.permission ? { "x-permission": route.permission } : {}),
    parameters,
    ...(route.body ? { requestBody: { required: true, content: { "application/json": { schema: toSchema(route.body) } } } } : {}),
    ...(authRequired ? { security: route.surface === "admin" ? [{ bearerAuth: [] }, { apiKey: [] }] : [{ sessionCookie: [] }] } : { security: [] }),
    responses: {
      [successStatus]: successStatus === "204" ? { description: "Succès, sans contenu." } : { description: "Succès", content: { "application/json": { schema: successBody } } },
      "400": { $ref: "#/components/responses/Error" },
      ...(authRequired ? { "401": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } : {}),
      "429": { $ref: "#/components/responses/Error" },
      "500": { $ref: "#/components/responses/Error" },
    },
  };
}

export function buildOpenApi(routes: AnyRoute[], serverUrl?: string) {
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
      schemas: { Error: errorSchema },
      responses: { Error: { description: "Erreur", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
    },
  };
}
