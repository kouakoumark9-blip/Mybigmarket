import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { employees } from "@/lib/db/schema";
import { AppError, fromDatabaseError, toErrorBody } from "@/server/core/errors";
import { parseListQuery, listMeta, likePattern, type ListSpec } from "@/server/core/http/list-query";
import { compilePath, Router } from "@/server/core/http/router";
import { defineRoute } from "@/server/core/http/route";
import { ALL_PERMISSIONS, can, isPermissionCode, profilePermissions } from "@/server/core/permissions";
import { hashPassword, needsRehash, passwordAlgorithm, passwordProblems, verifyPassword } from "@/server/core/auth/password";
import { newApiKey, parseApiKey, signAccessToken, verifyAccessToken } from "@/server/core/auth/tokens";
import { MemoryRateLimiter } from "@/server/core/rate-limit";
import { changedFields, sanitize } from "@/server/core/audit";
import { validateSettingValues } from "@/server/core/settings";
import { restoreMaskedSecrets } from "@/server/core/modules";
import { matchesEvent, signWebhook } from "@/server/modules/webhooks/module";

const spec: ListSpec = {
  sortable: { createdAt: employees.createdAt, email: employees.email },
  filterable: { status: { column: employees.status, type: "enum", values: ["active", "disabled"] }, createdAt: { column: employees.createdAt, type: "date" }, totpEnabled: { column: employees.totpEnabled, type: "boolean" } },
  searchable: [employees.email],
  defaultSort: "-createdAt",
};

describe("erreurs uniformes", () => {
  it("produit { error: { code, message, details, requestId } } avec le bon statut", () => {
    const error = new AppError("NOT_FOUND", "Employé introuvable.", { id: "x" });
    expect(error.status).toBe(404);
    expect(toErrorBody(error, "req-1")).toEqual({ error: { code: "NOT_FOUND", message: "Employé introuvable.", details: { id: "x" }, requestId: "req-1" } });
  });
  it("traduit les violations PostgreSQL en erreurs métier", () => {
    expect(fromDatabaseError({ code: "23505", constraint_name: "employees_email_unique" })?.code).toBe("CONFLICT");
    expect(fromDatabaseError({ cause: { code: "23503" } })?.code).toBe("BUSINESS_RULE");
    expect(fromDatabaseError({ cause: { code: "42P01" } })).toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 503 });
    expect(fromDatabaseError({ code: "42703" })?.code).toBe("SERVICE_UNAVAILABLE");
    expect(fromDatabaseError(new Error("autre"))).toBeNull();
  });
});

describe("listes : ?page, ?limit, ?sort, ?filter, ?q", () => {
  it("lit pagination, tri multiple, filtres et recherche", () => {
    const query = parseListQuery(new URLSearchParams("page=3&limit=10&sort=-createdAt,email&filter[status][in]=active,disabled&filter[createdAt][gte]=2026-01-01&filter[totpEnabled]=true&q=dupont"), spec);
    expect(query).toMatchObject({ page: 3, limit: 10, offset: 20, q: "dupont", sort: [{ field: "createdAt", direction: "desc" }, { field: "email", direction: "asc" }] });
    expect(query.filters).toEqual([
      { field: "status", operator: "in", value: ["active", "disabled"] },
      { field: "createdAt", operator: "gte", value: new Date("2026-01-01") },
      { field: "totpEnabled", operator: "eq", value: true },
    ]);
    expect(listMeta(query, 45)).toMatchObject({ page: 3, limit: 10, total: 45, totalPages: 5, sort: "-createdAt,email" });
  });
  it("applique le tri par défaut", () => {
    expect(parseListQuery(new URLSearchParams(), spec).sort).toEqual([{ field: "createdAt", direction: "desc" }]);
  });
  it.each([
    ["sort=password", "sort"], ["filter[passwordHash]=x", "filter.passwordHash"], ["filter[status]=inconnu", "filter.status"],
    ["limit=500", "limit"], ["page=0", "page"], ["filter[createdAt][gte]=pas-une-date", "filter.createdAt"], ["filter[status][between]=a", "filter.status"],
  ])("refuse %s (400)", (input, path) => {
    try {
      parseListQuery(new URLSearchParams(input), spec);
      throw new Error("aurait dû échouer");
    } catch (error) {
      expect((error as AppError).code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify((error as AppError).details)).toContain(path);
    }
  });
  it("échappe les jokers SQL de la recherche", () => {
    expect(likePattern("50%_\\")).toBe("%50\\%\\_\\\\%");
  });
});

