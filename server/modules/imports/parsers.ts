/**
 * Lecture des cellules d'un import CSV (formats saisis dans un tableur français) :
 * montants « 12 500 », booléens « oui/non », listes « a | b », libellés français des énumérations.
 */
import { foldText } from "@/lib/search";

export type RowMessage = { field?: string; message: string; level: "error" | "warning" };
export type ImportRow = { line: number; data: Record<string, string> };

export class CellError extends Error {}

/** Entier positif : espaces (y compris insécables) et « ,00 » acceptés ; « 12.500 » lu comme 12 500. */
export function parseInteger(value: string, label: string, options: { min?: number; max?: number } = {}): number {
  const compact = value.replace(/[\s  ]/g, "").replace(/(fcfa|xof|cfa|f)$/i, "");
  let number: number;
  if (/^-?\d+([.,]0+)?$/.test(compact)) number = Number.parseInt(compact, 10);
  else if (/^\d{1,3}(\.\d{3})+$/.test(compact)) number = Number.parseInt(compact.replace(/\./g, ""), 10);
  else throw new CellError(`${label} : nombre entier attendu (reçu « ${value.slice(0, 40)} »).`);
  if (options.min !== undefined && number < options.min) throw new CellError(`${label} : ${options.min} au minimum.`);
  if (options.max !== undefined && number > options.max) throw new CellError(`${label} : ${options.max} au maximum.`);
  return number;
}

const TRUE_VALUES = new Set(["1", "oui", "o", "vrai", "true", "yes", "y", "x"]);
const FALSE_VALUES = new Set(["0", "non", "n", "faux", "false", "no"]);

export function parseBoolean(value: string, label: string): boolean {
  const folded = foldText(value);
  if (TRUE_VALUES.has(folded)) return true;
  if (FALSE_VALUES.has(folded)) return false;
  throw new CellError(`${label} : « oui » ou « non » attendu.`);
}

/** Liste : « | » de préférence, sinon « , ». */
export function parseList(value: string): string[] {
  const separator = value.includes("|") ? "|" : ",";
  return [...new Set(value.split(separator).map((part) => part.trim()).filter(Boolean))];
}

/** Libellé (français ou code) → valeur de l'énumération. */
export function parseEnum<T extends string>(value: string, label: string, mapping: Record<string, T>): T {
  const key = foldText(value).replace(/[\s-]+/g, "_");
  const found = mapping[key];
  if (!found) throw new CellError(`${label} : valeur inconnue « ${value.slice(0, 40)} » (${[...new Set(Object.values(mapping))].join(", ")}).`);
  return found;
}

export const PRODUCT_STATUS_LABELS: Record<string, "draft" | "pending_review" | "approved" | "published" | "rejected" | "archived"> = {
  draft: "draft", brouillon: "draft",
  pending_review: "pending_review", en_attente: "pending_review", a_valider: "pending_review",
  approved: "approved", approuve: "approved", valide: "approved",
  published: "published", publie: "published", en_ligne: "published", actif: "published",
  rejected: "rejected", refuse: "rejected",
  archived: "archived", archive: "archived", inactif: "archived",
};
export const VISIBILITY_LABELS: Record<string, "everywhere" | "catalog" | "search" | "nowhere"> = {
  everywhere: "everywhere", partout: "everywhere", catalog: "catalog", catalogue: "catalog", search: "search", recherche: "search", nowhere: "nowhere", nulle_part: "nowhere", aucune: "nowhere",
};
export const CONDITION_LABELS: Record<string, "new" | "used" | "refurbished"> = {
  new: "new", neuf: "new", used: "used", occasion: "used", refurbished: "refurbished", reconditionne: "refurbished",
};

/** Exécute une lecture de cellule ; l'erreur devient un message de ligne. */
export function readCell<T>(messages: RowMessage[], field: string, read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    messages.push({ field, level: "error", message: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}
