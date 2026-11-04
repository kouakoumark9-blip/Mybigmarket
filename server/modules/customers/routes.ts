import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, intIdParams, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/customers/service";

const tags = ["Clients"];
const groupBody = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,59}$/), name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).optional(),
  discountBasisPoints: z.number().int().min(0).max(9000).optional(), priceDisplayMethod: z.enum(["tax_excluded", "tax_included"]).optional(), showPrices: z.boolean().optional(),
  isDefault: z.boolean().optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(1000).optional(),
}).strict();

export const customerRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.customers.list", method: "GET", path: "/admin/customers", surface: "admin", tags, permission: "customers.read",
    summary: "Clients", description: "Recherche par nom, e-mail, téléphone ou société ; nombre de commandes et montant dépensé.", list: service.customerListSpec,
    handler: ({ db, list }) => service.listCustomers(db, list),
  }),
  defineRoute({
    id: "admin.customers.get", method: "GET", path: "/admin/customers/:id", surface: "admin", tags, permission: "customers.read",
    summary: "Fiche client (adresses, groupes, dernières commandes)", params: uuidParams,
    handler: ({ db, params }) => service.getCustomer(db, params.id),
  }),
  defineRoute({
    id: "admin.customers.update", method: "PATCH", path: "/admin/customers/:id", surface: "admin", tags, permission: "customers.update",
    summary: "Modifier un client (groupe, segment, note interne)", params: uuidParams,
    body: z.object({ customerGroupId: z.number().int().positive().nullable().optional(), additionalGroupIds: z.array(z.number().int().positive()).max(20).optional(), segment: z.enum(["individual", "business", "reseller"]).optional(), internalNote: z.string().trim().max(5000).optional(), companyName: z.string().trim().max(190).nullable().optional(), taxNumber: z.string().trim().max(80).nullable().optional() }).strict(),
    handler: (ctx) => service.updateCustomer(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.customers.anonymize", method: "POST", path: "/admin/customers/:id/anonymize", surface: "admin", tags, permission: "customers.manage",
    summary: "Anonymiser un client (droit à l'effacement)", description: "Refusé tant qu'une commande est en cours. Les commandes sont conservées (obligation comptable), leurs données personnelles effacées.",
    params: uuidParams, status: 204,
    handler: async (ctx) => { await service.anonymizeCustomer(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.customer_groups.list", method: "GET", path: "/admin/customer-groups", surface: "admin", tags, permission: "customers.read",
    summary: "Groupes de clients (remise, affichage des prix, effectif)", handler: ({ db }) => service.listGroups(db),
  }),
  defineRoute({
    id: "admin.customer_groups.create", method: "POST", path: "/admin/customer-groups", surface: "admin", tags, permission: "customers.manage",
    summary: "Créer un groupe de clients", body: groupBody,
    handler: (ctx) => service.createGroup(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.customer_groups.update", method: "PATCH", path: "/admin/customer-groups/:id", surface: "admin", tags, permission: "customers.manage",
    summary: "Modifier un groupe de clients", params: intIdParams, body: groupBody.omit({ code: true }).partial().strict(),
    handler: (ctx) => service.updateGroup(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.customer_groups.delete", method: "DELETE", path: "/admin/customer-groups/:id", surface: "admin", tags, permission: "customers.manage",
    summary: "Supprimer un groupe (ses clients rejoignent le groupe par défaut)", params: intIdParams, status: 204,
    handler: async (ctx) => { await service.deleteGroup(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
];