describe("matrice de permissions", () => {
  it("contient les 36 codes historiques du back-office", () => {
    const seedFile = readFileSync("lib/db/seed-admin.ts", "utf8");
    const seed = seedFile.slice(seedFile.indexOf("const permissionSeeds = ["), seedFile.indexOf("] as const;", seedFile.indexOf("const permissionSeeds = [")));
    const legacy = [...seed.matchAll(/^\s+\["([a-zA-Z.]+)", "/gm)].map((match) => match[1]);
    expect(legacy.length).toBeGreaterThanOrEqual(36);
    expect(legacy.filter((code) => !isPermissionCode(code))).toEqual([]);
  });
  it("hérite : ressource.manage accorde toutes les actions, et une écriture accorde la lecture", () => {
    expect(can(["shipping.manage"], "shipping.delete")).toBe(true);
    expect(can(["catalog.products.update"], "catalog.products.read")).toBe(true);
    expect(can(["catalog.products.read"], "catalog.products.update")).toBe(false);
    expect(can(["orders.read"], "orders.refund")).toBe(false);
  });
  it("profils : Lecture seule ne modifie rien, Gestionnaire n'administre pas l'équipe", () => {
    const readOnly = profilePermissions("read_only");
    expect(readOnly.length).toBeGreaterThan(20);
    expect(readOnly.every((code) => code.endsWith(".read"))).toBe(true);
    const manager = profilePermissions("manager");
    expect(manager).toContain("catalog.products.update");
    expect(manager.some((code) => code.startsWith("employees.") || code.startsWith("roles.") || code === "settings.update")).toBe(false);
    expect(profilePermissions("super_admin")).toHaveLength(ALL_PERMISSIONS.length);
  });
});

describe("mots de passe", () => {
  it("argon2id : hachage et vérification", async () => {
    const hash = await hashPassword("un mot de passe solide");
    expect(passwordAlgorithm(hash)).toBe("argon2id");
    expect(await verifyPassword("un mot de passe solide", hash)).toBe(true);
    expect(await verifyPassword("mauvais", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });
  it("les anciens hashes bcrypt restent valides et sont signalés pour migration", async () => {
    const legacy = await bcrypt.hash("ancien mot de passe", 4);
    expect(await verifyPassword("ancien mot de passe", legacy)).toBe(true);
    expect(needsRehash(legacy)).toBe(true);
  });
  it("refuse les mots de passe faibles", () => {
    expect(passwordProblems("court")).not.toEqual([]);
    expect(passwordProblems("aaaaaaaaaaaaaaa")).not.toEqual([]);
    expect(passwordProblems("dupont-2026-secure", "dupont@exemple.ci")).not.toEqual([]);
    expect(passwordProblems("Correct-Horse-Battery-9")).toEqual([]);
  });
});

describe("jetons d'accès", () => {
  const withSecrets = (current?: string, previous?: string) => {
    process.env.ADMIN_API_JWT_SECRET = current;
    process.env.ADMIN_API_JWT_SECRET_PREVIOUS = previous;
  };
  it("signe, vérifie, expire et rejette une altération", () => {
    withSecrets("a".repeat(40));
    const token = signAccessToken({ sub: "emp-1", pwd: 100 }, 1_000);
    expect(verifyAccessToken(token, 1_100)).toMatchObject({ ok: true, claims: { sub: "emp-1", pwd: 100 } });
    expect(verifyAccessToken(token, 1_000 + 601)).toEqual({ ok: false, reason: "expired" });
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: "emp-2" })).toString("base64url");
    expect(verifyAccessToken(`${header}.${forged}.${signature}`, 1_100)).toEqual({ ok: false, reason: "signature" });
  });
  it("rotation du secret : l'ancien secret reste accepté pendant la transition", () => {
    withSecrets("ancien-secret-".padEnd(40, "x"));
    const token = signAccessToken({ sub: "emp-1", pwd: 1 }, 1_000);
    withSecrets("nouveau-secret-".padEnd(40, "y"), "ancien-secret-".padEnd(40, "x"));
    expect(verifyAccessToken(token, 1_010).ok).toBe(true);
    withSecrets("nouveau-secret-".padEnd(40, "y"));
    expect(verifyAccessToken(token, 1_010).ok).toBe(false);
  });
  it("clés d'API : format, préfixe et hash", () => {
    const key = newApiKey();
    expect(key.key).toMatch(/^mbm_[a-z0-9]{8}_/);
    expect(parseApiKey(key.key)).toEqual({ prefix: key.prefix, hash: key.hash });
    expect(parseApiKey("mbm_invalid")).toBeNull();
  });
});

describe("limitation de débit", () => {
  it("bloque au-delà de la limite et réinitialise à la fenêtre suivante", async () => {
    const limiter = new MemoryRateLimiter();
    const policy = { limit: 3, windowSeconds: 60 };
    const now = new Date("2026-11-04T10:00:10Z");
    const results = [];
    for (let index = 0; index < 4; index += 1) results.push(await limiter.hit("ip", policy, now));
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect((await limiter.hit("ip", policy, new Date("2026-11-04T10:01:01Z"))).allowed).toBe(true);
  });
});

describe("audit et paramètres", () => {
  it("calcule les champs modifiés et masque les secrets", () => {
    expect(changedFields({ a: 1, b: "x", c: [1] }, { a: 1, b: "y", d: true })).toEqual(["b", "c", "d"]);
    expect(sanitize({ email: "a@b.c", passwordHash: "$argon2id$", nested: { apiKey: "k" } })).toEqual({ email: "a@b.c", passwordHash: "[masqué]", nested: { apiKey: "[masqué]" } });
  });
  it("valide les paramètres typés (tout ou rien)", () => {
    expect(validateSettingValues({ "store.name": "Ma boutique", "orders.return_window_days": 30 })).toEqual({ "store.name": "Ma boutique", "orders.return_window_days": 30 });
    expect(() => validateSettingValues({ "store.name": "OK", "orders.return_window_days": -1 })).toThrow(AppError);
    expect(() => validateSettingValues({ "clé.inconnue": 1 })).toThrow(AppError);
    expect(() => validateSettingValues({ "store.time_zone": "Mars/Olympus" })).toThrow(AppError);
  });
  it("conserve un secret masqué renvoyé tel quel", () => {
    const previous = { endpoints: [{ url: "https://a", secret: "vrai-secret-1234567" }] };
    const next = { endpoints: [{ url: "https://b", secret: "••••••" }] };
    expect(restoreMaskedSecrets(next, previous, new Set(["secret"]))).toEqual({ endpoints: [{ url: "https://b", secret: "vrai-secret-1234567" }] });
  });
});

describe("routeur", () => {
  it("compile les chemins avec paramètres", () => {
    const { pattern, keys } = compilePath("/admin/employees/:id/reset-password");
    expect(keys).toEqual(["id"]);
    expect(pattern.exec("/admin/employees/42/reset-password")?.[1]).toBe("42");
    expect(pattern.test("/admin/employees/42")).toBe(false);
  });
  it("refuse une route admin sans permission et les routes en double", () => {
    const handler = async () => null;
    expect(() => new Router([defineRoute({ id: "admin.x", method: "GET", path: "/admin/x", surface: "admin", summary: "", tags: [], handler })])).toThrow(/permission/);
    const route = defineRoute({ id: "shop.x", method: "GET", path: "/shop/x", surface: "shop", summary: "", tags: [], handler });
    expect(() => new Router([route, { ...route, id: "shop.y" }])).toThrow(/double/);
  });
});

describe("module webhooks sortants", () => {
  it("signe le corps avec horodatage et filtre les événements", () => {
    expect(signWebhook("secret", 1700000000, "{}")).toMatch(/^[a-f0-9]{64}$/);
    expect(matchesEvent(["order.*"], "order.created")).toBe(true);
    expect(matchesEvent(["stock.low"], "order.created")).toBe(false);
    expect(matchesEvent(["*"], "anything.done")).toBe(true);
  });
});
