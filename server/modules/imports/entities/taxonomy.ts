/**
 * Import de catégories et de marques. Clé : le slug s'il est fourni, sinon le nom (sans accents ni
 * casse ; pour une catégorie, sous le même parent). Une catégorie peut avoir pour parent une
 * catégorie créée plus haut dans le même fichier : les lignes sont traitées dans l'ordre.
 */
import { and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { foldText } from "@/lib/search";
import { categories } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { slugSchema } from "@/server/modules/catalog/shared";
import { createBrand, createCategory, updateBrand, updateCategory } from "@/server/modules/catalog/taxonomy/service";
import { createBrandBody, createCategoryBody, updateBrandBody, updateCategoryBody } from "@/server/modules/catalog/taxonomy/validators";
import { parseBoolean, parseInteger, readCell, type ImportRow, type RowMessage } from "@/server/modules/imports/parsers";
import { loadBrandIndex, loadCategoryIndex, type CategoryIndex } from "@/server/modules/imports/resolvers";
import type { ColumnSpec, ImportEntity, RowPlan } from "@/server/modules/imports/types";

export const taxonomyImportOptions = z.object({ updateExisting: z.boolean().default(true) }).strict();
export type TaxonomyImportOptions = z.infer<typeof taxonomyImportOptions>;

const commonColumns = (kind: "catégorie" | "marque"): ColumnSpec[] => [
  { key: "nom", label: "Nom", aliases: ["name", "titre", "libelle"], description: `Nom de la ${kind}.`, example: kind === "catégorie" ? "Cuisine" : "Kitchen Pro", requiredForCreate: true },
  { key: "slug", label: "Adresse (slug)", aliases: ["url", "url_simplifiee", "lien_reecrit"], description: "Clé de l'import si fournie : lettres minuscules, chiffres et tirets.", example: kind === "catégorie" ? "cuisine" : "kitchen-pro" },
  { key: "description", label: "Description", aliases: [], description: "Texte de présentation.", example: "" },
  { key: "actif", label: "Active", aliases: ["active", "active_oui_non", "is_active"], description: "oui ou non.", example: "oui" },
  { key: "meta_titre", label: "Titre SEO", aliases: ["meta_title", "titre_seo"], description: "190 caractères au plus.", example: "" },
  { key: "meta_description", label: "Description SEO", aliases: ["description_seo"], description: "320 caractères au plus.", example: "" },
];

export const CATEGORY_COLUMNS: ColumnSpec[] = [
  ...commonColumns("catégorie"),
  { key: "parent", label: "Catégorie parente", aliases: ["categorie_parente", "parent_category"], description: "Slug, nom, numéro ou chemin ; vide : premier niveau.", example: "Maison" },
  { key: "position", label: "Position", aliases: ["ordre", "sort_order"], description: "Ordre d'affichage parmi les catégories sœurs.", example: "" },
  { key: "image", label: "Image", aliases: ["image_url"], description: "Chemin interne ou URL https.", example: "" },
];

export const BRAND_COLUMNS: ColumnSpec[] = [
  ...commonColumns("marque"),
  { key: "logo", label: "Logo", aliases: ["logo_url"], description: "Chemin interne ou URL https.", example: "" },
];

const FIELD_TO_COLUMN: Record<string, string> = { name: "nom", slug: "slug", description: "description", isActive: "actif", metaTitle: "meta_titre", metaDescription: "meta_description", parentId: "parent", sortOrder: "position", imageUrl: "image", logoUrl: "logo" };

function issuesToMessages(issues: z.core.$ZodIssue[]): RowMessage[] {
  return issues.map((issue) => {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    return { field: field ? FIELD_TO_COLUMN[field] ?? field : undefined, level: "error", message: issue.message };
  });
}

/** Lecture des colonnes communes ; `undefined` : cellule vide (rien à modifier). */
function readCommon(row: ImportRow, messages: RowMessage[]) {
  const value = (key: string) => { const cell = row.data[key]; return cell === undefined || cell.trim() === "" ? undefined : cell.trim(); };
  const input: Record<string, unknown> = {};
  if (value("nom")) input.name = value("nom");
  if (value("slug")) input.slug = value("slug")!.toLowerCase();
  if (value("description")) input.description = value("description");
  if (value("meta_titre")) input.metaTitle = value("meta_titre");
  if (value("meta_description")) input.metaDescription = value("meta_description");
  const active = value("actif");
  if (active !== undefined) { const parsed = readCell(messages, "actif", () => parseBoolean(active, "Active")); if (parsed !== undefined) input.isActive = parsed; }
  if (input.slug !== undefined && !slugSchema.safeParse(input.slug).success) messages.push({ field: "slug", level: "error", message: "Slug : lettres minuscules, chiffres et tirets." });
  return { input, value };
}

/** Parent d'une catégorie : en base, ou créé plus haut dans le fichier (résolu à l'écriture). */
type ParentRef = { id: number } | { pending: string } | null;

const lastSegment = (value: string) => value.split(">").map((segment) => segment.trim()).filter(Boolean).pop() ?? value;

/** Parent créé plus haut dans le fichier : relu en base au moment d'écrire (slug, nom ou chemin). */
async function resolveParentNow(database: Db, pending: string): Promise<number | null> {
  if (pending.includes(">")) {
    const resolved = (await loadCategoryIndex(database)).resolve(pending);
    return "found" in resolved ? resolved.found.id : null;
  }
  const [row] = await database.select({ id: categories.id }).from(categories)
    .where(and(isNull(categories.deletedAt), sql`(${categories.slug} = ${pending.toLowerCase()} or public.mbm_unaccent(lower(${categories.name})) = ${foldText(pending)})`)).limit(1);
  return row?.id ?? null;
}

export const categoriesEntity: ImportEntity<TaxonomyImportOptions> = {
  code: "categories",
  label: "Catégories",
  identifyingColumns: ["nom", "slug"],
  columns: CATEGORY_COLUMNS,
  optionsSchema: taxonomyImportOptions,
  permissions: { create: "catalog.categories.create", update: "catalog.categories.update" },

  async planner(database, _rows, options) {
    const index: CategoryIndex = await loadCategoryIndex(database);
    const plannedSlugs = new Map<string, number>();
    const plannedNames = new Map<string, number>();

    return (row: ImportRow): RowPlan => {
      const messages: RowMessage[] = [];
      const { input, value } = readCommon(row, messages);
      const position = value("position");
      if (position !== undefined) { const parsed = readCell(messages, "position", () => parseInteger(position, "Position", { min: 0 })); if (parsed !== undefined) input.sortOrder = parsed; }
      if (value("image")) input.imageUrl = value("image");

      let parent: ParentRef | undefined;
      const parentValue = value("parent");
      if (parentValue !== undefined) {
        const resolved = index.resolve(parentValue);
        if ("found" in resolved) parent = { id: resolved.found.id };
        else if ("error" in resolved) messages.push({ field: "parent", level: "error", message: resolved.error });
        else if (plannedSlugs.has(parentValue.toLowerCase()) || plannedNames.has(foldText(lastSegment(parentValue)))) parent = { pending: parentValue };
        else messages.push({ field: "parent", level: "error", message: `Catégorie parente « ${parentValue} » introuvable (ni en base, ni plus haut dans le fichier).` });
      }

      // Catégorie existante : par slug, sinon par nom sous le même parent.
      const slug = input.slug as string | undefined;
      const name = input.name as string | undefined;
      let existing = slug ? index.bySlug.get(slug) : undefined;
      if (!existing && name && !slug) {
        const parentId = parent && "id" in parent ? parent.id : parent === undefined ? null : undefined;
        if (parentId !== undefined) existing = index.named(name).find((candidate) => candidate.parentId === parentId);
      }
      const key = slug ?? (name ? foldText(name) : "");
      const duplicate = slug ? plannedSlugs.get(slug) : name ? plannedNames.get(foldText(name)) : undefined;
      if (duplicate !== undefined && !existing) messages.push({ field: slug ? "slug" : "nom", level: "error", message: `Catégorie déjà présente à la ligne ${duplicate} du fichier.` });
      if (!existing && !name) messages.push({ field: "nom", level: "error", message: "Nom obligatoire pour créer une catégorie." });
      if (existing && !options.updateExisting) return { action: "skip", messages: [{ level: "warning", message: "Catégorie existante : mise à jour désactivée pour cet import." }] };
      if (existing && parent && "id" in parent && parent.id === existing.id) messages.push({ field: "parent", level: "error", message: "Une catégorie ne peut pas être son propre parent." });
      if (messages.some((message) => message.level === "error")) return { action: "error", messages };
      if (key) {
        if (slug) plannedSlugs.set(slug, row.line);
        if (name) plannedNames.set(foldText(name), row.line);
      }

      const candidate = { ...input, ...(parent && "id" in parent ? { parentId: parent.id } : {}) };
      const parsed = existing ? updateCategoryBody.safeParse(candidate) : createCategoryBody.safeParse(candidate);
      if (!parsed.success) {
        if (existing && !parent && Object.keys(input).filter((field) => field !== "slug").length === 0) return { action: "skip", messages: [{ level: "warning", message: "Aucune valeur à modifier." }] };
        return { action: "error", messages: [...messages, ...issuesToMessages(parsed.error.issues)] };
      }
      const data = parsed.data as Record<string, unknown>;
      const target = existing;
      return {
        action: target ? "update" : "create",
        messages,
        apply: async (db, context) => {
          const values = { ...data };
          if (parent && "pending" in parent) {
            const parentId = await resolveParentNow(db, parent.pending);
            if (parentId === null) throw new Error(`Catégorie parente « ${parent.pending} » introuvable.`);
            values.parentId = parentId;
          }
          if (target) {
            await updateCategory(db, target.id, values, context);
            return { status: "updated", entityId: String(target.id) };
          }
          const created = await createCategory(db, values as Parameters<typeof createCategory>[1], context);
          return { status: "created", entityId: String(created.id) };
        },
      };
    };
  },
};

export const brandsEntity: ImportEntity<TaxonomyImportOptions> = {
  code: "brands",
  label: "Marques",
  identifyingColumns: ["nom", "slug"],
  columns: BRAND_COLUMNS,
  optionsSchema: taxonomyImportOptions,
  permissions: { create: "catalog.brands.create", update: "catalog.brands.update" },

  async planner(database, _rows, options) {
    const index = await loadBrandIndex(database);
    const planned = new Map<string, number>();

    return (row: ImportRow): RowPlan => {
      const messages: RowMessage[] = [];
      const { input, value } = readCommon(row, messages);
      if (value("logo")) input.logoUrl = value("logo");
      const slug = input.slug as string | undefined;
      const name = input.name as string | undefined;
      const lookup = slug ?? name;
      const resolved = lookup ? index.resolve(lookup) : { missing: true as const };
      if ("error" in resolved) messages.push({ field: slug ? "slug" : "nom", level: "error", message: resolved.error });
      const existing = "found" in resolved ? resolved.found : undefined;
      const key = slug ?? (name ? foldText(name) : "");
      const duplicate = key ? planned.get(key) : undefined;
      if (duplicate !== undefined) messages.push({ field: slug ? "slug" : "nom", level: "error", message: `Marque déjà présente à la ligne ${duplicate} du fichier.` });
      if (!existing && !name) messages.push({ field: "nom", level: "error", message: "Nom obligatoire pour créer une marque." });
      if (existing && !options.updateExisting) return { action: "skip", messages: [{ level: "warning", message: "Marque existante : mise à jour désactivée pour cet import." }] };
      if (messages.some((message) => message.level === "error")) return { action: "error", messages };
      if (key) planned.set(key, row.line);
      const parsed = existing ? updateBrandBody.safeParse(input) : createBrandBody.safeParse(input);
      if (!parsed.success) {
        if (existing && Object.keys(input).filter((field) => field !== "slug").length === 0) return { action: "skip", messages: [{ level: "warning", message: "Aucune valeur à modifier." }] };
        return { action: "error", messages: [...messages, ...issuesToMessages(parsed.error.issues)] };
      }
      const data = parsed.data as Record<string, unknown>;
      return {
        action: existing ? "update" : "create",
        messages,
        apply: async (db, context) => {
          if (existing) {
            await updateBrand(db, existing.id, data, context);
            return { status: "updated", entityId: String(existing.id) };
          }
          const created = await createBrand(db, data as Parameters<typeof createBrand>[1], context);
          return { status: "created", entityId: String(created.id) };
        },
      };
    };
  },
};
