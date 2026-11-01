/**
 * Formatage partagé de la fiche produit B2B.
 * Module pur : testable sans DOM, utilisé côté serveur et client.
 */

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** « 46 172 FCFA » — espace insécable avant l'unité, jamais de décimale. */
export function formatXof(amount: number): string {
  return `${integer.format(Math.round(amount))} FCFA`;
}

/** « 46 172 » seul, pour les contextes où l'unité est affichée à part. */
export function formatAmount(amount: number): string {
  return integer.format(Math.round(amount));
}

/** « 15 822-22 015 FCFA » : fourchette quand les paliers diffèrent. */
export function formatRange(min: number, max: number): string {
  if (min === max) return formatXof(min);
  return `${formatAmount(min)}-${formatXof(max)}`;
}

/** « 1-19 pièce », « 20-99 pièces », « ≥ 1000 pièces ». */
export function formatTierRange(
  minimumQuantity: number,
  maximumQuantity: number | null,
  unit = "pièce",
): string {
  const plural = (count: number) => `${unit}${count > 1 ? "s" : ""}`;
  if (maximumQuantity === null) return `≥ ${formatAmount(minimumQuantity)} ${plural(minimumQuantity)}`;
  const label = `${formatAmount(minimumQuantity)}-${formatAmount(maximumQuantity)}`;
  return `${label} ${plural(maximumQuantity)}`;
}

/**
 * Palier applicable à une quantité.
 *
 * Les paliers sont ordonnés par quantité minimale croissante ; on retient le
 * dernier dont le minimum est atteint. Une quantité inférieure au premier
 * palier retombe sur celui-ci : c'est le prix affiché qui fait foi, on ne
 * laisse jamais un prix indéfini.
 */
export function tierForQuantity<T extends { minimumQuantity: number; maximumQuantity: number | null }>(
  tiers: T[],
  quantity: number,
): T | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minimumQuantity - b.minimumQuantity);
  let selected = sorted[0];
  for (const tier of sorted) {
    if (quantity >= tier.minimumQuantity) selected = tier;
  }
  return selected;
}

/** Date de livraison estimée : date du jour + délai, format « 12 décembre ». */
export function estimatedDelivery(days: number, from: Date = new Date()): string {
  const date = new Date(from.getTime() + Math.max(0, days) * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(date);
}

/** Note affichée sur 5 avec une décimale, ou null si aucun avis. */
export function formatRating(average: number | null): string | null {
  if (average === null || Number.isNaN(average)) return null;
  return average.toFixed(1).replace(".", ",");
}
