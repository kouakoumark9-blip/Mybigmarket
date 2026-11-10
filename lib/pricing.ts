/**
 * Calcul des prix de vente — règles verrouillées (module 1 et 8).
 *
 * Module volontairement pur : aucune dépendance base, aucun "server-only",
 * donc entièrement testable en unitaire.
 *
 * Ordre d'application (strict, non cumulatif sur la base) :
 *   1. palier de quantité (`price_tiers`)  → fixe le prix unitaire de base s'il s'applique
 *   2. sinon prix catalogue         → `priceXof` + impact de combinaison
 *   3. remise groupe client         → sur le prix de base retenu
 *   4. prix spécifiques             → le PLUS favorable au client des applicables
 *                                     (une règle ciblée ne fait jamais payer plus cher ;
 *                                      à remise égale, la règle la plus spécifique est retenue)
 *   5. plancher                     → jamais sous le prix d'achat
 *
 * Un palier dégressif n'est PAS une remise cumulable : il remplace le prix de base.
 * Sinon un grossiste cumulerait palier + remise groupe + promo et vendrait à perte.
 */

export type PriceTierRule = {
  minimumQuantity: number;
  maximumQuantity: number | null;
  unitPriceXof: number;
};

export type SpecificPriceRule = {
  /** Traçabilité : identifiant et origine de la règle (prix spécifique produit, règle catalogue). */
  id?: string;
  source?: "specific_price" | "catalog_rule";
  /** Cible : produit, ou combinaison précise. */
  variantId?: number | null;
  customerId?: string | null;
  groupId?: string | null;
  countryCode?: string | null;
  currency?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  minimumQuantity?: number | null;
  /** `fixed_price` : le prix HT devient `discountValue` (jamais plus cher que le prix courant). */
  discountType: "percent" | "amount" | "fixed_price";
  discountValue: number;
  /** Plus la valeur est haute, plus la règle est prioritaire à cible équivalente. */
  priority?: number;
};

export type PriceContext = {
  /** Prix catalogue HT en XOF. */
  basePriceXof: number;
  /** Impact de la combinaison choisie (peut être négatif). */
  variantDeltaXof?: number;
  /** Prix d'achat HT : plancher absolu. */
  purchasePriceXof?: number | null;
  ecotaxXof?: number | null;
  quantity: number;
  tiers?: PriceTierRule[];
  groupDiscountBasisPoints?: number | null;
  specificPrices?: SpecificPriceRule[];
  customer?: {
    customerId?: string | null;
    groupId?: string | null;
    countryCode?: string | null;
    currency?: string | null;
  };
  now?: Date;
};

export type PriceBreakdown = {
  unitPriceXof: number;
  basePriceXof: number;
  tierApplied: boolean;
  groupDiscountXof: number;
  specificDiscountXof: number;
  specificRuleApplied: boolean;
  /** Règle retenue (la plus favorable au client), pour l'affichage et l'audit. */
  appliedRule: SpecificPriceRule | null;
  floorApplied: boolean;
  ecotaxXof: number;
  totalPriceXof: number;
  marginXof: number | null;
  marginPercent: number | null;
};

const toCents = (value: number) => Math.round(value);

/** Un prix spécifique est-il applicable dans ce contexte ? */
export function isSpecificPriceApplicable(rule: SpecificPriceRule, context: PriceContext, variantId?: number | null): boolean {
  const now = context.now ?? new Date();
  if (rule.dateFrom && now < rule.dateFrom) return false;
  if (rule.dateTo && now > rule.dateTo) return false;
  if (rule.minimumQuantity != null && context.quantity < rule.minimumQuantity) return false;

  // Une règle ciblant une combinaison ne s'applique qu'à cette combinaison.
  if (rule.variantId != null && rule.variantId !== variantId) return false;
  // Une règle ciblant un client précis n'est visible que pour lui.
  if (rule.customerId && rule.customerId !== context.customer?.customerId) return false;
  if (rule.groupId && rule.groupId !== context.customer?.groupId) return false;
  if (rule.countryCode && rule.countryCode !== context.customer?.countryCode) return false;
  if (rule.currency && rule.currency !== context.customer?.currency) return false;

  return true;
}

/** Spécificité d'une règle : client > groupe > pays > global. */
function specificityScore(rule: SpecificPriceRule): number {
  let score = rule.priority ?? 0;
  if (rule.customerId) score += 1000;
  if (rule.groupId) score += 100;
  if (rule.countryCode) score += 10;
  if (rule.currency) score += 5;
  if (rule.variantId != null) score += 2;
  return score;
}

