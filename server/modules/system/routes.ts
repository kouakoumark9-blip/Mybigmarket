/** Paramètres, journal d'audit, modules, événements et informations système. */
import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { domainEvents, employeeAuditLogs, shops } from "@/lib/db/schema";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { buildOrderBy, buildWhere, listMeta, type ListSpec } from "@/server/core/http/list-query";
import { describeSettings, publicSettings, updateSettings, type SettingGroup } from "@/server/core/settings";
import { listModules, updateModule } from "@/server/core/modules";
import { dispatchPendingEvents, pendingEventCount } from "@/server/core/events";
import { ALL_PERMISSIONS } from "@/server/core/permissions";

const settingGroups = ["store", "orders", "catalog", "customers", "email", "seo", "security"] as const satisfies readonly SettingGroup[];

export const auditListSpec: ListSpec = {
  sortable: { createdAt: employeeAuditLogs.createdAt, action: employeeAuditLogs.action },
  filterable: {
    actorEmployeeId: { column: employeeAuditLogs.actorEmployeeId, type: "uuid" },
    actorType: { column: employeeAuditLogs.actorType, type: "enum", values: ["employee", "api_key", "system", "customer"] },
    action: { column: employeeAuditLogs.action, type: "string" },
    entityType: { column: employeeAuditLogs.entityType, type: "string" },
    entityId: { column: employeeAuditLogs.entityId, type: "string" },
    createdAt: { column: employeeAuditLogs.createdAt, type: "date" },
    requestId: { column: employeeAuditLogs.requestId, type: "string" },
  },
  searchable: [employeeAuditLogs.action, employeeAuditLogs.entityType, employeeAuditLogs.entityId],
  defaultSort: "-createdAt",
  maxLimit: 200,
};

const eventListSpec: ListSpec = {
  sortable: { occurredAt: domainEvents.occurredAt, attempts: domainEvents.attempts },
  filterable: {
    status: { column: domainEvents.status, type: "enum", values: ["pending", "dispatched", "failed"] },
    name: { column: domainEvents.name, type: "string" },
    aggregateId: { column: domainEvents.aggregateId, type: "string" },
    occurredAt: { column: domainEvents.occurredAt, type: "date" },
  },
  defaultSort: "-occurredAt",
};

