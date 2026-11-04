import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import * as service from "@/server/modules/team/service";
import { employeeListSpec } from "@/server/modules/team/repository";
import * as v from "@/server/modules/team/validators";

const tags = ["Équipe et permissions"];
const context = (ctx: { admin: Parameters<typeof service.createEmployee>[2]["actor"]; meta: Parameters<typeof service.createEmployee>[2]["meta"] }) => ({ actor: ctx.admin, meta: ctx.meta });

export const teamRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.employees.list", method: "GET", path: "/admin/employees", surface: "admin", tags, permission: "employees.read",
    summary: "Lister les employés", list: employeeListSpec, response: v.employeeResponse,
    handler: ({ db, list }) => service.listEmployees(db, list),
  }),
  defineRoute({
    id: "admin.employees.create", method: "POST", path: "/admin/employees", surface: "admin", tags, permission: "employees.create",
    summary: "Créer un employé", description: "Sans mot de passe fourni, un mot de passe temporaire est généré, renvoyé une seule fois, et devra être changé à la première connexion.",
    body: v.createEmployeeBody, idempotency: "optional",
    handler: (ctx) => service.createEmployee(ctx.db, ctx.body, context(ctx)),
  }),
  defineRoute({
    id: "admin.employees.get", method: "GET", path: "/admin/employees/:id", surface: "admin", tags, permission: "employees.read",
    summary: "Détail d'un employé", params: v.idParams, response: v.employeeResponse,
    handler: ({ db, params }) => service.getEmployee(db, params.id),
  }),
  defineRoute({
    id: "admin.employees.update", method: "PATCH", path: "/admin/employees/:id", surface: "admin", tags, permission: "employees.update",
    summary: "Modifier un employé (nom, rôle, statut)", params: v.idParams, body: v.updateEmployeeBody, response: v.employeeResponse,
    handler: (ctx) => service.updateEmployee(ctx.db, ctx.params.id, ctx.body, context(ctx)),
  }),
  defineRoute({
    id: "admin.employees.delete", method: "DELETE", path: "/admin/employees/:id", surface: "admin", tags, permission: "employees.delete",
    summary: "Supprimer un employé (suppression logique, sessions révoquées)", params: v.idParams, status: 204,
    handler: async (ctx) => { await service.deleteEmployee(ctx.db, ctx.params.id, context(ctx)); },
  }),
  defineRoute({
    id: "admin.employees.reset_password", method: "POST", path: "/admin/employees/:id/reset-password", surface: "admin", tags, permission: "employees.update",
    summary: "Réinitialiser le mot de passe d'un employé", description: "Génère un mot de passe temporaire (renvoyé une seule fois) et déconnecte toutes ses sessions.", params: v.idParams, status: 200,
    handler: (ctx) => service.resetEmployeePassword(ctx.db, ctx.params.id, context(ctx)),
  }),
  defineRoute({
    id: "admin.roles.list", method: "GET", path: "/admin/roles", surface: "admin", tags, permission: "roles.read",
    summary: "Lister les rôles et leurs permissions", response: v.roleResponse,
    handler: ({ db }) => service.listRoles(db),
  }),
  defineRoute({
    id: "admin.roles.create", method: "POST", path: "/admin/roles", surface: "admin", tags, permission: "roles.create",
    summary: "Créer un rôle personnalisé", body: v.createRoleBody, response: v.roleResponse,
    handler: (ctx) => service.createRole(ctx.db, ctx.body, context(ctx)),
  }),
  defineRoute({
    id: "admin.roles.update", method: "PATCH", path: "/admin/roles/:id", surface: "admin", tags, permission: "roles.update",
    summary: "Modifier un rôle et sa matrice de permissions", params: v.idParams, body: v.updateRoleBody, response: v.roleResponse,
    handler: (ctx) => service.updateRole(ctx.db, ctx.params.id, ctx.body, context(ctx)),
  }),
  defineRoute({
    id: "admin.roles.delete", method: "DELETE", path: "/admin/roles/:id", surface: "admin", tags, permission: "roles.delete",
    summary: "Supprimer un rôle personnalisé non attribué", params: v.idParams, status: 204,
    handler: async (ctx) => { await service.deleteRole(ctx.db, ctx.params.id, context(ctx)); },
  }),
  defineRoute({
    id: "admin.permissions.matrix", method: "GET", path: "/admin/permissions", surface: "admin", tags, permission: "roles.read",
    summary: "Matrice des permissions (ressource × action)",
    handler: async () => service.permissionMatrix(),
  }),
  defineRoute({
    id: "admin.api_keys.list", method: "GET", path: "/admin/api-keys", surface: "admin", tags, permission: "apiKeys.read",
    summary: "Lister les clés d'API",
    handler: ({ db, admin }) => service.listApiKeys(db, admin.shopId),
  }),
  defineRoute({
    id: "admin.api_keys.create", method: "POST", path: "/admin/api-keys", surface: "admin", tags, permission: "apiKeys.create",
    summary: "Créer une clé d'API", description: "La clé secrète n'est renvoyée qu'une seule fois ; seul son hash est conservé.", body: v.createApiKeyBody, idempotency: "optional",
    handler: (ctx) => service.createApiKey(ctx.db, ctx.body, context(ctx)),
  }),
  defineRoute({
    id: "admin.api_keys.revoke", method: "DELETE", path: "/admin/api-keys/:id", surface: "admin", tags, permission: "apiKeys.delete",
    summary: "Révoquer une clé d'API", params: v.idParams, status: 204,
    handler: async (ctx) => { await service.revokeApiKey(ctx.db, ctx.params.id, context(ctx)); },
  }),
  defineRoute({
    id: "admin.me.password", method: "POST", path: "/admin/me/password", surface: "admin", tags, permission: "dashboard.read",
    summary: "Changer son propre mot de passe", body: v.changePasswordBody, status: 204,
    handler: async (ctx) => { await service.changeOwnPassword(ctx.db, ctx.body, context(ctx)); },
  }),
];
