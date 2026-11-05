import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/shops/service";

const tags = ["Boutiques"];
const code = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,58}$/, "Code : lettres minuscules, chiffres et tirets.");
const domain = z.string().trim().toLowerCase().regex(/^(?=.{3,190}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "Nom de domaine invalide (ex. pro.mybigmarket.ci).");

export const shopRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.shops.list", method: "GET", path: "/admin/shops", surface: "admin", tags, permission: "shops.read",
    summary: "Boutiques accessibles (avec la boutique de la requête)", description: "La boutique d'une requête d'administration se choisit avec l'en-tête `X-Shop-Code`.",
    handler: async ({ db, admin, shop }) => ({ current: shop.code, shops: await service.listShops(db, admin) }),
  }),
  defineRoute({
    id: "admin.shops.create", method: "POST", path: "/admin/shops", surface: "admin", tags, permission: "shops.manage",
    summary: "Créer une boutique", description: "`copySettingsFrom` : code d'une boutique dont les paramètres sont recopiés (nom remplacé).",
    body: z.object({ code, name: z.string().trim().min(2).max(160), domain: domain.nullable().optional(), isActive: z.boolean().optional(), copySettingsFrom: code.optional() }).strict(),
    handler: (ctx) => service.createShop(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shops.update", method: "PATCH", path: "/admin/shops/:id", surface: "admin", tags, permission: "shops.manage",
    summary: "Modifier une boutique (nom, domaine, activation, boutique par défaut)", params: uuidParams,
    body: z.object({ name: z.string().trim().min(2).max(160).optional(), domain: domain.nullable().optional(), isActive: z.boolean().optional(), isDefault: z.literal(true).optional() }).strict()
      .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier."),
    handler: (ctx) => service.updateShop(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shops.employees", method: "GET", path: "/admin/shops/:id/employees", surface: "admin", tags, permission: "shops.manage",
    summary: "Employés attribués à une boutique", params: uuidParams,
    handler: ({ db, params }) => service.shopEmployees(db, params.id),
  }),
  defineRoute({
    id: "admin.shops.employees.set", method: "PUT", path: "/admin/shops/:id/employees", surface: "admin", tags, permission: "shops.manage",
    summary: "Attribuer des employés à une boutique (remplace la liste)", description: "Un employé sans attribution travaille sur la boutique par défaut ; un SuperAdmin ou un employé avec « shops.manage » accède à toutes.",
    params: uuidParams, body: z.object({ employeeIds: z.array(z.string().uuid()).max(500) }).strict(),
    handler: (ctx) => service.setShopEmployees(ctx.db, ctx.params.id, ctx.body.employeeIds, actorContext(ctx)),
  }),
];
