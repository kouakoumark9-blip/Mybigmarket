/** Prix total d'un lot en FCFA (entier) : prix fixe, sinon prix/m² × superficie. */
export function prixTotal(l: { superficie: number; prix_m2: number | null; prix_fixe: number | null }): number {
  if (l.prix_fixe != null) return l.prix_fixe
  return Math.round((l.prix_m2 ?? 0) * l.superficie)
}

export function formatFcfa(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ') + ' FCFA'
}
