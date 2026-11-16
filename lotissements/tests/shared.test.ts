import { describe, it, expect } from 'vitest'
import { can } from '../src/shared/permissions'
import { prixTotal, formatFcfa } from '../src/shared/lots'
import { parseLotsCsv } from '../src/shared/csv'

describe('permissions', () => {
  it('seul l\'admin gère utilisateurs et lots', () => {
    expect(can('admin', 'utilisateurs:manage')).toBe(true)
    for (const r of ['commercial', 'caissier', 'foncier'] as const) {
      expect(can(r, 'utilisateurs:manage')).toBe(false)
      expect(can(r, 'lots:write')).toBe(false)
    }
  })
  it('le commercial crée des clients, le caissier non', () => {
    expect(can('commercial', 'clients:write')).toBe(true)
    expect(can('caissier', 'clients:write')).toBe(false)
  })
})

describe('prix', () => {
  it('prix/m² × superficie, ou prix fixe', () => {
    expect(prixTotal({ superficie: 300, prix_m2: 15000, prix_fixe: null })).toBe(4_500_000)
    expect(prixTotal({ superficie: 300, prix_m2: null, prix_fixe: 3_000_000 })).toBe(3_000_000)
  })
  it('formate en FCFA', () => expect(formatFcfa(4500000)).toBe('4 500 000 FCFA'))
})

describe('import CSV des lots', () => {
  it('lit un fichier Excel français (;, BOM, espaces dans les nombres)', () => {
    const csv = '﻿Numéro;Îlot;Superficie;Prix m2;Prix fixe;Observations\r\nA1;A;300;15 000;;coin\r\nA2;A;250;;3 000 000;\r\n'
    const r = parseLotsCsv(csv)
    expect(r.erreurs).toEqual([])
    expect(r.rows.map((x) => x.lot)).toEqual([
      { numero: 'A1', ilot: 'A', superficie: 300, prix_m2: 15000, prix_fixe: null, observations: 'coin' },
      { numero: 'A2', ilot: 'A', superficie: 250, prix_m2: null, prix_fixe: 3000000, observations: '' },
    ])
  })
  it('signale doublons, prix manquant/double et superficie invalide', () => {
    const r = parseLotsCsv('numero,superficie,prix_m2,prix_fixe\nA1,300,100,\nA1,300,100,\nA3,300,,\nA4,300,100,5\nA5,abc,100,\nA6,0,100,')
    expect(r.erreurs.map((e) => e.ligne)).toEqual([3, 4, 5, 6, 7])
  })
  it('refuse un fichier sans colonne obligatoire', () => {
    expect(parseLotsCsv('ilot;prix_m2\nA;1').erreurs[0].message).toMatch(/numero/)
  })
})
