import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, intIdParams, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/catalog/taxonomy/service";
import * as v from "@/server/modules/catalog/taxonomy/validators";

const tags = ["Catalogue : taxonomie"];
const groupParams = z.object({ id: z.string().uuid() });

export const taxonomyRoutes: AnyRoute[] = [
  // Catégories
  defineRoute({
    id: "admin.categories.list", method: "GET", path: "/admin/categories", surface: "admin", tags, permission: "catalog.categories.read",
    summary: "Lister les catégories (liste plate filtrable)", list: service.categoryListSpec,
    handler: ({ db, list }) => service.listCategories(db, list),
  }),
  defineRoute({
    id: "admin.categories.tree", method: "GET", path: "/admin/categories/tree", surface: "admin", tags, permission: "catalog.categories.read",
    summary: "Arbre complet des catégories", description: "Profondeur illimitée, avec chemin de slugs et nombre de produits par catégorie.",
    handler: ({ db }) => service.categoryTree(db),
  }),
  defineRoute({
    id: "admin.categories.create", method: "POST", path: "/admin/categories", surface: "admin", tags, permission: "catalog.categories.create",
    summary: "Créer une catégorie", body: v.createCategoryBody, idempotency: "optional",
    handler: (ctx) => service.createCategory(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.categories.get", method: "GET", path: "/admin/categories/:id", surface: "admin", tags, permission: "catalog.categories.read",
    summary: "Détail d'une catégorie (fil d'Ariane, sous-catégories)", params: intIdParams,
    handler: ({ db, params }) => service.getCategory(db, params.id),
  }),
  defineRoute({
    id: "admin.categories.update", method: "PATCH", path: "/admin/categories/:id", surface: "admin", tags, permission: "catalog.categories.update",
    summary: "Modifier une catégorie", description: "Un changement de parent est refusé s'il crée un cycle.", params: intIdParams, body: v.updateCategoryBody,
    handler: (ctx) => service.updateCategory(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.categories.move", method: "POST", path: "/admin/categories/:id/move", surface: "admin", tags, permission: "catalog.categories.update",
    summary: "Déplacer une catégorie (parent et position)", params: intIdParams, body: v.moveCategoryBody, status: 200,
    handler: (ctx) => service.moveCategory(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.categories.delete", method: "DELETE", path: "/admin/categories/:id", surface: "admin", tags, permission: "catalog.categories.delete",
    summary: "Supprimer une catégorie", description: "Les sous-catégories remontent d'un niveau ; les produits passent dans la catégorie parente ou dans `moveProductsTo`.",
    params: intIdParams, query: v.deleteCategoryQuery, status: 204,
    handler: async (ctx) => { await service.deleteCategory(ctx.db, ctx.params.id, ctx.query, actorContext(ctx)); },
  }),

  // Marques
  defineRoute({
    id: "admin.brands.list", method: "GET", path: "/admin/brands", surface: "admin", tags, permission: "catalog.brands.read",
    summary: "Lister les marques", list: service.brandListSpec,
    handler: ({ db, list }) => service.listBrands(db, list),
  }),
  defineRoute({
    id: "admin.brands.create", method: "POST", path: "/admin/brands", surface: "admin", tags, permission: "catalog.brands.create",
    summary: "Créer une marque", body: v.createBrandBody, idempotency: "optional",
    handler: (ctx) => service.createBrand(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.brands.get", method: "GET", path: "/admin/brands/:id", surface: "admin", tags, permission: "catalog.brands.read",
    summary: "Détail d'une marque", params: intIdParams,
    handler: ({ db, params }) => service.getBrand(db, params.id),
  }),
  defineRoute({
    id: "admin.brands.update", method: "PATCH", path: "/admin/brands/:id", surface: "admin", tags, permission: "catalog.brands.update",
    summary: "Modifier une marque", params: intIdParams, body: v.updateBrandBody,
    handler: (ctx) => service.updateBrand(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.brands.delete", method: "DELETE", path: "/admin/brands/:id", surface: "admin", tags, permission: "catalog.brands.delete",
    summary: "Supprimer une marque (corbeille)", params: intIdParams, status: 204,
    handler: async (ctx) => { await service.deleteBrand(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),

  // Fournisseurs
  defineRoute({
    id: "admin.suppliers.list", method: "GET", path: "/admin/suppliers", surface: "admin", tags, permission: "catalog.suppliers.read",
    summary: "Lister les fournisseurs", list: service.supplierListSpec,
    handler: ({ db, list }) => service.listSuppliers(db, list),
  }),
  defineRoute({
    id: "admin.suppliers.create", method: "POST", path: "/admin/suppliers", surface: "admin", tags, permission: "catalog.suppliers.create",
    summary: "Créer un fournisseur", body: v.createSupplierBody, idempotency: "optional",
    handler: (ctx) => service.createSupplier(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.suppliers.get", method: "GET", path: "/admin/suppliers/:id", surface: "admin", tags, permission: "catalog.suppliers.read",
    summary: "Détail d'un fournisseur", params: uuidParams,
    handler: ({ db, params }) => service.getSupplier(db, params.id),
  }),
  defineRoute({
    id: "admin.suppliers.update", method: "PATCH", path: "/admin/suppliers/:id", surface: "admin", tags, permission: "catalog.suppliers.update",
    summary: "Modifier un fournisseur", params: uuidParams, body: v.updateSupplierBody,
    handler: (ctx) => service.updateSupplier(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.suppliers.delete", method: "DELETE", path: "/admin/suppliers/:id", surface: "admin", tags, permission: "catalog.suppliers.delete",
    summary: "Supprimer un fournisseur (corbeille)", params: uuidParams, status: 204,
    handler: async (ctx) => { await service.deleteSupplier(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),

  // Attributs
  defineRoute({
    id: "admin.attribute_groups.list", method: "GET", path: "/admin/attribute-groups", surface: "admin", tags, permission: "catalog.attributes.read",
    summary: "Groupes d'attributs et leurs valeurs",
    handler: ({ db }) => service.listAttributeGroups(db),
  }),
  defineRoute({
    id: "admin.attribute_groups.create", method: "POST", path: "/admin/attribute-groups", surface: "admin", tags, permission: "catalog.attributes.create",
    summary: "Créer un groupe d'attributs (avec ses valeurs)", body: v.createAttributeGroupBody,
    handler: (ctx) => service.createAttributeGroup(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.attribute_groups.get", method: "GET", path: "/admin/attribute-groups/:id", surface: "admin", tags, permission: "catalog.attributes.read",
    summary: "Détail d'un groupe d'attributs", params: groupParams,
    handler: ({ db, params }) => service.getAttributeGroup(db, params.id),
  }),
  defineRoute({
    id: "admin.attribute_groups.update", method: "PATCH", path: "/admin/attribute-groups/:id", surface: "admin", tags, permission: "catalog.attributes.update",
    summary: "Modifier un groupe d'attributs", params: groupParams, body: v.updateAttributeGroupBody,
    handler: (ctx) => service.updateAttributeGroup(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.attribute_groups.delete", method: "DELETE", path: "/admin/attribute-groups/:id", surface: "admin", tags, permission: "catalog.attributes.delete",
    summary: "Supprimer un groupe d'attributs inutilisé", params: groupParams, status: 204,
    handler: async (ctx) => { await service.deleteAttributeGroup(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.attribute_values.create", method: "POST", path: "/admin/attribute-groups/:id/values", surface: "admin", tags, permission: "catalog.attributes.create",
    summary: "Ajouter une valeur d'attribut", params: groupParams, body: v.attributeValueBody,
    handler: (ctx) => service.addAttributeValue(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.attribute_values.update", method: "PATCH", path: "/admin/attribute-groups/:id/values/:valueId", surface: "admin", tags, permission: "catalog.attributes.update",
    summary: "Modifier une valeur d'attribut", params: v.groupValueParams, body: v.updateAttributeValueBody,
    handler: (ctx) => service.updateAttributeValue(ctx.db, ctx.params.id, ctx.params.valueId, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.attribute_values.delete", method: "DELETE", path: "/admin/attribute-groups/:id/values/:valueId", surface: "admin", tags, permission: "catalog.attributes.delete",
    summary: "Supprimer une valeur d'attribut inutilisée", params: v.groupValueParams, status: 204,
    handler: async (ctx) => { await service.deleteAttributeValue(ctx.db, ctx.params.id, ctx.params.valueId, actorContext(ctx)); },
  }),

  // Caractéristiques
  defineRoute({
    id: "admin.features.list", method: "GET", path: "/admin/features", surface: "admin", tags, permission: "catalog.features.read",
    summary: "Caractéristiques et leurs valeurs prédéfinies",
    handler: ({ db }) => service.listFeatures(db),
  }),
  defineRoute({
    id: "admin.features.create", method: "POST", path: "/admin/features", surface: "admin", tags, permission: "catalog.features.create",
    summary: "Créer une caractéristique", body: v.createFeatureBody,
    handler: (ctx) => service.createFeature(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.features.get", method: "GET", path: "/admin/features/:id", surface: "admin", tags, permission: "catalog.features.read",
    summary: "Détail d'une caractéristique", params: groupParams,
    handler: ({ db, params }) => service.getFeature(db, params.id),
  }),
  defineRoute({
    id: "admin.features.update", method: "PATCH", path: "/admin/features/:id", surface: "admin", tags, permission: "catalog.features.update",
    summary: "Modifier une caractéristique", params: groupParams, body: v.updateFeatureBody,
    handler: (ctx) => service.updateFeature(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.features.delete", method: "DELETE", path: "/admin/features/:id", surface: "admin", tags, permission: "catalog.features.delete",
    summary: "Supprimer une caractéristique inutilisée", params: groupParams, status: 204,
    handler: async (ctx) => { await service.deleteFeature(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.feature_values.create", method: "POST", path: "/admin/features/:id/values", surface: "admin", tags, permission: "catalog.features.create",
    summary: "Ajouter une valeur prédéfinie", params: groupParams, body: v.featureValueBody,
    handler: (ctx) => service.addFeatureValue(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.feature_values.update", method: "PATCH", path: "/admin/features/:id/values/:valueId", surface: "admin", tags, permission: "catalog.features.update",
    summary: "Modifier une valeur prédéfinie", params: v.featureValueParams, body: v.featureValueBody,
    handler: (ctx) => service.updateFeatureValue(ctx.db, ctx.params.id, ctx.params.valueId, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.feature_values.delete", method: "DELETE", path: "/admin/features/:id/values/:valueId", surface: "admin", tags, permission: "catalog.features.delete",
    summary: "Supprimer une valeur prédéfinie inutilisée", params: v.featureValueParams, status: 204,
    handler: async (ctx) => { await service.deleteFeatureValue(ctx.db, ctx.params.id, ctx.params.valueId, actorContext(ctx)); },
  }),
];
