/**
 * Bons de réduction (module 2) — règles pures, sans base de données.
 *
 * Un bon est valable si : il est actif, dans sa période, sous ses limites d'utilisation (globale
 * et par client), réservé au bon client ou au bon groupe le cas échéant, et si le panier atteint
 * le minimum sur les produits éligibles. La remise porte sur les lignes éligibles (restriction
 * produits / catégories, exclusion des produits déjà remisés), plafonnée par `maximumDiscountXof`.
 *
 * Cumul : un bon non cumulable ne s'additionne à aucun autre ; entre plusieurs bons possibles,
 * la combinaison la plus avantageuse pour le client est retenue.
 */

export type VoucherRule = {
  id: string;
  code: string;
  isActive: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  usageLimit?: number | null;
  usageCount?: number;
  perCustomerLimit?: number | null;
  customerId?: string | null;
  customerGroupId?: number | null;
  minimumSubtotalXof?: number;
  discountType: "percent" | "amount" | "none";
  /** Pourcentage (10 = 10 %) ou montant en FCFA. */
  discountValue: number;
  maximumDiscountXof?: number | null;
  freeShipping?: boolean;
  combinable?: boolean;
  excludeDiscountedProducts?: boolean;
  productIds?: string[];
  categoryIds?: number[];
  priority?: number;
};

export type VoucherCartLine = {
  productId: string;
  categoryIds: number[];
  /** Prix unitaire réellement payé (après prix spécifiques), en FCFA. */
  unitPriceXof: number;
  quantity: number;
  /** La ligne bénéficie déjà d'une remise (prix spécifique ou règle catalogue). */
  discounted?: boolean;
};

export type VoucherContext = {
  lines: VoucherCartLine[];
  customerId?: string | null;
  customerGroupIds?: number[];
  /** Nombre d'utilisations de ce bon par ce client. */
  customerUsageCount?: number;
  now?: Date;
};

export type VoucherRejection =
  | "inactive" | "not_started" | "expired" | "usage_limit_reached" | "customer_limit_reached"
  | "login_required" | "wrong_customer" | "wrong_group" | "no_eligible_product" | "minimum_not_reached";

export type VoucherEvaluation =
  | { valid: true; voucherId: string; code: string; discountXof: number; freeShipping: boolean; eligibleSubtotalXof: number; combinable: boolean }
  | { valid: false; voucherId: string; code: string; reason: VoucherRejection; message: string };

const MESSAGES: Record<VoucherRejection, string> = {
  inactive: "Ce bon de réduction n'est pas actif.",
  not_started: "Ce bon de réduction n'est pas encore valable.",
  expired: "Ce bon de réduction a expiré.",
  usage_limit_reached: "Ce bon de réduction a atteint son nombre maximal d'utilisations.",
  customer_limit_reached: "Vous avez déjà utilisé ce bon de réduction le nombre de fois autorisé.",
  login_required: "Connectez-vous pour utiliser ce bon de réduction.",
  wrong_customer: "Ce bon de réduction est réservé à un autre client.",
  wrong_group: "Ce bon de réduction n'est pas disponible pour votre catégorie de client.",
  no_eligible_product: "Aucun produit de votre panier n'est concerné par ce bon.",
  minimum_not_reached: "Le montant minimum pour utiliser ce bon n'est pas atteint.",
};

/** Normalise un code saisi : majuscules, sans espaces. */
export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function isLineEligible(rule: VoucherRule, line: VoucherCartLine): boolean {
  if (rule.excludeDiscountedProducts && line.discounted) return false;
  const byProduct = rule.productIds?.length ? rule.productIds.includes(line.productId) : null;
  const byCategory = rule.categoryIds?.length ? line.categoryIds.some((id) => rule.categoryIds!.includes(id)) : null;
  if (byProduct === null && byCategory === null) return true;
  // Restriction produits ET catégories : une ligne est éligible si elle satisfait l'une des deux.
  return Boolean(byProduct) || Boolean(byCategory);
}

