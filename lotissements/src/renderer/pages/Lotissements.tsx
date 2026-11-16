import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { can } from '../../shared/permissions'
import type { Lotissement, SessionUser } from '../../shared/types'
import { Modal, useAction, toInt } from '../ui'

export function LotissementsPage({ user, onOpenLots }: { user: SessionUser; onOpenLots: (id: number) => void }) {
  const [rows, setRows] = useState<Lotissement[]>([])
  const [edit, setEdit] = useState<Partial<Lotissement> | null>(null)
  const { error, run } = useAction()
  const load = useCallback(() => { void run(async () => setRows(await api<Lotissement[]>('lotissements:list'))) }, [])
  useEffect(load, [load])
  const canWrite = can(user.role, 'lotissements:write')
  return (
    <>
      <h2>Lotissements</h2>
      <div className="bar">{canWrite && <button className="btn" onClick={() => setEdit({})}>Nouveau lotissement</button>}</div>
      {error && <div className="err">{error}</div>}
      <table>
        <thead><tr><th>Nom</th><th>Localisation</th><th>Superficie (m²)</th><th>Situation juridique</th><th>Lots</th><th>Disponibles</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => onOpenLots(r.id)}>
              <td>{r.nom}</td><td>{r.localisation}</td><td>{r.superficie ?? ''}</td><td>{r.statut_juridique}</td><td>{r.nb_lots}</td><td>{r.nb_disponibles}</td>
              <td>{canWrite && <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setEdit(r) }}>Modifier</button>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">Aucun lotissement.</td></tr>}
        </tbody>
      </table>
      {edit && <LotissementForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function LotissementForm({ initial, onClose, onSaved }: { initial: Partial<Lotissement>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ nom: initial.nom ?? '', localisation: initial.localisation ?? '', superficie: initial.superficie?.toString() ?? '', statut_juridique: initial.statut_juridique ?? '' })
  const { error, busy, run } = useAction()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title={initial.id ? 'Modifier le lotissement' : 'Nouveau lotissement'} onClose={onClose}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault()
        const id = await run(() => api('lotissements:save', { id: initial.id, ...f, superficie: toInt(f.superficie) }))
        if (id) onSaved()
      }}>
        <label className="full">Nom<input value={f.nom} onChange={set('nom')} autoFocus /></label>
        <label className="full">Localisation<input value={f.localisation} onChange={set('localisation')} /></label>
        <label>Superficie totale (m²)<input inputMode="numeric" value={f.superficie} onChange={set('superficie')} /></label>
        <label>Situation juridique<input value={f.statut_juridique} onChange={set('statut_juridique')} /></label>
        {error && <div className="err full">{error}</div>}
        <div className="actions full"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn" disabled={busy}>Enregistrer</button></div>
      </form>
    </Modal>
  )
}
