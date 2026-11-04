/**
 * Taxes et devises. Une règle de taxe donne un taux par pays (et région) ; un groupe de taxes
 * rassemble des règles et s'attribue aux produits (le taux du pays de livraison s'applique,
 * lib/taxes). Les devises servent à l'affichage : la comptabilité reste en FCFA (XOF).
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { currencies, products, taxRuleGroupRules, taxRuleGroups, taxRules } from "@/lib/db/schema";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import type { Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { countryCode, currencyCode, definedEntries, intIdParams, uuidParams } from "@/server/modules/catalog/shared";

const tags = ["Taxes et devises"];

const ruleView = (row: typeof taxRules.$inferSelect) => ({ id: row.id, code: row.code, countryCode: row.countryCode, region: row.region, label: row.label, ratePercent: Number(row.ratePercent), isActive: row.isActive });
const ruleBody = z.object({ code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,59}$/), countryCode, region: z.string().trim().max(120).nullable().optional(), label: z.string().trim().min(2).max(120), ratePercent: z.number().min(0).max(100), isActive: z.boolean().default(true) }).strict();

async function groupView(executor: Executor, id: string) {
  const [group] = await executor.select().from(taxRuleGroups).where(and(eq(taxRuleGroups.id, id), isNull(taxRuleGroups.deletedAt))).limit(1);
  if (!group) throw errors.notFound("Groupe de taxes", id);
  const rules = await executor.select({ rule: taxRules }).from(taxRuleGroupRules).innerJoin(taxRules, eq(taxRules.id, taxRuleGroupRules.taxRuleId)).where(eq(taxRuleGroupRules.taxRuleGroupId, id));
  return { id: group.id, name: group.name, isActive: group.isActive, rules: rules.map(({ rule }) => ruleView(rule)) };
}

async function setGroupRules(executor: Executor, groupId: string, ruleIds: string[]) {
  const unique = [...new Set(ruleIds)];
  if (unique.length) {
    const found = await executor.select({ id: taxRules.id }).from(taxRules).where(inArray(taxRules.id, unique));
    if (found.length !== unique.length) throw errors.validation([{ path: "ruleIds", message: "Règle de taxe introuvable." }]);
  }
  await executor.delete(taxRuleGroupRules).where(eq(taxRuleGroupRules.taxRuleGroupId, groupId));
  if (unique.length) await executor.insert(taxRuleGroupRules).values(unique.map((taxRuleId) => ({ taxRuleGroupId: groupId, taxRuleId })));
}

const currencyView = (row: typeof currencies.$inferSelect) => ({ id: row.id, code: row.code, name: row.name, symbol: row.symbol, decimals: row.decimals, symbolPosition: row.symbolPosition, conversionRate: Number(row.conversionRate), isDefault: row.isDefault, isActive: row.isActive, updatedAt: row.updatedAt.toISOString() });

export const localizationRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.tax_rules.list", method: "GET", path: "/admin/tax-rules", surface: "admin", tags, permission: "localization.read",
    summary: "Règles de taxe (taux par pays et région)",
    handler: async ({ db }) => (await db.select().from(taxRules).orderBy(asc(taxRules.countryCode), asc(taxRules.code))).map(ruleView),
  }),
  defineRoute({
    id: "admin.tax_rules.create", method: "POST", path: "/admin/tax-rules", surface: "admin", tags, permission: "localization.create",
    summary: "Créer une règle de taxe", body: ruleBody,
    handler: (ctx) => ctx.db.transaction(async (tx) => {
      const [row] = await tx.insert(taxRules).values({ ...ctx.body, ratePercent: String(ctx.body.ratePercent) }).returning();
      await recordAudit(tx, { action: "tax_rule.created", entityType: "tax_rule", entityId: row.id, after: ruleView(row), actor: ctx.admin, meta: ctx.meta });
      return ruleView(row);
    }),
  }),
  defineRoute({
    id: "admin.tax_rules.update", method: "PATCH", path: "/admin/tax-rules/:id", surface: "admin", tags, permission: "localization.update",
    summary: "Modifier une règle de taxe", description: "Un nouveau taux s'applique aux prochaines commandes ; les commandes passées gardent leur taux figé.", params: uuidParams,
    body: ruleBody.omit({ code: true }).partial().strict(),
    handler: (ctx) => ctx.db.transaction(async (tx) => {
      const [before] = await tx.select().from(taxRules).where(eq(taxRules.id, ctx.params.id)).limit(1);
      if (!before) throw errors.notFound("Règle de taxe", ctx.params.id);
      const { ratePercent, ...rest } = ctx.body;
      const [after] = await tx.update(taxRules).set({ ...definedEntries(rest), ...(ratePercent !== undefined ? { ratePercent: String(ratePercent) } : {}), updatedAt: new Date() }).where(eq(taxRules.id, ctx.params.id)).returning();
      await recordAudit(tx, { action: "tax_rule.updated", entityType: "tax_rule", entityId: ctx.params.id, before: ruleView(before), after: ruleView(after), actor: ctx.admin, meta: ctx.meta });
      return ruleView(after);
    }),
  }),
  defineRoute({
    id: "admin.tax_groups.create", method: "POST", path: "/admin/tax-rule-groups", surface: "admin", tags, permission: "localization.create",
    summary: "Créer un groupe de taxes (avec ses règles)", body: z.object({ name: z.string().trim().min(2).max(120), ruleIds: z.array(z.string().uuid()).max(100).default([]) }).strict(),
    handler: (ctx) => ctx.db.transaction(async (tx) => {
      const [group] = await tx.insert(taxRuleGroups).values({ name: ctx.body.name }).returning();
      await setGroupRules(tx, group.id, ctx.body.ruleIds);
      const view = await groupView(tx, group.id);
      await recordAudit(tx, { action: "tax_group.created", entityType: "tax_group", entityId: group.id, after: view, actor: ctx.admin, meta: ctx.meta });
      return view;
    }),
  }),
  defineRoute({
    id: "admin.tax_groups.update", method: "PATCH", path: "/admin/tax-rule-groups/:id", surface: "admin", tags, permission: "localization.update",
    summary: "Modifier un groupe de taxes", params: uuidParams, body: z.object({ name: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional(), ruleIds: z.array(z.string().uuid()).max(100).optional() }).strict(),
    handler: (ctx) => ctx.db.transaction(async (tx) => {
      const before = await groupView(tx, ctx.params.id);
      const { ruleIds, ...fields } = ctx.body;
      if (Object.keys(definedEntries(fields)).length) await tx.update(taxRuleGroups).set(definedEntries(fields)).where(eq(taxRuleGroups.id, ctx.params.id));
      if (ruleIds) await setGroupRules(tx, ctx.params.id, ruleIds);
      const after = await groupView(tx, ctx.params.id);
      await recordAudit(tx, { action: "tax_group.updated", entityType: "tax_group", entityId: ctx.params.id, before, after, actor: ctx.admin, meta: ctx.meta });
      return after;
    }),
  }),
  defineRoute({
    id: "admin.tax_groups.delete", method: "DELETE", path: "/admin/tax-rule-groups/:id", surface: "admin", tags, permission: "localization.delete",
    summary: "Supprimer un groupe de taxes (les produits concernés n'ont plus de taxe)", params: uuidParams, status: 204,
    handler: async (ctx) => {
      await ctx.db.transaction(async (tx) => {
        const before = await groupView(tx, ctx.params.id);
        const affected = await tx.update(products).set({ taxRuleGroupId: null, updatedAt: new Date() }).where(eq(products.taxRuleGroupId, ctx.params.id)).returning({ id: products.id });
        await tx.update(taxRuleGroups).set({ deletedAt: new Date(), isActive: false }).where(eq(taxRuleGroups.id, ctx.params.id));
        await recordAudit(tx, { action: "tax_group.deleted", entityType: "tax_group", entityId: ctx.params.id, before, details: { productsUpdated: affected.length }, actor: ctx.admin, meta: ctx.meta });
      });
    },
  }),
  defineRoute({
    id: "admin.currencies.list", method: "GET", path: "/admin/currencies", surface: "admin", tags, permission: "localization.read",
    summary: "Devises (taux de conversion depuis le FCFA)",
    handler: async ({ db }) => (await db.select().from(currencies).orderBy(asc(currencies.code))).map(currencyView),
  }),
  defineRoute({
    id: "admin.currencies.upsert", method: "PUT", path: "/admin/currencies/:id", surface: "admin", tags, permission: "localization.update",
    summary: "Modifier une devise (taux, activation)", description: "Le taux convertit 1 FCFA dans la devise. Affichage seulement : commandes et factures restent en FCFA.", params: intIdParams,
    body: z.object({ conversionRate: z.number().positive().max(1_000_000).optional(), isActive: z.boolean().optional(), symbol: z.string().trim().min(1).max(8).optional(), decimals: z.number().int().min(0).max(4).optional() }).strict(),
    handler: (ctx) => ctx.db.transaction(async (tx) => {
      const [before] = await tx.select().from(currencies).where(eq(currencies.id, ctx.params.id)).limit(1);
      if (!before) throw errors.notFound("Devise", ctx.params.id);
      if (before.isDefault && (ctx.body.isActive === false || (ctx.body.conversionRate !== undefined && ctx.body.conversionRate !== 1))) throw errors.rule("La devise par défaut reste active, au taux de 1.");
      const { conversionRate, ...rest } = ctx.body;
      const [after] = await tx.update(currencies).set({ ...definedEntries(rest), ...(conversionRate !== undefined ? { conversionRate: String(conversionRate) } : {}), updatedAt: new Date() }).where(eq(currencies.id, ctx.params.id)).returning();
      await recordAudit(tx, { action: "currency.updated", entityType: "currency", entityId: ctx.params.id, before: currencyView(before), after: currencyView(after), actor: ctx.admin, meta: ctx.meta });
      return currencyView(after);
    }),
  }),
  defineRoute({
    id: "admin.currencies.create", method: "POST", path: "/admin/currencies", surface: "admin", tags, permission: "localization.create",
    summary: "Ajouter une devise d'affichage", body: z.object({ code: currencyCode, name: z.string().trim().min(2).max(80), symbol: z.string().trim().min(1).max(8), decimals: z.number().int().min(0).max(4).default(2), conversionRate: z.number().positive().max(1_000_000), isActive: z.boolean().default(true) }).strict(),
    handler: (ctx) => ctx.db.transaction(async (tx) => {
      const [row] = await tx.insert(currencies).values({ ...ctx.body, conversionRate: String(ctx.body.conversionRate) }).returning();
      await recordAudit(tx, { action: "currency.created", entityType: "currency", entityId: row.id, after: currencyView(row), actor: ctx.admin, meta: ctx.meta });
      return currencyView(row);
    }),
  }),
  defineRoute({
    id: "shop.currencies", method: "GET", path: "/shop/currencies", surface: "shop", auth: "none", tags: ["Boutique"],
    summary: "Devises d'affichage disponibles (FCFA par défaut)",
    handler: async ({ db }) => (await db.select().from(currencies).where(eq(currencies.isActive, true)).orderBy(asc(currencies.code))).map((row) => ({ code: row.code, name: row.name, symbol: row.symbol, decimals: row.decimals, symbolPosition: row.symbolPosition, conversionRate: Number(row.conversionRate), isDefault: row.isDefault })),
  }),
];
