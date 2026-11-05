import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/catalog/products/service";
import * as photos from "@/server/modules/catalog/products/photos";
import * as relations from "@/server/modules/catalog/products/relations";
import * as v from "@/server/modules/catalog/products/validators";

const tags = ["Catalogue : produits"];

export const productRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.products.list", method: "GET", path: "/admin/products", surface: "admin", tags, permission: "catalog.products.read",
    summary: "Lister les produits", description: "Recherche sur titre, référence, SKU, EAN13 et slug. Filtres : statut, type, visibilité, catégorie, marque, fournisseur, stock, prix…",
    list: service.productListSpec,
    handler: ({ db, list }) => service.listProducts(db, list),
  }),
  defineRoute({
    id: "admin.products.trash", method: "GET", path: "/admin/products/trash", surface: "admin", tags, permission: "catalog.trash.manage",
    summary: "Produits dans la corbeille", list: service.productListSpec,
    handler: ({ db, list }) => service.listProducts(db, list, { trash: true }),
  }),
  defineRoute({
    id: "admin.products.create", method: "POST", path: "/admin/products", surface: "admin", tags, permission: "catalog.products.create",
    summary: "Créer un produit (simple, pack ou virtuel)",
    description: "Prix HT en FCFA. Publier à la création exige catalog.products.publish. `initialQuantity` entre le stock dans l'entrepôt par défaut (mouvement tracé).",
    body: v.createProductBody, idempotency: "optional",
    handler: (ctx) => service.createProduct(ctx.db, ctx.body, actorContext(ctx)).catch(service.productConflict),
  }),
  defineRoute({
    id: "admin.products.bulk", method: "POST", path: "/admin/products/bulk", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Action groupée sur des produits", description: "publish, unpublish, archive, delete, feature, unfeature, set_category.", body: v.bulkProductsBody, status: 200,
    handler: (ctx) => service.bulkProducts(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.get", method: "GET", path: "/admin/products/:id", surface: "admin", tags, permission: "catalog.products.read",
    summary: "Fiche produit complète", description: "Images, catégories, étiquettes, caractéristiques, déclinaisons, pack, fournisseurs, prix dégressifs, stock par entrepôt.",
    params: uuidParams,
    handler: ({ db, params }) => service.getProduct(db, params.id),
  }),
  defineRoute({
    id: "admin.products.update", method: "PATCH", path: "/admin/products/:id", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Modifier un produit", description: "Envoyer `version` active le verrou optimiste (409 si le produit a changé). Un nouveau slug crée une redirection 301.",
    params: uuidParams, body: v.updateProductBody,
    handler: (ctx) => service.updateProduct(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)).catch(service.productConflict),
  }),
  defineRoute({
    id: "admin.products.delete", method: "DELETE", path: "/admin/products/:id", surface: "admin", tags, permission: "catalog.products.delete",
    summary: "Mettre un produit à la corbeille", params: uuidParams, status: 204,
    handler: async (ctx) => { await service.deleteProduct(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.products.restore", method: "POST", path: "/admin/products/:id/restore", surface: "admin", tags, permission: "catalog.trash.manage",
    summary: "Restaurer un produit de la corbeille (revient en brouillon s'il était public)", params: uuidParams, status: 200,
    handler: (ctx) => service.restoreProduct(ctx.db, ctx.params.id, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.duplicate", method: "POST", path: "/admin/products/:id/duplicate", surface: "admin", tags, permission: "catalog.products.create",
    summary: "Dupliquer un produit (brouillon, sans stock ni identifiants uniques)", params: uuidParams, body: v.duplicateBody,
    handler: (ctx) => service.duplicateProduct(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),

  // Images
  defineRoute({
    id: "admin.products.images.list", method: "GET", path: "/admin/products/:id/images", surface: "admin", tags, permission: "catalog.products.read",
    summary: "Images d'un produit", params: uuidParams,
    handler: ({ db, params }) => relations.listImages(db, params.id),
  }),
  defineRoute({
    id: "admin.products.images.create", method: "POST", path: "/admin/products/:id/images", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Ajouter une image (la première devient la couverture)", params: uuidParams, body: v.imageBody,
    handler: (ctx) => relations.addImage(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.images.upload", method: "POST", path: "/admin/products/:id/images/upload", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Téléverser des photos (JPEG, PNG, WebP)", params: uuidParams, bodyType: "multipart", maxBodyBytes: photos.MAX_UPLOAD_REQUEST_BYTES,
    description: "`multipart/form-data` : `files` (1 à 10 fichiers, 4 Mo au plus chacun, 4,4 Mo par requête), `alt` et `isCover` facultatifs. Type et signature binaire vérifiés ; la première photo d'un produit sans image devient la couverture.",
    handler: async (ctx) => photos.uploadProductPhotos(ctx.db, ctx.params.id, await photos.readPhotoUpload(ctx.request), actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.images.reorder", method: "PUT", path: "/admin/products/:id/images/order", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Réordonner les images", params: uuidParams, body: v.imageOrderBody,
    handler: (ctx) => relations.reorderImages(ctx.db, ctx.params.id, ctx.body.imageIds, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.images.update", method: "PATCH", path: "/admin/products/:id/images/:imageId", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Modifier une image (texte alternatif, couverture)", params: v.imageParams, body: v.updateImageBody,
    handler: (ctx) => relations.updateImage(ctx.db, ctx.params.id, ctx.params.imageId, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.images.delete", method: "DELETE", path: "/admin/products/:id/images/:imageId", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Supprimer une image", params: v.imageParams, status: 204,
    handler: async (ctx) => { await relations.deleteImage(ctx.db, ctx.params.id, ctx.params.imageId, actorContext(ctx)); },
  }),

  // Déclinaisons
  defineRoute({
    id: "admin.products.combinations.list", method: "GET", path: "/admin/products/:id/combinations", surface: "admin", tags, permission: "catalog.products.read",
    summary: "Déclinaisons d'un produit", params: uuidParams,
    handler: ({ db, params }) => relations.listCombinations(db, params.id),
  }),
  defineRoute({
    id: "admin.products.combinations.generate", method: "POST", path: "/admin/products/:id/combinations/generate", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Générer les déclinaisons depuis des valeurs d'attributs", description: "Produit cartésien par groupe ; les combinaisons existantes sont conservées (500 au maximum).",
    params: uuidParams, body: v.generateCombinationsBody, status: 200,
    handler: (ctx) => relations.generateProductCombinations(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.combinations.update", method: "PATCH", path: "/admin/products/:id/combinations/:variantId", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Modifier une déclinaison (références, impact prix et poids, images, défaut)", params: v.combinationParams, body: v.updateCombinationBody,
    handler: (ctx) => relations.updateCombination(ctx.db, ctx.params.id, ctx.params.variantId, ctx.body, actorContext(ctx)).catch(service.productConflict),
  }),
  defineRoute({
    id: "admin.products.combinations.delete", method: "DELETE", path: "/admin/products/:id/combinations/:variantId", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Supprimer une déclinaison", params: v.combinationParams, status: 204,
    handler: async (ctx) => { await relations.deleteCombination(ctx.db, ctx.params.id, ctx.params.variantId, actorContext(ctx)); },
  }),

  // Caractéristiques, pièces jointes, pack, fournisseurs, virtuel, personnalisation
  defineRoute({
    id: "admin.products.features.set", method: "PUT", path: "/admin/products/:id/features", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Renseigner les caractéristiques (remplace l'existant)", params: uuidParams, body: v.featuresBody,
    handler: (ctx) => relations.setProductFeatures(ctx.db, ctx.params.id, ctx.body.features, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.attachments.create", method: "POST", path: "/admin/products/:id/attachments", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Joindre un document (fiche technique, notice…)", params: uuidParams, body: v.attachmentBody,
    handler: (ctx) => relations.addAttachment(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.attachments.delete", method: "DELETE", path: "/admin/products/:id/attachments/:attachmentId", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Retirer un document joint", params: v.attachmentParams, status: 204,
    handler: async (ctx) => { await relations.deleteAttachment(ctx.db, ctx.params.id, ctx.params.attachmentId, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.products.pack.set", method: "PUT", path: "/admin/products/:id/pack", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Composer un pack", description: "Pas de pack dans un pack. Le disponible du pack est celui de son composant le plus rare.", params: uuidParams, body: v.packBody,
    handler: (ctx) => relations.setPackItems(ctx.db, ctx.params.id, ctx.body.items, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.suppliers.set", method: "PUT", path: "/admin/products/:id/suppliers", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Fournisseurs du produit (références et prix d'achat)", params: uuidParams, body: v.productSuppliersBody,
    handler: (ctx) => relations.setProductSuppliers(ctx.db, ctx.params.id, ctx.body.suppliers, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.download.set", method: "PUT", path: "/admin/products/:id/download", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Fichier d'un produit virtuel", description: "Clé de stockage privée uniquement : le lien de téléchargement sera signé à la commande.", params: uuidParams, body: v.downloadBody,
    handler: (ctx) => relations.setDownload(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.products.download.delete", method: "DELETE", path: "/admin/products/:id/download", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Retirer le fichier d'un produit virtuel", params: uuidParams, status: 204,
    handler: async (ctx) => { await relations.deleteDownload(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.products.customizations.set", method: "PUT", path: "/admin/products/:id/customizations", surface: "admin", tags, permission: "catalog.products.update",
    summary: "Champs de personnalisation (texte ou fichier)", params: uuidParams, body: v.customizationsBody,
    handler: (ctx) => relations.setCustomizations(ctx.db, ctx.params.id, ctx.body.fields, actorContext(ctx)),
  }),
];
