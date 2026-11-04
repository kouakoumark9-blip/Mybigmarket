export type MarginInput = {
  /** Prix d'achat unitaire (XOF). */
  unitPrice: number;
  quantity: number;
  /** Frais de livraison pour toute la commande (XOF). */
  shippingTotal: number;
  /** Marge souhaitée sur le prix de revente, en % (0-95). */
  marginPercent: number;
};

export type MarginResult = {
  unitCost: number;
  totalCost: number;
  suggestedPrice: number;
  unitProfit: number;
  totalProfit: number;
};

/**
 * Calcule le prix de revente suggéré pour atteindre une marge sur le prix de vente :
 * prix = coût unitaire / (1 − marge).
 */
export function computeMargin({ unitPrice, quantity, shippingTotal, marginPercent }: MarginInput): MarginResult {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const margin = Math.min(95, Math.max(0, marginPercent || 0)) / 100;
  const unitCost = Math.max(0, unitPrice || 0) + Math.max(0, shippingTotal || 0) / qty;
  const suggestedPrice = unitCost / (1 - margin);
  const unitProfit = suggestedPrice - unitCost;
  return {
    unitCost: Math.round(unitCost),
    totalCost: Math.round(unitCost * qty),
    suggestedPrice: Math.round(suggestedPrice),
    unitProfit: Math.round(unitProfit),
    totalProfit: Math.round(unitProfit * qty),
  };
}

/** Nombre de vignettes à afficher et compteur « +N ». */
export function visibleThumbs<T>(items: T[], slots: number, selectedIndex = -1): { shown: T[]; hidden: number } {
  if (items.length <= slots) return { shown: items, hidden: 0 };
  const shown = items.slice(0, Math.max(1, slots - 1));
  // La variante sélectionnée reste toujours visible.
  if (selectedIndex >= shown.length) shown[shown.length - 1] = items[selectedIndex];
  return { shown, hidden: items.length - shown.length };
}
