/**
 * Statut employé effectif.
 *
 * Un compte « locked » dont la fenêtre de verrouillage est écoulée doit être considéré
 * comme actif : sans cette règle, le bon mot de passe reste refusé à chaque tentative et
 * l'employé est verrouillé définitivement.
 *
 * Module pur (aucune dépendance Next/DB) pour être partagé entre l'authentification et
 * les contrôles de permission sans créer d'import circulaire.
 */
export type EmployeeStatus = "active" | "invited" | "disabled" | "locked";

export function effectiveEmployeeStatus(
  status: string,
  lockedUntil: Date | null | undefined,
  now: Date = new Date(),
): EmployeeStatus {
  if (status === "locked") {
    if (!lockedUntil) return "locked";
    if (lockedUntil.getTime() <= now.getTime()) return "active";
  }
  return status as EmployeeStatus;
}
