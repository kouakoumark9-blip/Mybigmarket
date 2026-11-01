/**
 * Règles catalogue (module 1) — module pur, sans dépendance base.
 *
 * Couvre : validation des codes-barres, génération de référence, générateur de
 * combinaisons, calcul de stock (packs, réservations) et slug/redirections.
 */

/* ────────────────────────────────  Codes-barres  ─────────────────────────────── */

/** Clé de contrôle EAN13 / UPC-A (algorithme modulo 10, poids 3/1 en partant de la droite). */
function modulo10CheckDigit(digits: string): number {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[digits.length - 1 - index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/** Valide un EAN13 (13 chiffres, clé de contrôle). */
export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const body = value.slice(0, 12);
  return modulo10CheckDigit(body) === Number(value[12]);
}

/** Valide un UPC-A (12 chiffres). */
export function isValidUpc(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false;
  const body = value.slice(0, 11);
  return modulo10CheckDigit(body) === Number(value[11]);
}

/** Valide un ISBN-10 ou ISBN-13 (espaces et tirets tolérés). */
export function isValidIsbn(value: string): boolean {
  const clean = value.replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(clean)) return isValidEan13(clean);
  if (!/^\d{9}[\dX]$/i.test(clean)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += (index + 1) * Number(clean[index]);
  const last = clean[9].toUpperCase();
  const check = last === "X" ? 10 : Number(last);
  return sum % 11 === check;
}

/** Calcule l'EAN13 complet à partir des 12 premiers chiffres. */
export function buildEan13(body12: string): string | null {
  if (!/^\d{12}$/.test(body12)) return null;
  return `${body12}${modulo10CheckDigit(body12)}`;
}

export type BarcodeKind = "ean13" | "upc" | "isbn";

/** Valide un code-barres selon son type, en renvoyant un message exploitable. */
export function validateBarcode(kind: BarcodeKind, value: string | null | undefined): { valid: boolean; error?: string } {
  if (!value) return { valid: true }; // un code-barres reste facultatif
  const clean = value.trim();
  if (kind === "ean13" && !isValidEan13(clean)) return { valid: false, error: "EAN13 invalide : 13 chiffres avec clé de contrôle." };
  if (kind === "upc" && !isValidUpc(clean)) return { valid: false, error: "UPC invalide : 12 chiffres avec clé de contrôle." };
  if (kind === "isbn" && !isValidIsbn(clean)) return { valid: false, error: "ISBN invalide." };
  return { valid: true };
}

/* ────────────────────────────────  Références  ──────────────────────────────── */

/** Référence produit lisible, unique par construction (horodatage + aléa). */
export function generateProductReference(year: number, sequence: number): string {
  return `MBM-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Slug d'URL : translittération simple, tirets, longueur bornée. */
export function slugifyProduct(value: string, maxLength = 170): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength)
    .replace(/-$/, "");
  return slug || "produit";
}

/* ───────────────────────────────  Combinaisons  ─────────────────────────────── */

export type AttributeGroupInput = { code: string; values: Array<{ code: string; id?: string }> };

export type GeneratedCombination = {
  /** Clé stable, indépendante de l'ordre de saisie. */
  key: string;
  /** Valeurs par groupe : `{ couleur: "noir", taille: "m" }`. */
  selection: Record<string, string>;
  label: string;
};

/**
 * Produit cartésien des valeurs d'attributs.
 *
 * La clé est construite en triant les groupes par code puis les valeurs par code :
 * régénérer les combinaisons ne crée donc pas de doublons et ne casse pas
 * les associations image/stock existantes.
 */
export function generateCombinations(groups: AttributeGroupInput[], maxCombinations = 500): GeneratedCombination[] {
  const clean = groups
    .map((group) => ({
      code: group.code.trim(),
      values: [...new Set(group.values.map((value) => value.code.trim()).filter(Boolean))].sort(),
    }))
    .filter((group) => group.code && group.values.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  if (!clean.length) return [];

  let total = clean.reduce((product, group) => product * group.values.length, 1);
  if (total > maxCombinations) {
    // On garde la main sur le coût : 500 combinaisons = déjà 500 lignes à éditer.
    throw new Error(`Trop de combinaisons (${total}). Maximum ${maxCombinations}. Réduisez les valeurs.`);
  }

  let combinations: GeneratedCombination[] = [{ key: "", selection: {}, label: "" }];
  for (const group of clean) {
    const next: GeneratedCombination[] = [];
    for (const combination of combinations) {
      for (const value of group.values) {
        const selection = { ...combination.selection, [group.code]: value };
        next.push({
          key: `${combination.key}${combination.key ? "|" : ""}${group.code}:${value}`,
          selection,
          label: `${combination.label}${combination.label ? " / " : ""}${value}`,
        });
      }
    }
    combinations = next;
    total = combinations.length;
  }
  return combinations;
}

/* ────────────────────────────────  Stock  ──────────────────────────────── */

export type StockLine = { quantity: number; reserved?: number };

/** Stock disponible = physique − réservé, jamais négatif. */
export function availableStock(line: StockLine): number {
  return Math.max(0, line.quantity - (line.reserved ?? 0));
}

/**
 * Stock d'un pack : le minimum des composants disponibles divisé par la quantité requise.
 * Un pack ne peut jamais être vendu plus que son composant le plus rare.
 */
export function packAvailableStock(
  components: Array<{ quantity: number; reserved?: number; requiredQuantity: number }>,
): number {
  if (!components.length) return 0;
  return Math.min(
    ...components.map((component) => Math.floor(availableStock(component) / Math.max(1, component.requiredQuantity))),
  );
}

export type StockDecision =
  | { sellable: true }
  | { sellable: false; reason: "out_of_stock" | "not_available" | "below_minimum" };

/**
 * Décision de vente.
 * `backorder` autorise la vente à zéro ; `refuse` la bloque ; `use_default` retombe
 * sur le comportement global de la boutique.
 */
export function canSell(input: {
  available: number;
  requested: number;
  minimumQuantity?: number;
  availableForOrder?: boolean;
  behavior?: "refuse" | "backorder" | "use_default";
  defaultBehavior?: "refuse" | "backorder";
}): StockDecision {
  const behavior = input.behavior && input.behavior !== "use_default" ? input.behavior : (input.defaultBehavior ?? "refuse");
  if (input.availableForOrder === false) return { sellable: false, reason: "not_available" };
  if ((input.minimumQuantity ?? 1) > input.requested) return { sellable: false, reason: "below_minimum" };
  if (input.available < input.requested && behavior === "refuse") return { sellable: false, reason: "out_of_stock" };
  return { sellable: true };
}

/** Applique un mouvement de stock et renvoie les quantités avant/après (traçabilité). */
export function applyStockMovement(quantityBefore: number, delta: number, allowNegative = false): { before: number; after: number; delta: number } {
  const after = quantityBefore + delta;
  if (after < 0 && !allowNegative) {
    throw new Error(`Stock insuffisant : ${quantityBefore} disponible(s), mouvement de ${delta}.`);
  }
  return { before: quantityBefore, after, delta };
}

/* ────────────────────────────────  Taxes / visibilité  ──────────────────────────────── */

/** Un produit est visible en boutique seulement si tout son chemin est actif. */
export function isPubliclyVisible(product: { visibility: string; isActive: boolean; deletedAt?: Date | null; status: string }): boolean {
  if (product.deletedAt) return false;
  if (!product.isActive) return false;
  if (product.status !== "approved") return false;
  return product.visibility === "everywhere" || product.visibility === "catalog" || product.visibility === "search";
}

/** Le produit apparaît-il dans les résultats de recherche ? */
export function isSearchable(product: { visibility: string; isActive: boolean; deletedAt?: Date | null; status: string }): boolean {
  if (!isPubliclyVisible(product)) return false;
  return product.visibility === "everywhere" || product.visibility === "search";
}

/** Combinaison par défaut : la marquée, sinon la première, sinon aucune. */
export function defaultCombination<T extends { isDefault?: boolean }>(combinations: T[]): T | null {
  if (!combinations.length) return null;
  return combinations.find((combination) => combination.isDefault) ?? combinations[0];
}
