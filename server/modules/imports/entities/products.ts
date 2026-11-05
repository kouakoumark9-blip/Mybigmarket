/**
 * Import de produits. Clé : la référence (une référence connue met le produit à jour, sinon il est
 * créé). Chaque ligne passe par les mêmes services que l'administration (validation, slug unique,
 * stock initial tracé, audit, événements). Une cellule vide ne modifie rien.
 */
import { and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { products, users } from "@/lib/db/schema";
import { hasPermission } from "@/server/core/auth/principal";
import { errors } from "@/server/core/errors";
import { createProduct, updateProduct } from "@/server/modules/catalog/products/service";
import { PUBLIC_STATUSES, createProductBody, productStatuses, updateProductBody } from "@/server/modules/catalog/products/validators";
import {
  CONDITION_LABELS, PRODUCT_STATUS_LABELS, VISIBILITY_LABELS, parseBoolean, parseEnum, parseInteger, parseList, readCell,
  type ImportRow, type RowMessage,
} from "@/server/modules/imports/parsers";
import { ensureBrand, ensureTopCategory, loadBrandIndex, loadCategoryIndex } from "@/server/modules/imports/resolvers";
import type { ColumnSpec, ImportEntity, RowPlan } from "@/server/modules/imports/types";

export const productImportOptions = z.object({
  /** Une référence déjà connue met le produit à jour (sinon la ligne est ignorée). */
  updateExisting: z.boolean().default(true),
  /** Vendeur des lignes sans colonne « vendeur » (identifiant ou e-mail). */
  seller: z.string().trim().max(190).optional(),
  /** Crée les catégories (premier niveau) et marques inconnues au lieu de refuser la ligne. */
  createCategories: z.boolean().default(false),
  createBrands: z.boolean().default(false),
  /** Statut des produits créés sans colonne « statut » (sinon le paramètre du catalogue). */
  defaultStatus: z.enum(productStatuses).optional(),
}).strict();
export type ProductImportOptions = z.infer<typeof productImportOptions>;

export const PRODUCT_COLUMNS: ColumnSpec[] = [
  { key: "reference", label: "Référence", aliases: ["ref", "reference_produit", "product_reference"], description: "Clé de l'import : une référence connue met le produit à jour.", example: "MBM-0001" },
  { key: "titre", label: "Titre", aliases: ["nom", "name", "title", "designation", "libelle"], description: "Nom du produit (3 à 190 caractères).", example: "Mixeur plongeant 800 W", requiredForCreate: true },
  { key: "prix", label: "Prix HT (FCFA)", aliases: ["prix_ht", "price", "prix_xof", "prix_fcfa"], description: "Prix catalogue hors taxes, entier en FCFA.", example: "12500", requiredForCreate: true },
  { key: "categorie", label: "Catégorie principale", aliases: ["categorie_principale", "category", "default_category"], description: "Slug, nom, numéro ou chemin « Parent > Enfant ».", example: "Maison > Cuisine", requiredForCreate: true },
  { key: "categories_supplementaires", label: "Autres catégories", aliases: ["categories", "autres_categories", "categories_additionnelles"], description: "Séparées par « | ».", example: "Électroménager|Promotions" },
  { key: "marque", label: "Marque", aliases: ["brand", "fabricant", "manufacturer"], description: "Slug, nom ou numéro.", example: "Kitchen Pro" },
  { key: "vendeur", label: "Vendeur", aliases: ["seller", "email_vendeur"], description: "E-mail ou identifiant du compte vendeur (sinon l'option « vendeur »).", example: "atelier@vendeurs.ci", requiredForCreate: true },
  { key: "quantite", label: "Stock initial", aliases: ["stock", "quantity", "qty"], description: "À la création seulement (mouvement de stock tracé). Ensuite : import du stock.", example: "25" },
  { key: "statut", label: "Statut", aliases: ["status", "etat_publication"], description: "brouillon, en_attente, approuve, publie, refuse, archive.", example: "brouillon" },
  { key: "visibilite", label: "Visibilité", aliases: ["visibility"], description: "partout, catalogue, recherche, nulle_part.", example: "partout" },
  { key: "etat", label: "État", aliases: ["condition"], description: "neuf, occasion, reconditionne.", example: "neuf" },
  { key: "resume", label: "Résumé", aliases: ["description_courte", "short_description", "summary"], description: "320 caractères au plus.", example: "Pied inox, 2 vitesses." },
  { key: "description", label: "Description", aliases: ["description_longue"], description: "Texte de la fiche.", example: "Livré avec un bol gradué." },
  { key: "ean13", label: "EAN-13", aliases: ["ean", "code_barre", "ean_13"], description: "Code-barres à 13 chiffres (clé de contrôle vérifiée).", example: "" },
  { key: "sku", label: "SKU", aliases: [], description: "Unique dans le catalogue.", example: "" },
  { key: "poids_g", label: "Poids (g)", aliases: ["poids", "weight", "poids_grammes"], description: "Entier, en grammes.", example: "1200" },
  { key: "quantite_minimale", label: "Quantité minimale", aliases: ["minimum", "moq", "minimal_quantity"], description: "Minimum de commande.", example: "1" },
  { key: "delai_jours", label: "Délai (jours)", aliases: ["delai", "lead_time", "delai_fabrication"], description: "Délai de préparation, 0 à 365.", example: "35" },
  { key: "prix_achat", label: "Prix d'achat (FCFA)", aliases: ["wholesale_price", "cout"], description: "Coût d'achat, entier en FCFA.", example: "" },
  { key: "etiquettes", label: "Étiquettes", aliases: ["tags", "mots_cles"], description: "Séparées par « | ».", example: "blender|cuisine" },
  { key: "mis_en_avant", label: "Mis en avant", aliases: ["vedette", "featured", "a_la_une"], description: "oui ou non.", example: "non" },
  { key: "meta_titre", label: "Titre SEO", aliases: ["meta_title", "titre_seo"], description: "190 caractères au plus.", example: "" },
  { key: "meta_description", label: "Description SEO", aliases: ["description_seo"], description: "320 caractères au plus.", example: "" },
  { key: "slug", label: "Adresse (slug)", aliases: ["url", "url_simplifiee", "lien_reecrit"], description: "Lettres minuscules, chiffres et tirets.", example: "" },
];

/** Champ du produit → colonne du fichier (pour rattacher une erreur de validation à sa colonne). */
const FIELD_TO_COLUMN: Record<string, string> = {
  reference: "reference", title: "titre", priceXof: "prix", categoryId: "categorie", categoryIds: "categories_supplementaires", brandId: "marque", sellerId: "vendeur",
  initialQuantity: "quantite", status: "statut", visibility: "visibilite", condition: "etat", shortDescription: "resume", description: "description", ean13: "ean13",
  sku: "sku", weightGrams: "poids_g", minimumQuantity: "quantite_minimale", leadTimeDays: "delai_jours", purchasePriceXof: "prix_achat", tags: "etiquettes",
  isFeatured: "mis_en_avant", seoTitle: "meta_titre", seoDescription: "meta_description", slug: "slug",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function issuesToMessages(issues: z.core.$ZodIssue[]): RowMessage[] {
  return issues.map((issue) => {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    return { field: field ? FIELD_TO_COLUMN[field] ?? field : undefined, level: "error", message: issue.message };
  });
}

export const productsEntity: ImportEntity<ProductImportOptions> = {
  code: "products",
  label: "Produits",
  identifyingColumns: ["reference", "titre"],
  columns: PRODUCT_COLUMNS,
  optionsSchema: productImportOptions,
  permissions: { create: "catalog.products.create", update: "catalog.products.update" },

  async planner(database, rows, options, actor) {
    const references = [...new Set(rows.map((row) => row.data.reference?.trim()).filter(Boolean))] as string[];
    const skus = [...new Set(rows.map((row) => row.data.sku?.trim()).filter(Boolean))] as string[];
    const sellerValues = [...new Set([...rows.map((row) => row.data.vendeur?.trim()), options.seller].filter(Boolean))] as string[];
    const sellerIds = sellerValues.filter((value) => UUID.test(value));
    const sellerEmails = sellerValues.filter((value) => value.includes("@")).map((value) => value.toLowerCase());
    const [existing, skuOwners, categoryIndex, brandIndex, sellers] = await Promise.all([
      references.length ? database.select({ id: products.id, reference: products.reference }).from(products).where(and(inArray(products.reference, references), isNull(products.deletedAt))) : [],
      skus.length ? database.select({ id: products.id, sku: products.sku }).from(products).where(inArray(products.sku, skus)) : [],
      loadCategoryIndex(database),
      loadBrandIndex(database),
      sellerIds.length || sellerEmails.length
        ? database.select({ id: users.id, email: users.email, role: users.role }).from(users).where(sql`${users.id} in (${sql.join([...sellerIds, "00000000-0000-0000-0000-000000000000"].map((id) => sql`${id}::uuid`), sql`, `)}) or lower(${users.email}) in (${sql.join([...sellerEmails, ""].map((email) => sql`${email}`), sql`, `)})`)
        : [],
    ]);
    const byReference = new Map(existing.map((row) => [row.reference as string, row.id]));
    const skuOwner = new Map(skuOwners.map((row) => [row.sku as string, row.id]));
    const sellerFor = (value: string) => sellers.find((user) => user.id === value || user.email?.toLowerCase() === value.toLowerCase());
    const seenReferences = new Map<string, number>();
    const seenSkus = new Map<string, number>();
    const canPublish = hasPermission(actor, "catalog.products.publish");

    return (row: ImportRow): RowPlan => {
      const messages: RowMessage[] = [];
      const value = (key: string) => {
        const cell = row.data[key];
        return cell === undefined || cell.trim() === "" ? undefined : cell.trim();
      };
      const reference = value("reference");
      const existingId = reference ? byReference.get(reference) : undefined;
      if (reference) {
        const first = seenReferences.get(reference);
        if (first !== undefined) return { action: "error", messages: [{ field: "reference", level: "error", message: `Référence déjà présente à la ligne ${first} du fichier.` }] };
        seenReferences.set(reference, row.line);
      }
      if (existingId && !options.updateExisting) return { action: "skip", messages: [{ field: "reference", level: "warning", message: "Produit existant : mise à jour désactivée pour cet import." }] };
      const creating = !existingId;

      const input: Record<string, unknown> = {};
      const text = (key: string, field: string) => { const cell = value(key); if (cell !== undefined) input[field] = cell; };
      text("reference", "reference");
      text("titre", "title");
      text("resume", "shortDescription");
      text("description", "description");
      text("ean13", "ean13");
      text("sku", "sku");
      text("meta_titre", "seoTitle");
      text("meta_description", "seoDescription");
      if (value("slug")) input.slug = value("slug")!.toLowerCase();
      const integer = (key: string, field: string, label: string, bounds: { min?: number; max?: number } = { min: 0 }) => {
        const cell = value(key);
        if (cell !== undefined) { const parsed = readCell(messages, key, () => parseInteger(cell, label, bounds)); if (parsed !== undefined) input[field] = parsed; }
      };
      integer("prix", "priceXof", "Prix");
      integer("prix_achat", "purchasePriceXof", "Prix d'achat");
      integer("poids_g", "weightGrams", "Poids");
      integer("quantite_minimale", "minimumQuantity", "Quantité minimale", { min: 1 });
      integer("delai_jours", "leadTimeDays", "Délai", { min: 0, max: 365 });
      const quantity = value("quantite");
      if (quantity !== undefined) {
        if (creating) { const parsed = readCell(messages, "quantite", () => parseInteger(quantity, "Stock initial", { min: 0 })); if (parsed !== undefined) input.initialQuantity = parsed; }
        else messages.push({ field: "quantite", level: "warning", message: "Stock ignoré pour un produit existant : utilisez l'import du stock." });
      }
      const status = value("statut");
      if (status !== undefined) { const parsed = readCell(messages, "statut", () => parseEnum(status, "Statut", PRODUCT_STATUS_LABELS)); if (parsed) input.status = parsed; }
      else if (creating && options.defaultStatus) input.status = options.defaultStatus;
      const visibility = value("visibilite");
      if (visibility !== undefined) { const parsed = readCell(messages, "visibilite", () => parseEnum(visibility, "Visibilité", VISIBILITY_LABELS)); if (parsed) input.visibility = parsed; }
      const condition = value("etat");
      if (condition !== undefined) { const parsed = readCell(messages, "etat", () => parseEnum(condition, "État", CONDITION_LABELS)); if (parsed) input.condition = parsed; }
      const featured = value("mis_en_avant");
      if (featured !== undefined) { const parsed = readCell(messages, "mis_en_avant", () => parseBoolean(featured, "Mis en avant")); if (parsed !== undefined) input.isFeatured = parsed; }
      const tags = value("etiquettes");
      if (tags !== undefined) input.tags = parseList(tags).map((tag) => tag.toLowerCase());

      // Catégorie principale : connue, ou créée au premier niveau si l'option l'autorise.
      let pendingCategory: string | undefined;
      const category = value("categorie");
      if (category !== undefined) {
        const resolved = categoryIndex.resolve(category);
        if ("found" in resolved) input.categoryId = resolved.found.id;
        else if ("error" in resolved) messages.push({ field: "categorie", level: "error", message: resolved.error });
        else if (options.createCategories && !category.includes(">") && !/^\d+$/.test(category)) { pendingCategory = category; messages.push({ field: "categorie", level: "warning", message: `Catégorie « ${category} » créée au premier niveau.` }); }
        else messages.push({ field: "categorie", level: "error", message: `Catégorie « ${category} » introuvable.` });
      }
      const extra = value("categories_supplementaires");
      if (extra !== undefined) {
        const ids: number[] = [];
        for (const entry of parseList(extra)) {
          const resolved = categoryIndex.resolve(entry);
          if ("found" in resolved) ids.push(resolved.found.id);
          else messages.push({ field: "categories_supplementaires", level: "error", message: "error" in resolved ? resolved.error : `Catégorie « ${entry} » introuvable.` });
        }
        input.categoryIds = ids;
      }
      let pendingBrand: string | undefined;
      const brand = value("marque");
      if (brand !== undefined) {
        const resolved = brandIndex.resolve(brand);
        if ("found" in resolved) input.brandId = resolved.found.id;
        else if ("error" in resolved) messages.push({ field: "marque", level: "error", message: resolved.error });
        else if (options.createBrands && !/^\d+$/.test(brand)) { pendingBrand = brand; messages.push({ field: "marque", level: "warning", message: `Marque « ${brand} » créée.` }); }
        else messages.push({ field: "marque", level: "error", message: `Marque « ${brand} » introuvable.` });
      }
      const sellerValue = value("vendeur") ?? (creating ? options.seller : undefined);
      if (sellerValue !== undefined) {
        const seller = sellerFor(sellerValue);
        if (!seller) messages.push({ field: "vendeur", level: "error", message: `Vendeur « ${sellerValue} » introuvable.` });
        else if (seller.role !== "seller") messages.push({ field: "vendeur", level: "error", message: `Le compte « ${sellerValue} » n'est pas un compte vendeur.` });
        else input.sellerId = seller.id;
      }
      const sku = value("sku");
      if (sku) {
        const first = seenSkus.get(sku);
        if (first !== undefined) messages.push({ field: "sku", level: "error", message: `SKU déjà présent à la ligne ${first} du fichier.` });
        else seenSkus.set(sku, row.line);
        const owner = skuOwner.get(sku);
        if (owner && owner !== existingId) messages.push({ field: "sku", level: "error", message: "SKU déjà utilisé par un autre produit." });
      }
      if (typeof input.status === "string" && (PUBLIC_STATUSES as readonly string[]).includes(input.status) && !canPublish) {
        messages.push({ field: "statut", level: "error", message: "Publier un produit demande la permission « Publier les produits »." });
      }

      if (creating) {
        for (const column of PRODUCT_COLUMNS.filter((spec) => spec.requiredForCreate)) {
          const present = column.key === "categorie" ? input.categoryId !== undefined || pendingCategory : column.key === "vendeur" ? sellerValue !== undefined : value(column.key) !== undefined;
          if (!present && !messages.some((message) => message.field === column.key)) messages.push({ field: column.key, level: "error", message: `${column.label} obligatoire pour créer un produit.` });
        }
      }
      if (messages.some((message) => message.level === "error")) return { action: "error", messages };

      // Validation complète par le schéma de l'API (bornes, codes-barres, slug…).
      const candidate = { ...input, ...(pendingCategory ? { categoryId: 1 } : {}), ...(pendingBrand ? { brandId: null } : {}) };
      const parsed = creating ? createProductBody.safeParse(candidate) : updateProductBody.safeParse(candidate);
      if (!parsed.success) return { action: "error", messages: [...messages, ...issuesToMessages(parsed.error.issues)] };
      if (!creating && Object.keys(input).filter((key) => key !== "reference").length === 0) {
        return { action: "skip", messages: [...messages, { level: "warning", message: "Aucune valeur à modifier." }] };
      }
      const data = parsed.data as Record<string, unknown>;

      return {
        action: creating ? "create" : "update",
        messages,
        apply: async (db, context) => {
          const resolved = { ...data };
          if (pendingCategory) resolved.categoryId = await ensureTopCategory(db, pendingCategory, context);
          if (pendingBrand) resolved.brandId = await ensureBrand(db, pendingBrand, context);
          if (creating) {
            const created = await createProduct(db, resolved as Parameters<typeof createProduct>[1], context);
            return { status: "created", entityId: created.id };
          }
          if (!existingId) throw errors.notFound("Produit", reference ?? "");
          const { reference: _unchanged, ...changes } = resolved;
          void _unchanged;
          await updateProduct(db, existingId, changes as Parameters<typeof updateProduct>[2], context);
          return { status: "updated", entityId: existingId };
        },
      };
    };
  },
};
