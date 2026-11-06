/** Marqueur posé au clic sur une carte produit : la fiche s'ouvre alors en haut, sur la photo. */
export const PDP_FROM_CARD = "mbm-pdp-from-card";

export function markProductCardClick() {
  try { sessionStorage.setItem(PDP_FROM_CARD, "1"); } catch { /* stockage indisponible : sans effet */ }
}
