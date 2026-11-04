/**
 * Registre de l'API v1 : toutes les routes et tous les modules livrés.
 * Ajouter un module = ajouter ses routes et sa définition ici.
 */
import { Router } from "@/server/core/http/router";
import { buildOpenApi } from "@/server/core/http/openapi";
import { registerModules, syncModules, type ModuleDefinition } from "@/server/core/modules";
import { db } from "@/server/core/db";
import { ensurePermissionCatalog } from "@/server/modules/team/permission-catalog";
import type { AnyRoute } from "@/server/core/http/route";
import { defineRoute } from "@/server/core/http/route";
import { authRoutes } from "@/server/modules/auth/routes";
import { teamRoutes } from "@/server/modules/team/routes";
import { systemRoutes } from "@/server/modules/system/routes";
import { webhooksModule } from "@/server/modules/webhooks/module";
import { taxonomyRoutes } from "@/server/modules/catalog/taxonomy/routes";

export const MODULES: ModuleDefinition[] = [webhooksModule];
registerModules(MODULES);

const openApiRoute = defineRoute({
  id: "public.openapi", method: "GET", path: "/openapi.json", surface: "public", auth: "none", tags: ["Documentation"],
  summary: "Spécification OpenAPI 3.1 de l'API",
  handler: async () => Response.json(buildOpenApi(ALL_ROUTES, process.env.NEXT_PUBLIC_SITE_URL), { headers: { "cache-control": "public, max-age=300" } }),
});

export const ALL_ROUTES: AnyRoute[] = [
  ...authRoutes,
  ...teamRoutes,
  ...systemRoutes,
  ...taxonomyRoutes,
  ...MODULES.flatMap((module) => module.routes ?? []),
  openApiRoute,
];

let router: Router | null = null;

export function apiRouter(): Router {
  router ??= new Router(ALL_ROUTES);
  return router;
}

let bootstrapped: Promise<void> | null = null;

/** Au premier appel admin : matrice de permissions et modules synchronisés en base (idempotent). */
async function bootstrapAdmin() {
  bootstrapped ??= (async () => {
    const database = db();
    await ensurePermissionCatalog(database);
    await syncModules(database);
  })().catch((error) => {
    bootstrapped = null;
    throw error;
  });
  return bootstrapped;
}

export async function handleApi(request: Request, segments: string[]): Promise<Response> {
  if (segments[0] === "admin" && request.method !== "OPTIONS" && process.env.DATABASE_URL) {
    try {
      await bootstrapAdmin();
    } catch {
      // Base non migrée : la route renverra elle-même une erreur explicite.
    }
  }
  return apiRouter().handle(request, segments);
}
