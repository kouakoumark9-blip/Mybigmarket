export const ROLES = ['admin', 'commercial', 'caissier', 'foncier'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur / Direction',
  commercial: 'Commercial',
  caissier: 'Caissier / Comptable',
  foncier: 'Gestionnaire foncier / Juriste',
}

export const LOT_STATUTS = ['disponible', 'reserve', 'vendu', 'bloque'] as const
export type LotStatut = (typeof LOT_STATUTS)[number]

export const LOT_STATUT_LABELS: Record<LotStatut, string> = {
  disponible: 'Disponible',
  reserve: 'Réservé',
  vendu: 'Vendu',
  bloque: 'Bloqué',
}

export interface SessionUser {
  id: number
  nom: string
  email: string
  role: Role
}

export interface Lotissement {
  id: number
  nom: string
  localisation: string
  superficie: number | null
  statut_juridique: string
  nb_lots: number
  nb_disponibles: number
}

export interface Lot {
  id: number
  lotissement_id: number
  lotissement_nom: string
  numero: string
  ilot: string
  superficie: number
  prix_m2: number | null
  prix_fixe: number | null
  prix: number // prix total calculé, FCFA
  statut: LotStatut
  observations: string
}

export interface Client {
  id: number
  nom: string
  prenoms: string
  telephone: string
  whatsapp: string
  email: string
  adresse: string
  profession: string
  situation_matrimoniale: string
  contact_urgence: string
  piece_identite_type: string
  piece_identite_numero: string
}

export interface Utilisateur {
  id: number
  nom: string
  email: string
  role: Role
  actif: boolean
}

export interface ImportResult {
  inseres: number
  erreurs: { ligne: number; message: string }[]
}

/** Réponse uniforme des appels IPC. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
