/**
 * Frais de livraison par commune. Pour changer un tarif : modifiez le montant (en FCFA) ci-dessous.
 * Une commune absente de la liste est traitée comme « Autre ville de Côte d'Ivoire ».
 */
export type DeliveryZone = { commune: string; group: "Abidjan" | "Autres villes"; feeXof: number; delay: string };

export const DELIVERY_ZONES: DeliveryZone[] = [
  { commune: "Cocody", group: "Abidjan", feeXof: 2000, delay: "24 à 72 h" },
  { commune: "Plateau", group: "Abidjan", feeXof: 2000, delay: "24 à 72 h" },
  { commune: "Marcory", group: "Abidjan", feeXof: 2000, delay: "24 à 72 h" },
  { commune: "Treichville", group: "Abidjan", feeXof: 2000, delay: "24 à 72 h" },
  { commune: "Koumassi", group: "Abidjan", feeXof: 2500, delay: "24 à 72 h" },
  { commune: "Port-Bouët", group: "Abidjan", feeXof: 2500, delay: "24 à 72 h" },
  { commune: "Adjamé", group: "Abidjan", feeXof: 2500, delay: "24 à 72 h" },
  { commune: "Yopougon", group: "Abidjan", feeXof: 3000, delay: "24 à 72 h" },
  { commune: "Abobo", group: "Abidjan", feeXof: 3000, delay: "24 à 72 h" },
  { commune: "Attécoubé", group: "Abidjan", feeXof: 3000, delay: "24 à 72 h" },
  { commune: "Bingerville", group: "Abidjan", feeXof: 4000, delay: "48 à 72 h" },
  { commune: "Anyama", group: "Abidjan", feeXof: 4000, delay: "48 à 72 h" },
  { commune: "Songon", group: "Abidjan", feeXof: 4500, delay: "48 à 72 h" },
  { commune: "Grand-Bassam", group: "Autres villes", feeXof: 5000, delay: "2 à 4 jours" },
  { commune: "Bouaké", group: "Autres villes", feeXof: 8000, delay: "3 à 5 jours" },
  { commune: "Yamoussoukro", group: "Autres villes", feeXof: 7000, delay: "3 à 5 jours" },
  { commune: "San-Pédro", group: "Autres villes", feeXof: 9000, delay: "3 à 6 jours" },
  { commune: "Daloa", group: "Autres villes", feeXof: 9000, delay: "3 à 6 jours" },
  { commune: "Korhogo", group: "Autres villes", feeXof: 10000, delay: "4 à 7 jours" },
  { commune: "Autre ville de Côte d'Ivoire", group: "Autres villes", feeXof: 10000, delay: "4 à 7 jours" },
];

export const findZone = (commune: string) => DELIVERY_ZONES.find((zone) => zone.commune === commune);
export const deliveryFee = (commune: string) => findZone(commune)?.feeXof ?? 10000;
