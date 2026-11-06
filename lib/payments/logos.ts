/**
 * Logos affichés pour chaque moyen de paiement (fichiers SVG de public/payments).
 * Les fichiers peuvent être remplacés par les logos officiels sans toucher au code.
 */
export type PaymentLogo = { src: string; label: string };

export const PAYMENT_LOGOS: Record<string, PaymentLogo[]> = {
  wave: [{ src: "/payments/wave.svg", label: "Wave" }],
  orange_money: [{ src: "/payments/orange-money.svg", label: "Orange Money" }],
  mtn_momo: [{ src: "/payments/mtn-momo.svg", label: "MTN MoMo" }],
  moov_money: [{ src: "/payments/moov-money.svg", label: "Moov Money" }],
  card: [{ src: "/payments/visa.svg", label: "Visa" }, { src: "/payments/mastercard.svg", label: "Mastercard" }],
};

/** Logos sans doublon, dans l'ordre des moyens donnés. */
export function logosFor(codes: readonly string[]): PaymentLogo[] {
  const seen = new Set<string>();
  const out: PaymentLogo[] = [];
  for (const code of codes) for (const logo of PAYMENT_LOGOS[code] ?? []) if (!seen.has(logo.src)) { seen.add(logo.src); out.push(logo); }
  return out;
}
