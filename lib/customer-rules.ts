/**
 * Clients, groupes, adresses et paniers — module 5.
 *
 * Module pur, sans dépendance base : testable en unitaire, utilisé à
 * l'identique par le storefront (panier, adresses) et par le back office.
 *
 * Règles verrouillées ici (ne pas régresser) :
 *  - une quantité de ligne est TOUJOURS ramenée à un multiple du pas de
 *    commande, jamais sous le minimum du produit et jamais au-dessus du plafond ;
 *  - la remise de groupe n'est ni cumulable avec elle-même ni appliquée à un
 *    groupe inactif ; elle s'exprime en points de base pour éviter les flottants ;
 *  - un panier invité fusionné additionne les quantités du MÊME article, sans
 *    jamais dépasser le plafond, et écarte les articles devenus invendables ;
 *  - une adresse par défaut est unique par client et par usage (livraison /
 *    facturation) : poser une nouvelle valeur retire l'ancienne ;
 *  - un client ne peut être anonymisé que s'il n'a plus de commande ouverte ;
 *  - une adresse de livraison doit être exploitable : pays à deux lettres,
 *    téléphone joignable, rue et ville renseignées.
 */

export type AddressInput = {
  label?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
};

export type AddressIssue = { field: string; message: string };

export type AddressValidation =
  | { valid: true; value: NormalizedAddress }
  | { valid: false; issues: AddressIssue[] };

export type NormalizedAddress = {
  label: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
};

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

