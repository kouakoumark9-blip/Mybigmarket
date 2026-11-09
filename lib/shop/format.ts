const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** 245000 → « 245 000 FCFA » (espace insécable entre les milliers). */
export const formatFcfa = (amount: number) => `${number.format(amount).replace(/ /g, " ")} FCFA`;
export const discountPercent = (price: number, compare?: number | null) => (compare && compare > price ? Math.round((1 - price / compare) * 100) : 0);
