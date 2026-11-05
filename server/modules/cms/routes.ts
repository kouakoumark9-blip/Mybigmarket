import { z } from "zod";
import { blocksSchema } from "@/lib/cms/blocks";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import { customerIdFor } from "@/server/modules/pricing/routes";
import * as service from "@/server/modules/cms/service";

const tags = ["CMS : pages, menus, formulaires, bannières"];
const seoTags = ["SEO : redirections"];
const shopTags = ["Boutique : contenus"];
const slug = z.string().trim().toLowerCase().regex(service.SLUG_PATTERN, "Adresse : minuscules, chiffres et tirets.").max(160);
const code = (max = 60) => z.string().trim().regex(new RegExp(`^[a-z0-9_-]{2,${max}}$`), "Code : minuscules, chiffres, tirets.");
const safeUrl = z.string().trim().max(500).refine((value) => (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\//.test(value), "Chemin interne ou URL https.");
const pageBody = z.object({
  slug, title: z.string().trim().min(2).max(190), excerpt: z.string().trim().max(600).optional(), blocks: blocksSchema.optional(),
  metaTitle: z.string().trim().max(190).nullable().optional(), metaDescription: z.string().trim().max(320).nullable().optional(), status: z.enum(["draft", "published"]).optional(),
}).strict();
const menuItem: z.ZodType<service.MenuItemInput> = z.lazy(() => z.object({
  label: z.string().trim().min(1).max(120), linkType: z.enum(service.LINK_TYPES), target: z.string().trim().min(1).max(300),
  opensNewTab: z.boolean().optional(), isActive: z.boolean().optional(), children: z.array(menuItem).max(30).optional(),
}).strict().superRefine((item, ctx) => {
  if (item.linkType === "url" && !((item.target.startsWith("/") && !item.target.startsWith("//")) || /^https:\/\//.test(item.target))) ctx.addIssue({ code: "custom", path: ["target"], message: "Lien : chemin interne ou URL https." });
  if (item.linkType !== "url" && !service.SLUG_PATTERN.test(item.target)) ctx.addIssue({ code: "custom", path: ["target"], message: "Cible : adresse (slug) du contenu." });
}));
const bannerBody = z.object({
  name: z.string().trim().min(2).max(120), imageUrl: safeUrl, alt: z.string().trim().min(2).max(190), targetUrl: safeUrl.nullable().optional(),
  placement: code(40).optional(), startsAt: z.string().datetime({ offset: true }).nullable().optional(), endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(), isActive: z.boolean().optional(),
}).strict();
const redirectBody = z.object({ oldPath: z.string().trim().min(2).max(300), newPath: z.string().trim().min(1).max(300).refine((value) => value.startsWith("/") || /^https:\/\//.test(value), "Cible : chemin interne ou URL https."), statusCode: z.union([z.literal(301), z.literal(302)]).optional(), note: z.string().trim().max(240).optional() }).strict();

export const cmsRoutes: AnyRoute[] = [
  /* ───────────── Boutique ───────────── */
  defineRoute({
    id: "shop.pages.list", method: "GET", path: "/shop/pages", surface: "shop", auth: "none", tags: shopTags,
    summary: "Pages publiées", handler: ({ db }) => service.publishedPages(db),
  }),
  defineRoute({
    id: "shop.pages.get", method: "GET", path: "/shop/pages/:slug", surface: "shop", tags: shopTags,
    summary: "Page publiée et ses blocs résolus", description: "Les blocs « produits » portent les produits visibles et leurs prix pour le client ; « bannières » et « formulaire » sont résolus.",
    params: z.object({ slug: z.string().trim().min(1).max(160) }),
    handler: async ({ db, params, customer }) => {
      const page = await service.publicPage(db, params.slug, { customerId: await customerIdFor(db, customer?.userId) });
      if (!page) throw errors.notFound("Page", params.slug);
      return page;
    },
  }),
  defineRoute({
    id: "shop.menus.get", method: "GET", path: "/shop/menus/:code", surface: "shop", auth: "none", tags: shopTags,
    summary: "Menu (liens résolus, contenus non publiés exclus)", params: z.object({ code: code(40) }),
    handler: ({ db, params }) => service.publicMenu(db, params.code),
  }),
  defineRoute({
    id: "shop.banners.list", method: "GET", path: "/shop/banners", surface: "shop", auth: "none", tags: shopTags,
    summary: "Bannières actives d'un emplacement", query: z.object({ placement: code(40).default("home") }).strict(),
    handler: ({ db, query }) => service.publicBanners(db, query.placement),
  }),
  defineRoute({
    id: "shop.forms.get", method: "GET", path: "/shop/forms/:code", surface: "shop", auth: "none", tags: shopTags,
    summary: "Formulaire public", description: "Le champ `honeypot` doit être rendu caché et laissé vide.", params: z.object({ code: code() }),
    handler: ({ db, params }) => service.publicForm(db, params.code),
  }),
  defineRoute({
    id: "shop.forms.submit", method: "POST", path: "/shop/forms/:code", surface: "shop", tags: shopTags, rateLimit: "shop.forms", status: 201,
    summary: "Envoyer un formulaire", description: "Chaque champ est validé selon sa déclaration ; l'équipe est prévenue par e-mail.",
    params: z.object({ code: code() }), body: z.record(z.string().max(40), z.union([z.string().max(10_000), z.boolean(), z.number()])),
    handler: ({ db, params, body, customer, meta }) => service.submitForm(db, params.code, body, { userId: customer?.userId ?? null, ip: meta.ip }),
  }),

  /* ───────────── Administration : pages ───────────── */
  defineRoute({
    id: "admin.pages.list", method: "GET", path: "/admin/pages", surface: "admin", tags, permission: "appearance.read",
    summary: "Pages", list: service.pageListSpec, handler: ({ db, list }) => service.listPages(db, list),
  }),
  defineRoute({
    id: "admin.pages.create", method: "POST", path: "/admin/pages", surface: "admin", tags, permission: "appearance.create", status: 201,
    summary: "Créer une page", description: "Blocs : heading, text (balisage minimal), image, cta, faq, columns, products, banners, video (YouTube), form. Aucun HTML libre.",
    body: pageBody, handler: (ctx) => service.createPage(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.pages.get", method: "GET", path: "/admin/pages/:id", surface: "admin", tags, permission: "appearance.read",
    summary: "Page", params: uuidParams, handler: ({ db, params }) => service.getPage(db, params.id),
  }),
  defineRoute({
    id: "admin.pages.update", method: "PATCH", path: "/admin/pages/:id", surface: "admin", tags, permission: "appearance.update",
    summary: "Modifier une page", description: "Renommer une page publiée crée une redirection 301 de l'ancienne adresse.", params: uuidParams, body: pageBody.partial().strict(),
    handler: (ctx) => service.updatePage(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.pages.delete", method: "DELETE", path: "/admin/pages/:id", surface: "admin", tags, permission: "appearance.delete", status: 204,
    summary: "Supprimer une page", description: "`redirectTo` : adresse vers laquelle rediriger l'ancienne page (301).", params: uuidParams, query: z.object({ redirectTo: safeUrl.optional() }).strict(),
    handler: async (ctx) => { await service.deletePage(ctx.db, ctx.params.id, { redirectTo: ctx.query.redirectTo ?? null }, actorContext(ctx)); },
  }),

  /* ───────────── Administration : menus, formulaires, bannières ───────────── */
  defineRoute({
    id: "admin.menus.list", method: "GET", path: "/admin/menus", surface: "admin", tags, permission: "appearance.read",
    summary: "Menus et entrées", handler: ({ db }) => service.listMenus(db),
  }),
  defineRoute({
    id: "admin.menus.save", method: "PUT", path: "/admin/menus/:code", surface: "admin", tags, permission: "appearance.update",
    summary: "Créer ou remplacer un menu", description: "Deux niveaux au plus ; liens vers une URL, une page, une catégorie, un produit ou une marque.",
    params: z.object({ code: code(40) }), body: z.object({ name: z.string().trim().min(2).max(120), isActive: z.boolean().optional(), items: z.array(menuItem).max(60) }).strict(),
    handler: (ctx) => service.saveMenu(ctx.db, ctx.params.code, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.forms.list", method: "GET", path: "/admin/forms", surface: "admin", tags, permission: "appearance.read",
    summary: "Formulaires (avec réponses non lues)", handler: ({ db }) => service.listForms(db),
  }),
  defineRoute({
    id: "admin.forms.get", method: "GET", path: "/admin/forms/:code", surface: "admin", tags, permission: "appearance.read",
    summary: "Formulaire", params: z.object({ code: code() }), handler: ({ db, params }) => service.getForm(db, params.code),
  }),
  defineRoute({
    id: "admin.forms.save", method: "PUT", path: "/admin/forms/:code", surface: "admin", tags, permission: "appearance.update",
    summary: "Créer ou modifier un formulaire", params: z.object({ code: code() }),
    body: z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).optional(), fields: z.array(service.fieldSchema).min(1).max(30), notifyEmail: z.string().trim().email().max(190).nullable().optional(), successMessage: z.string().trim().min(2).max(400).optional(), isActive: z.boolean().optional() }).strict(),
    handler: (ctx) => service.saveForm(ctx.db, ctx.params.code, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.forms.delete", method: "DELETE", path: "/admin/forms/:code", surface: "admin", tags, permission: "appearance.delete", status: 204,
    summary: "Supprimer un formulaire", params: z.object({ code: code() }),
    handler: async (ctx) => { await service.deleteForm(ctx.db, ctx.params.code, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.forms.submissions", method: "GET", path: "/admin/forms/:code/submissions", surface: "admin", tags, permission: "appearance.read",
    summary: "Réponses d'un formulaire", params: z.object({ code: code() }), list: service.submissionListSpec,
    handler: ({ db, params, list }) => service.listSubmissions(db, params.code, list),
  }),
  defineRoute({
    id: "admin.form_submissions.status", method: "PATCH", path: "/admin/form-submissions/:id", surface: "admin", tags, permission: "appearance.update",
    summary: "Marquer une réponse lue ou archivée", params: uuidParams, body: z.object({ status: z.enum(["new", "read", "archived"]) }).strict(),
    handler: (ctx) => service.setSubmissionStatus(ctx.db, ctx.params.id, ctx.body.status, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.banners.list", method: "GET", path: "/admin/banners", surface: "admin", tags, permission: "appearance.read",
    summary: "Bannières", query: z.object({ placement: code(40).optional() }).strict(), handler: ({ db, query }) => service.listBanners(db, query.placement),
  }),
  defineRoute({
    id: "admin.banners.create", method: "POST", path: "/admin/banners", surface: "admin", tags, permission: "appearance.create", status: 201,
    summary: "Créer une bannière", body: bannerBody, handler: (ctx) => service.saveBanner(ctx.db, null, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.banners.update", method: "PATCH", path: "/admin/banners/:id", surface: "admin", tags, permission: "appearance.update",
    summary: "Modifier une bannière", params: uuidParams, body: bannerBody.partial().strict(), handler: (ctx) => service.saveBanner(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.banners.delete", method: "DELETE", path: "/admin/banners/:id", surface: "admin", tags, permission: "appearance.delete", status: 204,
    summary: "Supprimer une bannière", params: uuidParams, handler: async (ctx) => { await service.deleteBanner(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),

  /* ───────────── Administration : redirections ───────────── */
  defineRoute({
    id: "admin.redirects.list", method: "GET", path: "/admin/redirects", surface: "admin", tags: seoTags, permission: "seo.read",
    summary: "Redirections", description: "Recherche sur l'ancienne ou la nouvelle adresse ; nombre d'utilisations.", list: service.redirectListSpec,
    handler: ({ db, list }) => service.listRedirects(db, list),
  }),
  defineRoute({
    id: "admin.redirects.create", method: "POST", path: "/admin/redirects", surface: "admin", tags: seoTags, permission: "seo.update", status: 201,
    summary: "Créer une redirection", description: "301 par défaut. Refusée si elle crée une boucle ; les chaînes sont aplaties.", body: redirectBody,
    handler: (ctx) => service.saveRedirect(ctx.db, null, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.redirects.update", method: "PATCH", path: "/admin/redirects/:id", surface: "admin", tags: seoTags, permission: "seo.update",
    summary: "Modifier une redirection", params: uuidParams, body: redirectBody,
    handler: (ctx) => service.saveRedirect(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.redirects.delete", method: "DELETE", path: "/admin/redirects/:id", surface: "admin", tags: seoTags, permission: "seo.update", status: 204,
    summary: "Supprimer une redirection", params: uuidParams, handler: async (ctx) => { await service.deleteRedirect(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
];