export const systemRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.settings.list", method: "GET", path: "/admin/settings", surface: "admin", tags: ["Paramètres"], permission: "settings.read",
    summary: "Lire les paramètres de la boutique", query: z.object({ group: z.enum(settingGroups).optional() }),
    handler: ({ db, shop, query }) => describeSettings(db, shop.id, query.group),
  }),
  defineRoute({
    id: "admin.settings.update", method: "PATCH", path: "/admin/settings", surface: "admin", tags: ["Paramètres"], permission: "settings.update",
    summary: "Modifier des paramètres", description: "Toutes les valeurs sont validées avant écriture (tout ou rien). Chaque modification est journalisée avec l'état avant/après.",
    body: z.object({ values: z.record(z.string(), z.unknown()) }).strict(),
    handler: ({ db, shop, body, admin, meta }) => updateSettings(db, { shopId: shop.id, values: body.values, actor: admin, meta }),
  }),
  defineRoute({
    id: "admin.audit_logs.list", method: "GET", path: "/admin/audit-logs", surface: "admin", tags: ["Journaux"], permission: "logs.read",
    summary: "Journal d'audit (qui, quoi, quand, avant/après)", list: auditListSpec,
    handler: async ({ db, list, shop }) => {
      const where = buildWhere(list, auditListSpec, [sql`coalesce(${employeeAuditLogs.shopId}, ${shop.id}::uuid) = ${shop.id}::uuid`]);
      const [rows, [total]] = await Promise.all([
        db.select().from(employeeAuditLogs).where(where).orderBy(...buildOrderBy(list, auditListSpec, employeeAuditLogs.id)).limit(list.limit).offset(list.offset),
        db.select({ value: count() }).from(employeeAuditLogs).where(where),
      ]);
      return { data: rows, meta: listMeta(list, Number(total?.value ?? 0)) };
    },
  }),
  defineRoute({
    id: "admin.modules.list", method: "GET", path: "/admin/modules", surface: "admin", tags: ["Modules"], permission: "modules.read",
    summary: "Lister les modules et leur état",
    handler: ({ db }) => listModules(db),
  }),
  defineRoute({
    id: "admin.modules.update", method: "PATCH", path: "/admin/modules/:code", surface: "admin", tags: ["Modules"], permission: "modules.update",
    summary: "Activer, désactiver ou configurer un module", params: z.object({ code: z.string().regex(/^[a-z][a-z0-9-]{2,59}$/) }),
    body: z.object({ isActive: z.boolean().optional(), config: z.record(z.string(), z.unknown()).optional() }).strict().refine((value) => value.isActive !== undefined || value.config !== undefined, "Rien à modifier."),
    handler: ({ db, params, body, admin, meta }) => updateModule(db, { code: params.code, ...body, actor: admin, meta }),
  }),
  defineRoute({
    id: "admin.events.list", method: "GET", path: "/admin/events", surface: "admin", tags: ["Journaux"], permission: "logs.read",
    summary: "File des événements métier (outbox)", list: eventListSpec,
    handler: async ({ db, list }) => {
      const where = buildWhere(list, eventListSpec);
      const [rows, [total]] = await Promise.all([
        db.select().from(domainEvents).where(where).orderBy(...buildOrderBy(list, eventListSpec, domainEvents.id)).limit(list.limit).offset(list.offset),
        db.select({ value: count() }).from(domainEvents).where(where),
      ]);
      return { data: rows, meta: listMeta(list, Number(total?.value ?? 0)) };
    },
  }),
  defineRoute({
    id: "admin.events.dispatch", method: "POST", path: "/admin/events/dispatch", surface: "admin", tags: ["Journaux"], permission: "system.manage", status: 200,
    summary: "Distribuer maintenant les événements en attente",
    handler: ({ db }) => dispatchPendingEvents(db, { limit: 200 }),
  }),
  defineRoute({
    id: "admin.system.info", method: "GET", path: "/admin/system", surface: "admin", tags: ["Système"], permission: "system.read",
    summary: "Informations système (sans secret)",
    handler: async ({ db, shop }) => {
      const started = Date.now();
      const [migrations] = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`).then((result) => (result as unknown as { rows?: Array<{ n: number }> }).rows ?? (result as unknown as Array<{ n: number }>)).catch(() => [{ n: -1 }]);
      const latencyMs = Date.now() - started;
      const [shopCount] = await db.select({ value: count() }).from(shops);
      const [lastEvent] = await db.select({ occurredAt: domainEvents.occurredAt }).from(domainEvents).orderBy(desc(domainEvents.occurredAt)).limit(1);
      return {
        runtime: { node: process.version, region: process.env.VERCEL_REGION ?? null, environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development", commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
        database: { latencyMs, migrationsApplied: Number(migrations?.n ?? -1) },
        shop: { id: shop.id, code: shop.code, count: Number(shopCount?.value ?? 0) },
        events: { pending: await pendingEventCount(db), lastOccurredAt: lastEvent?.occurredAt ?? null },
        permissions: ALL_PERMISSIONS.length,
        features: {
          adminApi: Boolean(process.env.ADMIN_API_JWT_SECRET), redisRateLimit: Boolean(process.env.UPSTASH_REDIS_REST_URL), smtp: Boolean(process.env.SMTP_HOST),
          blob: Boolean(process.env.BLOB_PUBLIC_READ_WRITE_TOKEN), totpKey: Boolean(process.env.ADMIN_TOTP_ENCRYPTION_KEY), ai: Boolean(process.env.ANTHROPIC_API_KEY),
        },
      };
    },
  }),
  defineRoute({
    id: "admin.shops.list", method: "GET", path: "/admin/shops", surface: "admin", tags: ["Boutiques"], permission: "shops.read",
    summary: "Lister les boutiques",
    handler: ({ db }) => db.select().from(shops).where(eq(shops.isActive, true)),
  }),
  defineRoute({
    id: "shop.settings.public", method: "GET", path: "/shop/settings", surface: "shop", auth: "none", tags: ["Boutique"],
    summary: "Paramètres publics de la boutique (nom, devise, contacts…)",
    handler: async ({ db, shop }) => ({ shop: { code: shop.code, name: shop.name }, settings: await publicSettings(db, shop.id) }),
  }),
  defineRoute({
    id: "shop.me", method: "GET", path: "/shop/me", surface: "shop", auth: "required", tags: ["Boutique"],
    summary: "Client connecté",
    handler: async ({ customer }) => ({ userId: customer!.userId, email: customer!.email, role: customer!.role }),
  }),
];