/** Chiffres uniquement, pour comparer deux numéros écrits différemment. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits.replace(/\+/g, "");
}

/**
 * Longueur plausible d'un numéro joignable : au moins 8 chiffres et au plus 15
 * (norme E.164), en ignorant l'indicatif. Un numéro trop court ne permet pas
 * de joindre le client pour une livraison.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  const digits = normalizePhone(raw).replace(/^\+/, "");
  return digits.length >= 8 && digits.length <= 15 && /^\d+$/.test(digits);
}

/** E-mail : normalisation en minuscules et validation volontairement stricte. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function isValidEmail(raw: string | null | undefined): boolean {
  const email = normalizeEmail(raw);
  if (email.length > 190 || email.length < 6) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email);
}

/** Masque l'e-mail pour les écrans de service client : garde le domaine. */
export function maskEmail(raw: string | null | undefined): string {
  const email = normalizeEmail(raw);
  const at = email.indexOf("@");
  if (at < 1) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(2, local.length - head.length))}${domain}`;
}

/** Validation complète d'une adresse, avec la liste des champs fautifs. */
export function validateAddress(input: AddressInput): AddressValidation {
  const issues: AddressIssue[] = [];
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  const phone = normalizePhone(input.phone);
  const line1 = clean(input.line1);
  const city = clean(input.city);
  const countryCode = clean(input.countryCode).toUpperCase();

  if (firstName.length < 1 || firstName.length > 100) issues.push({ field: "firstName", message: "Prénom obligatoire (100 caractères maximum)." });
  if (lastName.length < 1 || lastName.length > 100) issues.push({ field: "lastName", message: "Nom obligatoire (100 caractères maximum)." });
  if (!isValidPhone(phone)) issues.push({ field: "phone", message: "Numéro de téléphone invalide : 8 à 15 chiffres attendus." });
  if (line1.length < 4 || line1.length > 190) issues.push({ field: "line1", message: "Adresse obligatoire (4 à 190 caractères)." });
  if (city.length < 2 || city.length > 120) issues.push({ field: "city", message: "Ville obligatoire (2 à 120 caractères)." });
  if (!/^[A-Z]{2}$/.test(countryCode)) issues.push({ field: "countryCode", message: "Code pays sur deux lettres (ex. CI)." });
  const postalCode = clean(input.postalCode);
  if (postalCode && !/^[A-Za-z0-9 -]{2,24}$/.test(postalCode)) issues.push({ field: "postalCode", message: "Code postal invalide." });

  if (issues.length) return { valid: false, issues };
  return {
    valid: true,
    value: {
      label: clean(input.label) || "Adresse",
      firstName,
      lastName,
      companyName: clean(input.companyName) || null,
      phone,
      line1,
      line2: clean(input.line2) || null,
      city,
      region: clean(input.region) || null,
      postalCode: postalCode || null,
      countryCode,
      isDefaultShipping: input.isDefaultShipping === true,
      isDefaultBilling: input.isDefaultBilling === true,
    },
  };
}

/**
 * Identité d'une adresse : deux adresses identiques pour un même client sont
 * un doublon, même si les majuscules ou les espaces diffèrent.
 */
export function addressSignature(input: AddressInput): string {
  return [
    clean(input.firstName).toLowerCase(),
    clean(input.lastName).toLowerCase(),
    clean(input.line1).toLowerCase(),
    clean(input.line2).toLowerCase(),
    clean(input.city).toLowerCase(),
    clean(input.countryCode).toUpperCase(),
    normalizePhone(input.phone),
  ].join("|");
}

/** Un client professionnel déclare une raison sociale et un numéro fiscal. */
export function customerSegment(customer: { companyName?: string | null; taxNumber?: string | null }): "business" | "individual" {
  return clean(customer.companyName) && clean(customer.taxNumber) ? "business" : "individual";
}

/**
 * Remise de groupe en points de base (100 = 1 %). Bornée à 100 %, jamais
 * négative, et nulle si le groupe est inactif.
 */
export function groupDiscountBasisPoints(group: { discountBasisPoints?: number | null; isActive?: boolean } | null | undefined): number {
  if (!group || group.isActive === false) return 0;
  const raw = Number(group.discountBasisPoints ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(10_000, Math.max(0, Math.round(raw)));
}

/** Applique une remise en points de base à un prix unitaire HT. */
export function applyDiscountBasisPoints(priceXof: number, basisPoints: number): number {
  const price = Math.max(0, Math.round(priceXof));
  const points = Math.min(10_000, Math.max(0, Math.round(basisPoints)));
  return Math.round((price * (10_000 - points)) / 10_000);
}

/** Deux groupes ne se cumulent pas : seule la remise la plus forte s'applique. */
export function bestGroupDiscount(groups: Array<{ discountBasisPoints?: number | null; isActive?: boolean }>): number {
  return groups.reduce((best, group) => Math.max(best, groupDiscountBasisPoints(group)), 0);
}

export const MAX_LINE_QUANTITY = 10_000;

export type QuantityResult =
  | { ok: true; quantity: number; adjusted: boolean }
  | { ok: false; reason: "below_minimum" | "above_maximum" | "not_sellable"; quantity: number };

/**
 * Ramène une quantité demandée à une quantité commandable.
 * Le pas de commande arrondit vers le HAUT (on ne facture jamais moins que
 * demandé), puis le minimum et le plafond bornent le résultat.
 */
export function normalizeQuantity(
  requested: number,
  options: { minimumQuantity?: number | null; quantityStep?: number | null; available?: number | null; maxLineQuantity?: number } = {},
): QuantityResult {
  const max = Math.max(1, Math.trunc(options.maxLineQuantity ?? MAX_LINE_QUANTITY));
  const minimum = Math.max(1, Math.trunc(Number(options.minimumQuantity ?? 1) || 1));
  const step = Math.max(1, Math.trunc(Number(options.quantityStep ?? 1) || 1));
  const requestedInt = Number.isFinite(requested) ? Math.trunc(requested) : 0;

  if (options.available !== undefined && options.available !== null && options.available <= 0) {
    return { ok: false, reason: "not_sellable", quantity: 0 };
  }
  if (requestedInt < 1) return { ok: false, reason: "below_minimum", quantity: minimum };
  if (requestedInt > max) return { ok: false, reason: "above_maximum", quantity: max };

  let quantity = Math.ceil(requestedInt / step) * step;
  if (quantity < minimum) quantity = minimum;
  // Le minimum doit lui-même rester un multiple du pas : sinon on ne pourrait
  // jamais commander le minimum annoncé.
  if (quantity % step !== 0) quantity = Math.ceil(quantity / step) * step;
  if (quantity > max) return { ok: false, reason: "above_maximum", quantity: max };
  if (options.available !== undefined && options.available !== null && quantity > options.available) {
    return { ok: false, reason: "above_maximum", quantity: Math.max(0, Math.floor(options.available / step) * step) };
  }
  return { ok: true, quantity, adjusted: quantity !== requestedInt };
}

export type CartLineInput = {
  productId: string;
  variantId?: number | null;
  quantity: number;
  /** Prix unitaire HT courant, pour le récapitulatif. */
  unitPriceXof: number;
  minimumQuantity?: number | null;
  quantityStep?: number | null;
  available?: number | null;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
};

export type CartSummary = {
  lineCount: number;
  itemCount: number;
  subtotalXof: number;
  weightGrams: number;
  volumeCm3: number;
  issues: Array<{ productId: string; reason: string }>;
};

/** Récapitulatif du panier : montants HT, poids et volume, lignes en défaut. */
export function summarizeCart(lines: CartLineInput[]): CartSummary {
  let subtotalXof = 0;
  let itemCount = 0;
  let weightGrams = 0;
  let volumeCm3 = 0;
  const issues: Array<{ productId: string; reason: string }> = [];

  for (const line of lines) {
    const result = normalizeQuantity(line.quantity, {
      minimumQuantity: line.minimumQuantity,
      quantityStep: line.quantityStep,
      available: line.available,
    });
    if (!result.ok) {
      issues.push({ productId: line.productId, reason: result.reason });
      continue;
    }
    const quantity = result.quantity;
    itemCount += quantity;
    subtotalXof += Math.round(line.unitPriceXof) * quantity;
    weightGrams += Math.max(0, Math.trunc(line.weightGrams ?? 0)) * quantity;
    volumeCm3 += Math.max(0, line.lengthCm ?? 0) * Math.max(0, line.widthCm ?? 0) * Math.max(0, line.heightCm ?? 0) * quantity;
  }

  return {
    lineCount: lines.length - issues.length,
    itemCount,
    subtotalXof,
    weightGrams,
    volumeCm3,
    issues,
  };
}

export type MergeableLine = {
  productId: string;
  variantId?: number | null;
  quantity: number;
  available?: number | null;
  minimumQuantity?: number | null;
  quantityStep?: number | null;
};

/**
 * Fusionne un panier invité dans le panier du compte, à la connexion.
 * Même article + même combinaison = quantités additionnées (bornées), les
 * articles invendables sont écartés, l'ordre de sortie reste stable.
 */
export function mergeCarts(existing: MergeableLine[], incoming: MergeableLine[]): { lines: MergeableLine[]; merged: number; dropped: number; capped: number } {
  const key = (line: MergeableLine) => `${line.productId}::${line.variantId ?? "none"}`;
  const byKey = new Map<string, MergeableLine>();
  for (const line of existing) {
    const normalized = normalizeQuantity(line.quantity, { minimumQuantity: line.minimumQuantity, quantityStep: line.quantityStep, available: line.available });
    if (!normalized.ok) continue;
    byKey.set(key(line), { ...line, quantity: Math.min(MAX_LINE_QUANTITY, normalized.quantity) });
  }

  let merged = 0;
  let dropped = 0;
  let capped = 0;
  for (const line of incoming) {
    const normalized = normalizeQuantity(line.quantity, { minimumQuantity: line.minimumQuantity, quantityStep: line.quantityStep, available: line.available });
    if (!normalized.ok) {
      dropped += 1;
      continue;
    }
    const identifier = key(line);
    const current = byKey.get(identifier);
    if (!current) {
      byKey.set(identifier, { ...line, quantity: normalized.quantity });
      merged += 1;
      continue;
    }
    const combined = current.quantity + normalized.quantity;
    const limit = Math.min(MAX_LINE_QUANTITY, line.available ?? MAX_LINE_QUANTITY);
    if (combined > limit) {
      byKey.set(identifier, { ...current, quantity: limit });
      capped += 1;
    } else {
      byKey.set(identifier, { ...current, quantity: combined });
    }
    merged += 1;
  }

  return { lines: [...byKey.values()], merged, dropped, capped };
}

/** Un panier est abandonné après inactivité, mais jamais s'il a été converti. */
export function isCartAbandoned(
  cart: { status: string; updatedAt: Date; convertedOrderId?: string | null },
  now: Date,
  thresholdHours = 24,
): boolean {
  if (cart.convertedOrderId) return false;
  if (cart.status !== "active") return false;
  const elapsedMs = now.getTime() - new Date(cart.updatedAt).getTime();
  return elapsedMs >= thresholdHours * 3_600_000;
}

export type OpenOrderSummary = { status: string };

const CLOSED_ORDER_STATUSES = new Set(["delivered", "cancelled", "refunded", "closed"]);

/**
 * Droit à l'effacement : on anonymise, on ne supprime pas, et seulement quand
 * plus aucune commande n'est en cours (obligation comptable de conservation).
 */
export function canAnonymizeCustomer(orders: OpenOrderSummary[]): { allowed: boolean; openOrders: number } {
  const openOrders = orders.filter((order) => !CLOSED_ORDER_STATUSES.has(order.status)).length;
  return { allowed: openOrders === 0, openOrders };
}

/** Remplace les données personnelles par une identité technique stable. */
export function anonymizedIdentity(customerId: string): { name: string; email: string; phone: string } {
  const token = customerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "client";
  return { name: `Client anonymisé ${token}`, email: `${token}@anonymise.invalid`, phone: "" };
}

/** Numéro fiscal : format libre mais borné, jamais vide si fourni. */
export function isValidTaxNumber(raw: string | null | undefined): boolean {
  const value = clean(raw);
  if (!value) return false;
  return /^[A-Za-z0-9][A-Za-z0-9 .\-/]{3,79}$/.test(value);
}
