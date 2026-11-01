/**
 * Résolution des taxes (module 9).
 *
 * Principe : un produit porte UNE règle de taxe (groupe). Le taux effectif dépend
 * du pays de livraison. Les prix de la boutique sont stockés HT (décision projet),
 * le TTC est calculé à l'affichage et figé au moment de la facture.
 *
 * Module pur : testable sans base.
 */

export type TaxRule = {
  id: string;
  countryCode: string;
  region?: string | null;
  ratePercent: number;
  isIncludedInPrice?: boolean;
  isActive?: boolean;
  priority?: number;
};

export type TaxResolutionContext = {
  countryCode: string;
  /** Région/état si connu : une règle régionale prime sur la règle nationale. */
  region?: string | null;
};

export type ResolvedTax = {
  ratePercent: number;
  ruleId: string | null;
  /** `true` quand aucune règle ne correspond : le taux 0 est appliqué explicitement. */
  fallback: boolean;
};

/**
 * Choisit la règle applicable.
 * Ordre : même pays + même région > même pays > taux 0 explicite.
 * Une règle inactive est ignorée, jamais silencieusement appliquée.
 */
export function resolveTaxRate(rules: TaxRule[], context: TaxResolutionContext): ResolvedTax {
  const active = rules.filter((rule) => rule.isActive !== false);
  const normalizedCountry = context.countryCode.toUpperCase();
  const normalizedRegion = context.region?.trim().toLowerCase() ?? null;

  const candidates = active.filter((rule) => rule.countryCode.toUpperCase() === normalizedCountry);

  if (normalizedRegion) {
    const regional = candidates
      .filter((rule) => rule.region && rule.region.trim().toLowerCase() === normalizedRegion)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    if (regional[0]) return { ratePercent: regional[0].ratePercent, ruleId: regional[0].id, fallback: false };
  }

  const national = candidates
    .filter((rule) => !rule.region || rule.region.trim() === "")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (national[0]) return { ratePercent: national[0].ratePercent, ruleId: national[0].id, fallback: false };

  return { ratePercent: 0, ruleId: null, fallback: true };
}

/** TTC = HT × (1 + taux), arrondi au franc. */
export function priceIncludingTax(priceExcludingTaxXof: number, ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return Math.round(priceExcludingTaxXof);
  return Math.round(priceExcludingTaxXof * (1 + ratePercent / 100));
}

/** Montant de taxe contenu dans un prix TTC (utile pour les factures). */
export function taxFromPriceIncluding(priceIncludingTaxXof: number, ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return 0;
  const excluding = priceIncludingTaxXof / (1 + ratePercent / 100);
  return Math.round(priceIncludingTaxXof - excluding);
}

/** Conversion d'affichage dans une devise secondaire. La comptabilité reste en XOF. */
export function convertXof(amountXof: number, rate: number, decimals = 2): number {
  if (!Number.isFinite(rate) || rate <= 0) return amountXof;
  const factor = 10 ** decimals;
  return Math.round(amountXof * rate * factor) / factor;
}

/**
 * Une facture émise est figée : ce garde-fou documente l'intention et permet
 * aux tests de vérifier qu'aucun recalcul n'est appliqué après émission.
 */
export function isImmutableDocument(issuedAt: Date | null | undefined): boolean {
  return issuedAt instanceof Date && issuedAt.getTime() <= Date.now();
}
