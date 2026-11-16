import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getPool, tx, audit } from './db'
import { can, type Permission } from '../shared/permissions'
import { ROLES, LOT_STATUTS, type SessionUser, type Lot, type Lotissement, type Client, type Utilisateur, type ImportResult } from '../shared/types'
import { prixTotal } from '../shared/lots'
import { parseLotsCsv } from '../shared/csv'

let session: SessionUser | null = null
export const currentUser = () => session

class UserError extends Error {}
const fail = (m: string): never => { throw new UserError(m) }

function need(p: Permission): SessionUser {
  if (!session) return fail('Session expirée, reconnectez-vous')
  if (!can(session.role, p)) return fail('Action non autorisée pour votre rôle')
  return session
}

// --- anti force brute (par e-mail, en mémoire) ---
const attempts = new Map<string, { n: number; until: number }>()
const MAX_TRIES = 5
const LOCK_MS = 60_000

// Hachage factice : même coût que pour un vrai compte (évite de révéler quels e-mails existent).
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12)

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })

const lotissementSchema = z.object({
  id: z.number().int().optional(),
  nom: z.string().trim().min(1, 'Nom obligatoire'),
  localisation: z.string().trim().default(''),
  superficie: z.number().int().min(0).nullable().default(null),
  statut_juridique: z.string().trim().default(''),
})

const lotSchema = z.object({
  id: z.number().int().optional(),
  lotissement_id: z.number().int(),
  numero: z.string().trim().min(1, 'Numéro obligatoire'),
  ilot: z.string().trim().default(''),
  superficie: z.number().int().positive('Superficie > 0'),
  prix_m2: z.number().int().min(0).nullable(),
  prix_fixe: z.number().int().min(0).nullable(),
  statut: z.enum(LOT_STATUTS).default('disponible'),
  observations: z.string().default(''),
}).refine((l) => (l.prix_m2 === null) !== (l.prix_fixe === null), { message: 'Renseignez le prix/m² OU le prix fixe (un seul)' })

const clientSchema = z.object({
  id: z.number().int().optional(),
  nom: z.string().trim().min(1, 'Nom obligatoire'),
  prenoms: z.string().trim().default(''),
  telephone: z.string().trim().default(''),
  whatsapp: z.string().trim().default(''),
  email: z.string().trim().default(''),
  adresse: z.string().trim().default(''),
  profession: z.string().trim().default(''),
  situation_matrimoniale: z.string().trim().default(''),
  contact_urgence: z.string().trim().default(''),
  piece_identite_type: z.string().trim().default(''),
  piece_identite_numero: z.string().trim().default(''),
})

const userSchema = z.object({
  id: z.number().int().optional(),
  nom: z.string().trim().min(1, 'Nom obligatoire'),
  email: z.string().trim().toLowerCase().email('E-mail invalide'),
  role: z.enum(ROLES),
  actif: z.boolean().default(true),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').optional(),
})

const withPrix = (r: Omit<Lot, 'prix'>): Lot => ({ ...r, prix: prixTotal(r) })

function pgMessage(e: unknown): never {
  const err = e as { code?: string; constraint?: string }
  if (err.code === '23505') {
    if (err.constraint === 'lots_numero_unique') return fail('Ce numéro de lot existe déjà dans ce lotissement')
    if (err.constraint === 'lotissements_nom_key') return fail('Un lotissement porte déjà ce nom')
    if (err.constraint === 'utilisateurs_email_key') return fail('Cet e-mail est déjà utilisé')
    return fail('Doublon détecté')
  }
  if (err.code === '23503') return fail('Suppression impossible : des éléments y sont rattachés')
  throw e
}

type Handler = (arg: unknown) => Promise<unknown>

