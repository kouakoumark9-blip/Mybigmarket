import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { toErrorBody } from "@/server/core/errors";
import { countryCode, queryBoolean } from "@/server/modules/catalog/shared";
import { customerIdFor } from "@/server/modules/pricing/routes";
import * as service from "@/server/modules/storefront/service";

const tags = ["Boutique : catalogue"];

const searchQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(140).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: queryBoolean.optional(),
  featured: queryBoolean.optional(),
  /** Valeurs de caractéristiques, séparées par des virgules. */
  features: z.string().trim().max(800).transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid("Valeur de caractéristique invalide.")).max(20)).optional(),
  facets: queryBoolean.optional(),
  sort: z.enum(["relevance", "newest", "price_asc", "price_desc", "name", "best_selling"]).default("relevance"),
  country: countryCode.optional(),
}).strict();

const suggestQuery = z.object({ q: z.string().trim().min(2).max(120) }).strict();

const slugParams = z.object({ slug: z.string().trim().min(1).max(210) });
const productQuery = z.object({ quantity: z.coerce.number().int().min(1).max(100_000).optional(), country: countryCode.optional() }).strict();

export const storefrontRoutes: AnyRoute[] = [
  defineRoute({
    id: "shop.categories.tree", method: "GET", path: "/shop/categories", surface: "shop", auth: "none", tags,
    summary: "Arbre des catégories actives (avec nombre de produits visibles)",
    handler: ({ db }) => service.publicCategories(db),
  }),
  defineRoute({
    id: "shop.categories.get", method: "GET", path: "/shop/categories/:slug", surface: "shop", auth: "none", tags,
    summary: "Catégorie : fil d'Ariane, sous-catégories, SEO", params: slugParams,
    handler: ({ db, params }) => service.publicCategory(db, params.slug),
  }),
  defineRoute({
    id: "shop.brands.list", method: "GET", path: "/shop/brands", surface: "shop", auth: "none", tags,
    summary: "Marques actives",
    handler: ({ db }) => service.publicBrands(db),
  }),
  defineRoute({
    id: "shop.products.list", method: "GET", path: "/shop/products", surface: "shop", tags, rateLimit: "shop.search",
    summary: "Produits visibles (recherche, catégorie avec sous-catégories, marque, prix, stock, caractéristiques, tri, facettes)",
    description: "Recherche plein texte insensible aux accents et à la casse, préfixes et fautes de frappe (`meta.fuzzy`). Prix du client connecté. `minPrice`/`maxPrice` portent sur le prix catalogue HT. `features` : identifiants de valeurs séparés par des virgules. `facets=1` ajoute `meta.facets`. Tri `best_selling` : unités vendues (commandes payées ou confirmées, retours déduits).",
    query: searchQuery,
    handler: async ({ db, query, customer }) => {
      const { country, ...search } = query;
      return service.searchProducts(db, search, { customerId: await customerIdFor(db, customer?.userId), countryCode: country });
    },
  }),
  defineRoute({
    id: "shop.search.suggest", method: "GET", path: "/shop/search/suggest", surface: "shop", auth: "none", tags, rateLimit: "shop.search",
    summary: "Suggestions pendant la saisie (produits, catégories, marques)", description: "Insensible aux accents ; tolère les fautes de frappe si rien ne correspond exactement.",
    query: suggestQuery,
    handler: ({ db, query }) => service.searchSuggestions(db, query.q),
  }),
  defineRoute({
    id: "shop.products.get", method: "GET", path: "/shop/products/:slug", surface: "shop", tags,
    summary: "Fiche produit publique", description: "Prix du client (et de chaque déclinaison), disponibilité, caractéristiques, produits associés. Une ancienne URL répond 301 vers la nouvelle.",
    params: slugParams, query: productQuery,
    handler: async ({ db, params, query, customer, meta }) => {
      try {
        return await service.publicProduct(db, params.slug, { customerId: await customerIdFor(db, customer?.userId), countryCode: query.country, quantity: query.quantity });
      } catch (error) {
        if (!(error instanceof service.RedirectSignal)) throw error;
        // Produit renommé : redirection HTTP vers la nouvelle ressource de l'API.
        if (error.location.startsWith("/produits/")) {
          const location = `/api/v1/shop/products/${encodeURIComponent(error.location.slice("/produits/".length))}`;
          return Response.json(toErrorBody(error, meta.requestId), { status: error.permanent ? 301 : 302, headers: { location, "x-request-id": meta.requestId, "cache-control": "no-store" } });
        }
        throw error;
      }
    },
  }),
];
