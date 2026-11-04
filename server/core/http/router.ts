/**
 * Routeur de l'API v1 : associe méthode + chemin à une définition de route.
 * Un seul point d'entrée Next.js (`app/api/v1/[...path]/route.ts`) délègue ici,
 * ce qui garantit que l'OpenAPI décrit exactement les routes servies.
 */
import { AppError, errors, toErrorBody } from "@/server/core/errors";
import { db as defaultDatabase, type Db } from "@/server/core/db";
import { executeRoute, type AnyRoute, type HttpMethod } from "@/server/core/http/route";
import { corsHeaders, preflight } from "@/server/core/http/cors";

type Compiled = { route: AnyRoute; pattern: RegExp; keys: string[] };

export function compilePath(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path.split("/").map((segment) => {
    if (segment.startsWith(":")) {
      keys.push(segment.slice(1));
      return "([^/]+)";
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return { pattern: new RegExp(`^${source}/?$`), keys };
}

export class Router {
  private readonly compiled: Compiled[];

  constructor(readonly routes: AnyRoute[], private readonly database: () => Db = defaultDatabase) {
    const seen = new Set<string>();
    for (const route of routes) {
      const signature = `${route.method} ${route.path}`;
      if (seen.has(signature) || seen.has(route.id)) throw new Error(`Route en double : ${signature} (${route.id})`);
      seen.add(signature);
      seen.add(route.id);
      if (route.surface === "admin" && !route.permission && route.auth !== "none" && !route.id.startsWith("admin.auth.")) {
        throw new Error(`La route admin ${route.id} doit déclarer une permission.`);
      }
    }
    // Un segment fixe l'emporte sur un paramètre (`/categories/tree` avant `/categories/:id`),
    // quel que soit l'ordre de déclaration ; à égalité, l'ordre de déclaration est conservé.
    this.compiled = routes.map((route) => ({ route, ...compilePath(route.path) })).sort((a, b) => a.keys.length - b.keys.length);
  }

  match(method: string, path: string): { route: AnyRoute; params: Record<string, string> } | { allowed: string[] } | null {
    const allowed: string[] = [];
    for (const entry of this.compiled) {
      const found = entry.pattern.exec(path);
      if (!found) continue;
      if (entry.route.method !== method) {
        allowed.push(entry.route.method);
        continue;
      }
      const params = Object.fromEntries(entry.keys.map((key, index) => [key, decodeURIComponent(found[index + 1])]));
      return { route: entry.route, params };
    }
    return allowed.length ? { allowed } : null;
  }

  async handle(request: Request, pathSegments: string[]): Promise<Response> {
    const path = `/${pathSegments.map((segment) => encodeURIComponent(segment)).join("/")}`.replace(/%3A/gi, ":");
    const surface = pathSegments[0] === "admin" ? "admin" : "shop";
    const cors = corsHeaders(request, surface);
    if (request.method === "OPTIONS") return preflight(request, surface);
    const found = this.match(request.method, decodeURIComponent(path));
    if (!found) return withHeaders(Response.json(toErrorBody(errors.notFound("Route")), { status: 404 }), cors);
    if ("allowed" in found) {
      return withHeaders(Response.json(toErrorBody(new AppError("METHOD_NOT_ALLOWED", `Méthode ${request.method} non autorisée.`, { allowed: found.allowed })), { status: 405, headers: { allow: found.allowed.join(", ") } }), cors);
    }
    const response = await executeRoute(found.route, request, { database: this.database, params: found.params });
    return withHeaders(response, cors);
  }

  methods(): HttpMethod[] {
    return [...new Set(this.routes.map((route) => route.method))];
  }
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [key, value] of Object.entries({ ...headers, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" })) response.headers.set(key, value);
  return response;
}