function applyDiscount(amountXof: number, rule: SpecificPriceRule): number {
  if (rule.discountType === "percent") return Math.round((amountXof * Math.min(100, Math.max(0, rule.discountValue))) / 100);
  if (rule.discountType === "fixed_price") return Math.max(0, amountXof - Math.round(rule.discountValue));
  return Math.min(amountXof, Math.max(0, Math.round(rule.discountValue)));
}

/**
 * Applique une remise spécifique au prix, mais renvoie la remise réellement obtenue
 * pour pouvoir comparer plusieurs règles et retenir la plus favorable au client.
 */
export function bestSpecificPrice(priceXof: number, rules: SpecificPriceRule[], context: PriceContext, variantId?: number | null) {
  const applicable = rules
    .filter((rule) => isSpecificPriceApplicable(rule, context, variantId))
    // Le client ne paie jamais plus cher parce qu'une règle ciblée existe :
    // la remise la plus forte gagne. À remise égale, la règle la plus spécifique
    // est retenue (traçabilité et cohérence avec les règles PrestaShop).
    .map((rule) => ({ rule, discountXof: applyDiscount(priceXof, rule), score: specificityScore(rule) }))
    // Une règle qui n'apporte aucune remise (prix fixe supérieur au prix courant) n'est pas retenue.
    .filter((entry) => entry.discountXof > 0)
    .sort((a, b) => b.discountXof - a.discountXof || b.score - a.score);

  const winner = applicable[0];
  return winner ? { discountXof: winner.discountXof, rule: winner.rule } : null;
}

/** Palier dégressif applicable à la quantité demandée (le plus spécifique gagne). */
export function bestTier(tiers: PriceTierRule[] | undefined, quantity: number): PriceTierRule | null {
  if (!tiers?.length) return null;
  const matches = tiers
    .filter((tier) => quantity >= tier.minimumQuantity && (tier.maximumQuantity == null || quantity <= tier.maximumQuantity))
    .sort((a, b) => b.minimumQuantity - a.minimumQuantity);
  return matches[0] ?? null;
}

export function computeUnitPrice(context: PriceContext, variantId?: number | null): PriceBreakdown {
  const ecotaxXof = Math.max(0, toCents(context.ecotaxXof ?? 0));
  const catalogPrice = toCents(context.basePriceXof + (context.variantDeltaXof ?? 0));

  const tier = bestTier(context.tiers, context.quantity);
  const tierApplied = tier !== null;
  let price = tier ? toCents(tier.unitPriceXof) : catalogPrice;

  const basisPoints = context.groupDiscountBasisPoints ?? 0;
  const groupDiscountXof = basisPoints > 0 ? Math.round((price * basisPoints) / 10_000) : 0;
  price -= groupDiscountXof;

  // Les prix spécifiques s'évaluent APRÈS le palier et la remise groupe :
  // ils portent sur le prix réellement proposé au client.
  const specific = context.specificPrices?.length ? bestSpecificPrice(price, context.specificPrices, context, variantId) : null;
  const specificDiscountXof = specific?.discountXof ?? 0;
  price -= specificDiscountXof;

  let floorApplied = false;
  const floor = context.purchasePriceXof ?? null;
  if (floor != null && floor > 0 && price < floor) {
    price = toCents(floor);
    floorApplied = true;
  }

  price = Math.max(0, price);
  const unitPriceXof = price + ecotaxXof;

  const purchase = context.purchasePriceXof ?? null;
  const marginXof = purchase != null && purchase > 0 ? price - purchase : null;
  const marginPercent = marginXof != null && price > 0 ? Math.round((marginXof / price) * 10_000) / 100 : null;

  return {
    unitPriceXof,
    basePriceXof: catalogPrice,
    tierApplied,
    groupDiscountXof,
    specificDiscountXof,
    specificRuleApplied: specific !== null,
    appliedRule: specific?.rule ?? null,
    floorApplied,
    ecotaxXof,
    totalPriceXof: unitPriceXof * context.quantity,
    marginXof,
    marginPercent,
  };
}

/** Prix TTC = HT × (1 + taux). Les prix sont stockés HT (décision projet). */
export function computeTaxIncluded(priceXof: number, ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return Math.round(priceXof);
  return Math.round(priceXof * (1 + ratePercent / 100));
}

export function computeTaxAmount(priceXof: number, ratePercent: number): number {
  return computeTaxIncluded(priceXof, ratePercent) - Math.round(priceXof);
}