export function evaluateVoucher(rule: VoucherRule, context: VoucherContext): VoucherEvaluation {
  const reject = (reason: VoucherRejection): VoucherEvaluation => ({ valid: false, voucherId: rule.id, code: rule.code, reason, message: MESSAGES[reason] });
  const now = context.now ?? new Date();
  if (!rule.isActive) return reject("inactive");
  if (rule.startsAt && now < rule.startsAt) return reject("not_started");
  if (rule.endsAt && now > rule.endsAt) return reject("expired");
  if (rule.usageLimit != null && (rule.usageCount ?? 0) >= rule.usageLimit) return reject("usage_limit_reached");
  if ((rule.customerId || rule.customerGroupId != null || rule.perCustomerLimit != null) && !context.customerId) return reject("login_required");
  if (rule.customerId && rule.customerId !== context.customerId) return reject("wrong_customer");
  if (rule.customerGroupId != null && !(context.customerGroupIds ?? []).includes(rule.customerGroupId)) return reject("wrong_group");
  if (rule.perCustomerLimit != null && (context.customerUsageCount ?? 0) >= rule.perCustomerLimit) return reject("customer_limit_reached");

  const eligible = context.lines.filter((line) => line.quantity > 0 && isLineEligible(rule, line));
  if (!eligible.length) return reject("no_eligible_product");
  const eligibleSubtotalXof = eligible.reduce((sum, line) => sum + Math.max(0, Math.round(line.unitPriceXof)) * line.quantity, 0);
  if (eligibleSubtotalXof < (rule.minimumSubtotalXof ?? 0)) return reject("minimum_not_reached");

  let discountXof = 0;
  if (rule.discountType === "percent") discountXof = Math.round((eligibleSubtotalXof * Math.min(100, Math.max(0, rule.discountValue))) / 100);
  if (rule.discountType === "amount") discountXof = Math.max(0, Math.round(rule.discountValue));
  if (rule.maximumDiscountXof != null) discountXof = Math.min(discountXof, rule.maximumDiscountXof);
  discountXof = Math.min(discountXof, eligibleSubtotalXof);

  return { valid: true, voucherId: rule.id, code: rule.code, discountXof, freeShipping: Boolean(rule.freeShipping), eligibleSubtotalXof, combinable: Boolean(rule.combinable) };
}

export type CombinedVouchers = {
  applied: Array<Extract<VoucherEvaluation, { valid: true }>>;
  rejected: Array<Extract<VoucherEvaluation, { valid: false }> | { valid: false; voucherId: string; code: string; reason: "not_combinable"; message: string }>;
  discountXof: number;
  freeShipping: boolean;
};

/**
 * Applique plusieurs bons : soit tous les bons cumulables ensemble, soit le meilleur bon non
 * cumulable seul — la solution la plus avantageuse pour le client. La remise totale ne dépasse
 * jamais le sous-total du panier.
 */
export function combineVouchers(evaluations: VoucherEvaluation[], cartSubtotalXof: number): CombinedVouchers {
  const valid = evaluations.filter((entry): entry is Extract<VoucherEvaluation, { valid: true }> => entry.valid);
  const rejected: CombinedVouchers["rejected"] = evaluations.filter((entry): entry is Extract<VoucherEvaluation, { valid: false }> => !entry.valid);
  const value = (list: typeof valid) => Math.min(cartSubtotalXof, list.reduce((sum, entry) => sum + entry.discountXof, 0));
  const stackable = valid.filter((entry) => entry.combinable);
  const best = [...valid].sort((a, b) => b.discountXof - a.discountXof || Number(b.freeShipping) - Number(a.freeShipping))[0];
  const options: Array<typeof valid> = [];
  if (stackable.length) options.push(stackable);
  if (best) options.push([best]);
  const chosen = options.sort((a, b) => value(b) - value(a) || Number(b.some((entry) => entry.freeShipping)) - Number(a.some((entry) => entry.freeShipping)) || b.length - a.length)[0] ?? [];
  for (const entry of valid) {
    if (!chosen.includes(entry)) rejected.push({ valid: false, voucherId: entry.voucherId, code: entry.code, reason: "not_combinable", message: "Ce bon ne se cumule pas avec les autres bons de votre panier." });
  }
  return { applied: chosen, rejected, discountXof: Math.min(cartSubtotalXof, chosen.reduce((sum, entry) => sum + entry.discountXof, 0)), freeShipping: chosen.some((entry) => entry.freeShipping) };
}
