import { z } from 'zod'

/** Découpe une ligne CSV en gérant les guillemets ; séparateur ; ou , détecté. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

export interface LotImportRow {
  numero: string
  ilot: string
  superficie: number
  prix_m2: number | null
  prix_fixe: number | null
  observations: string
}

const entier = (label: string) =>
  z.string().trim().transform((s) => s.replace(/[\s  ]/g, '')).pipe(
    z.string().regex(/^\d+$/, `${label} : entier positif attendu`).transform(Number),
  )

const optEntier = (label: string) =>
  z.string().trim().transform((s) => (s === '' ? null : s)).pipe(z.union([z.null(), entier(label)]))

const norm = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_')

/**
 * Colonnes reconnues : numero, ilot, superficie, prix_m2, prix_fixe, observations.
 * Exactement un des deux prix doit être renseigné par ligne.
 */
export function parseLotsCsv(text: string): { rows: { ligne: number; lot: LotImportRow }[]; erreurs: { ligne: number; message: string }[] } {
  const table = parseCsv(text)
  const erreurs: { ligne: number; message: string }[] = []
  const rows: { ligne: number; lot: LotImportRow }[] = []
  if (table.length === 0) return { rows, erreurs: [{ ligne: 0, message: 'Fichier vide' }] }
  const header = table[0].map(norm)
  const idx = (name: string) => header.indexOf(name)
  for (const required of ['numero', 'superficie']) {
    if (idx(required) < 0) return { rows, erreurs: [{ ligne: 1, message: `Colonne manquante : ${required}` }] }
  }
  const get = (r: string[], name: string) => (idx(name) >= 0 ? (r[idx(name)] ?? '') : '')
  const seen = new Set<string>()
  table.slice(1).forEach((r, i) => {
    const ligne = i + 2
    try {
      const numero = get(r, 'numero').trim()
      if (!numero) throw new Error('numero : obligatoire')
      if (seen.has(numero)) throw new Error(`numero : doublon dans le fichier (${numero})`)
      const superficie = entier('superficie').parse(get(r, 'superficie'))
      if (superficie <= 0) throw new Error('superficie : doit être > 0')
      const prix_m2 = optEntier('prix_m2').parse(get(r, 'prix_m2'))
      const prix_fixe = optEntier('prix_fixe').parse(get(r, 'prix_fixe'))
      if ((prix_m2 === null) === (prix_fixe === null)) throw new Error('renseigner prix_m2 OU prix_fixe (un seul)')
      seen.add(numero)
      rows.push({ ligne, lot: { numero, ilot: get(r, 'ilot').trim(), superficie, prix_m2, prix_fixe, observations: get(r, 'observations').trim() } })
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0].message : (e as Error).message
      erreurs.push({ ligne, message: msg })
    }
  })
  return { rows, erreurs }
}