export const handlers: Record<string, Handler> = {
  async 'auth:login'(arg) {
    const { email, password } = loginSchema.parse(arg)
    const a = attempts.get(email)
    if (a && a.n >= MAX_TRIES && Date.now() < a.until) return fail('Trop de tentatives, réessayez dans une minute')
    const { rows } = await getPool().query(
      'SELECT id, nom, email, role, mot_de_passe, actif FROM utilisateurs WHERE email = $1', [email])
    const u = rows[0]
    const ok = await bcrypt.compare(password, u?.mot_de_passe ?? DUMMY_HASH)
    if (!u || !ok || !u.actif) {
      attempts.set(email, { n: (a && Date.now() < a.until + LOCK_MS ? a.n : 0) + 1, until: Date.now() + LOCK_MS })
      await audit(getPool(), u?.id ?? null, 'connexion_echec', 'utilisateur', u?.id ?? null, { email })
      return fail('Identifiant ou mot de passe incorrect')
    }
    attempts.delete(email)
    session = { id: u.id, nom: u.nom, email: u.email, role: u.role }
    await audit(getPool(), u.id, 'connexion', 'utilisateur', u.id)
    return session
  },
  async 'auth:logout'() {
    if (session) await audit(getPool(), session.id, 'deconnexion', 'utilisateur', session.id)
    session = null
    return null
  },
  async 'auth:me'() { return session },

  // ---- Lotissements ----
  async 'lotissements:list'() {
    need('lotissements:read')
    const { rows } = await getPool().query(`
      SELECT l.id, l.nom, l.localisation, l.superficie, l.statut_juridique,
             COUNT(o.id)::int AS nb_lots,
             COUNT(o.id) FILTER (WHERE o.statut = 'disponible')::int AS nb_disponibles
      FROM lotissements l LEFT JOIN lots o ON o.lotissement_id = l.id
      GROUP BY l.id ORDER BY l.nom`)
    return rows as Lotissement[]
  },
  async 'lotissements:save'(arg) {
    const u = need('lotissements:write')
    const d = lotissementSchema.parse(arg)
    try {
      return await tx(async (c) => {
        if (d.id) {
          await c.query(`UPDATE lotissements SET nom=$2, localisation=$3, superficie=$4, statut_juridique=$5 WHERE id=$1`,
            [d.id, d.nom, d.localisation, d.superficie, d.statut_juridique])
          await audit(c, u.id, 'modification', 'lotissement', d.id, d)
          return d.id
        }
        const r = await c.query(`INSERT INTO lotissements (nom, localisation, superficie, statut_juridique) VALUES ($1,$2,$3,$4) RETURNING id`,
          [d.nom, d.localisation, d.superficie, d.statut_juridique])
        await audit(c, u.id, 'creation', 'lotissement', r.rows[0].id, d)
        return r.rows[0].id as number
      })
    } catch (e) { return pgMessage(e) }
  },

  // ---- Lots ----
  async 'lots:list'(arg) {
    need('lots:read')
    const f = z.object({ lotissement_id: z.number().int().optional() }).parse(arg ?? {})
    const { rows } = await getPool().query(`
      SELECT o.*, l.nom AS lotissement_nom FROM lots o JOIN lotissements l ON l.id = o.lotissement_id
      WHERE ($1::int IS NULL OR o.lotissement_id = $1)
      ORDER BY l.nom, o.ilot, length(o.numero), o.numero`, [f.lotissement_id ?? null])
    return rows.map(withPrix)
  },
  async 'lots:save'(arg) {
    const u = need('lots:write')
    const d = lotSchema.parse(arg)
    try {
      return await tx(async (c) => {
        if (d.id) {
          // Un lot réservé/vendu est géré par les réservations/ventes (phase 2) : on ne change pas son statut à la main.
          const cur = (await c.query('SELECT statut FROM lots WHERE id=$1 FOR UPDATE', [d.id])).rows[0]
          if (!cur) return fail('Lot introuvable')
          if (d.statut !== cur.statut && (cur.statut === 'reserve' || cur.statut === 'vendu' || d.statut === 'reserve' || d.statut === 'vendu'))
            return fail('Le statut Réservé/Vendu est géré par les réservations et ventes')
          await c.query(`UPDATE lots SET lotissement_id=$2, numero=$3, ilot=$4, superficie=$5, prix_m2=$6, prix_fixe=$7, statut=$8, observations=$9 WHERE id=$1`,
            [d.id, d.lotissement_id, d.numero, d.ilot, d.superficie, d.prix_m2, d.prix_fixe, d.statut, d.observations])
          await audit(c, u.id, 'modification', 'lot', d.id, d)
          return d.id
        }
        if (d.statut === 'reserve' || d.statut === 'vendu') return fail('Un nouveau lot est Disponible ou Bloqué')
        const r = await c.query(`INSERT INTO lots (lotissement_id, numero, ilot, superficie, prix_m2, prix_fixe, statut, observations)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [d.lotissement_id, d.numero, d.ilot, d.superficie, d.prix_m2, d.prix_fixe, d.statut, d.observations])
        await audit(c, u.id, 'creation', 'lot', r.rows[0].id, d)
        return r.rows[0].id as number
      })
    } catch (e) { return pgMessage(e) }
  },
  async 'lots:import'(arg) {
    const u = need('lots:write')
    const { lotissement_id, csv } = z.object({ lotissement_id: z.number().int(), csv: z.string().max(5_000_000) }).parse(arg)
    const { rows, erreurs } = parseLotsCsv(csv)
    // Tout ou rien : une seule erreur annule l'import, pour ne pas avoir un fichier à moitié chargé.
    if (erreurs.length > 0 || rows.length === 0) return { inseres: 0, erreurs } satisfies ImportResult
    try {
      await tx(async (c) => {
        for (const { lot } of rows) {
          await c.query(`INSERT INTO lots (lotissement_id, numero, ilot, superficie, prix_m2, prix_fixe, observations) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [lotissement_id, lot.numero, lot.ilot, lot.superficie, lot.prix_m2, lot.prix_fixe, lot.observations])
        }
        await audit(c, u.id, 'import', 'lot', null, { lotissement_id, nb: rows.length })
      })
    } catch (e) {
      const err = e as { code?: string }
      if (err.code === '23505') return { inseres: 0, erreurs: [{ ligne: 0, message: 'Un ou plusieurs numéros existent déjà dans ce lotissement : import annulé' }] } satisfies ImportResult
      throw e
    }
    return { inseres: rows.length, erreurs: [] } satisfies ImportResult
  },

  // ---- Clients ----
  async 'clients:list'(arg) {
    need('clients:read')
    const { q } = z.object({ q: z.string().optional() }).parse(arg ?? {})
    const like = q ? `%${q.trim().replace(/[\\%_]/g, '\\$&')}%` : null
    const { rows } = await getPool().query(`
      SELECT id, nom, prenoms, telephone, whatsapp, email, adresse, profession, situation_matrimoniale,
             contact_urgence, piece_identite_type, piece_identite_numero
      FROM clients
      WHERE $1::text IS NULL OR nom ILIKE $1 OR prenoms ILIKE $1 OR telephone ILIKE $1 OR whatsapp ILIKE $1
      ORDER BY nom, prenoms LIMIT 500`, [like])
    return rows as Client[]
  },
  async 'clients:save'(arg) {
    const u = need('clients:write')
    const d = clientSchema.parse(arg)
    return tx(async (c) => {
      const cols = [d.nom, d.prenoms, d.telephone, d.whatsapp, d.email, d.adresse, d.profession, d.situation_matrimoniale, d.contact_urgence, d.piece_identite_type, d.piece_identite_numero]
      if (d.id) {
        await c.query(`UPDATE clients SET nom=$2, prenoms=$3, telephone=$4, whatsapp=$5, email=$6, adresse=$7, profession=$8,
          situation_matrimoniale=$9, contact_urgence=$10, piece_identite_type=$11, piece_identite_numero=$12 WHERE id=$1`, [d.id, ...cols])
        // Données personnelles : on journalise la modification sans recopier les valeurs.
        await audit(c, u.id, 'modification', 'client', d.id)
        return d.id
      }
      const r = await c.query(`INSERT INTO clients (nom, prenoms, telephone, whatsapp, email, adresse, profession,
        situation_matrimoniale, contact_urgence, piece_identite_type, piece_identite_numero, cree_par)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [...cols, u.id])
      await audit(c, u.id, 'creation', 'client', r.rows[0].id)
      return r.rows[0].id as number
    })
  },

  // ---- Utilisateurs ----
  async 'utilisateurs:list'() {
    need('utilisateurs:manage')
    const { rows } = await getPool().query('SELECT id, nom, email, role, actif FROM utilisateurs ORDER BY nom')
    return rows as Utilisateur[]
  },
  async 'utilisateurs:save'(arg) {
    const me = need('utilisateurs:manage')
    const d = userSchema.parse(arg)
    if (!d.id && !d.password) return fail('Mot de passe obligatoire pour un nouvel utilisateur')
    if (d.id === me.id && (!d.actif || d.role !== 'admin')) return fail('Vous ne pouvez pas vous retirer vos propres droits')
    const hash = d.password ? await bcrypt.hash(d.password, 12) : null
    try {
      return await tx(async (c) => {
        if (d.id) {
          await c.query(`UPDATE utilisateurs SET nom=$2, email=$3, role=$4, actif=$5, mot_de_passe=COALESCE($6, mot_de_passe) WHERE id=$1`,
            [d.id, d.nom, d.email, d.role, d.actif, hash])
          await audit(c, me.id, d.password ? 'modification+mot_de_passe' : 'modification', 'utilisateur', d.id, { email: d.email, role: d.role, actif: d.actif })
          return d.id
        }
        const r = await c.query(`INSERT INTO utilisateurs (nom, email, role, actif, mot_de_passe) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [d.nom, d.email, d.role, d.actif, hash])
        await audit(c, me.id, 'creation', 'utilisateur', r.rows[0].id, { email: d.email, role: d.role })
        return r.rows[0].id as number
      })
    } catch (e) { return pgMessage(e) }
  },
}

export { UserError }
