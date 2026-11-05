/**
 * Documentation OpenAPI : complète et cohérente pour chaque route de l'API v1
 * (identifiant unique, résumé, étiquettes, paramètres de chemin, corps, sécurité, permission,
 * erreurs possibles, limites), et sans référence cassée.
 */
import { describe, expect, it, vi } from "vitest";
import { buildOpenApi } from "@/server/core/http/openapi";
import { ERROR_STATUS } from "@/server/core/errors";
import { RATE_LIMIT_POLICIES } from "@/server/core/rate-limit";

vi.mock("@/auth", () => ({ auth: async () => null }));

type Operation = {
  operationId: string; summary: string; tags: string[]; parameters: Array<{ name: string; in: string }>; security: unknown[];
  requestBody?: { content: Record<string, unknown> }; responses: Record<string, unknown>; "x-permission"?: string; "x-rate-limit": { policy: string }; "x-csrf"?: string;
};

async function load() {
  const { ALL_ROUTES } = await import("@/server/api/registry");
  const spec = buildOpenApi(ALL_ROUTES, "https://mybigmarket.example") as ReturnType<typeof buildOpenApi> & { paths: Record<string, Record<string, Operation>> };
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method, op })));
  return { ALL_ROUTES, spec, operations };
}

describe("document OpenAPI", () => {
  it("décrit chaque route une fois, avec un identifiant unique, un résumé et des étiquettes déclarées", async () => {
    const { ALL_ROUTES, spec, operations } = await load();
    expect(operations).toHaveLength(ALL_ROUTES.length);
    expect(new Set(operations.map(({ op }) => op.operationId)).size).toBe(ALL_ROUTES.length);
    const declaredTags = new Set(spec.tags.map((tag: { name: string }) => tag.name));
    for (const { op } of operations) {
      expect(op.summary.trim().length, op.operationId).toBeGreaterThanOrEqual(8);
      expect(op.tags.length, op.operationId).toBeGreaterThan(0);
      for (const tag of op.tags) expect(declaredTags.has(tag), `${op.operationId} : ${tag}`).toBe(true);
    }
  });

  it("déclare chaque paramètre de chemin et chaque corps de requête", async () => {
    const { ALL_ROUTES, operations } = await load();
    for (const { path, op } of operations) {
      const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      const declared = op.parameters.filter((parameter) => parameter.in === "path").map((parameter) => parameter.name).sort();
      expect(declared, op.operationId).toEqual(inPath);
      if (inPath.length) expect(op.responses["404"], op.operationId).toBeDefined();
    }
    for (const route of ALL_ROUTES.filter((entry) => entry.body || entry.bodyType === "multipart")) {
      const op = operations.find(({ op: candidate }) => candidate.operationId === route.id)!.op;
      expect(Object.keys(op.requestBody?.content ?? {}), route.id).toEqual([route.bodyType === "multipart" ? "multipart/form-data" : "application/json"]);
    }
  });

  it("indique sécurité, permission, protection CSRF et limite de débit", async () => {
    const { ALL_ROUTES, operations } = await load();
    for (const route of ALL_ROUTES) {
      const op = operations.find(({ op: candidate }) => candidate.operationId === route.id)!.op;
      expect(Object.keys(RATE_LIMIT_POLICIES), route.id).toContain(op["x-rate-limit"].policy);
      if (route.surface === "admin" && route.auth !== "none") {
        expect(op.security, route.id).toEqual([{ bearerAuth: [] }, { apiKey: [] }]);
        expect(op.responses["401"], route.id).toBeDefined();
        if (route.permission) expect(op["x-permission"], route.id).toBe(route.permission);
      }
      if (route.surface === "shop" && route.method !== "GET") {
        expect(op["x-csrf"], route.id).toBeDefined();
        expect(op.responses["403"], route.id).toBeDefined();
      }
      if (route.method !== "GET") expect(Object.keys(op.responses), route.id).toEqual(expect.arrayContaining(["409", "422", "429"]));
    }
    // Les routes d'administration sans permission sont uniquement celles du compte connecté.
    const withoutPermission = ALL_ROUTES.filter((route) => route.surface === "admin" && route.auth !== "none" && !route.permission).map((route) => route.id);
    expect(withoutPermission.every((id) => id.startsWith("admin.auth.") || id.startsWith("admin.me") || id.startsWith("admin.account")), withoutPermission.join(", ")).toBe(true);
  });

  it("documente tous les codes d'erreur et ne contient aucune référence cassée", async () => {
    const { spec } = await load();
    const text = JSON.stringify(spec);
    expect((spec.components.schemas.Error.properties.error.properties.code as { enum: string[] }).enum).toEqual(Object.keys(ERROR_STATUS));
    for (const [, ref] of text.matchAll(/"\$ref":"#\/([^"]+)"/g)) {
      const target = ref.split("/").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], spec);
      expect(target, ref).toBeDefined();
    }
  });
});
