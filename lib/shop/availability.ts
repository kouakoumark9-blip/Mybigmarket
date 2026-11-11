/** Disponibilité d'un produit : le texte affiché au client ne promet que ce qui peut être tenu. */
export type Availability = "in_stock_abidjan" | "on_order";

export function availabilityLabel(availability: string, leadTimeDays: number): string {
  return availability === "on_order"
    ? `Sur commande (livraison sous ${leadTimeDays} jours)`
    : "En stock (livraison 24 à 72 h)";
}

export const isInStock = (availability: string, quantity: number) => availability !== "on_order" && quantity > 0;

export const AVAILABILITY_OPTIONS: Array<{ value: Availability; label: string }> = [
  { value: "in_stock_abidjan", label: "En stock (livraison 24 à 72 h)" },
  { value: "on_order", label: "Sur commande (livraison sous X jours)" },
];
