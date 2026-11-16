import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { can } from '../../shared/permissions'
import { formatFcfa } from '../../shared/lots'
import { LOT_STATUTS, LOT_STATUT_LABELS, type Lot, type Lotissement, type SessionUser, type ImportResult, type LotStatut } from '../../shared/types'
import { Modal, useAction, toInt } from '../ui'

export function LotsPage({ user, initialLotissement }: { user: SessionUser; initialLotissement?: number }) {
  const [lotissements, setLotissements] = useState<Lotissement[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [lotissementId, setLotissementId] = useState<number | undefined>(initialLotissement)
  const [statut, setStatut] = useState<LotStatut | ''>('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'liste' | 'grille'>('liste')
  const [edit, setEdit] = useState<Partial<Lot> | null>(null)
  const [importing, setImporting] = useState(false)
  const { error, run } = useAction()
  const canWrite = can(user.role, 'lots:write')

  useEffect(() => { void run(async () => setLotissements(await api<Lotissement[]>('lotissements:list'))) }, [])
  const load = useCallback(() => { void run(async () => setLots(await api<Lot[]>('lots:list', { lotissement_id: lotissementId }))) }, [lotissementId])
  useEffect(load, [load])

  const shown = useMemo(() => lots.filter((l) =>
    (!statut || l.statut === statut) && (!search || `${l.numero} ${l.ilot}`.toLowerCase().includes(search.toLowerCase()))), [lots, statut, search])

  return (
    <>
      <h2>Lots</h2>
      <div className="bar">
        <select value={lotissementId ?? ''} onChange={(e) => setLotissementId(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Tous les lotissements</option>
          {lotissements.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value as LotStatut | '')}>
          <option value="">Tous les statuts</option>
          {LOT_STATUTS.map((s) => <option key={s} value={s}>{LOT_STATUT_LABELS[s]}</option>)}
        </select>
        <input placeholder="Rechercher n° / îlot" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn ghost" onClick={() => setView(view === 'liste' ? 'grille' : 'liste')}>{view === 'liste' ? 'Vue plan' : 'Vue liste'}</button>
        {canWrite && <button className="btn" onClick={() => setEdit({ lotissement_id: lotissementId })}>Nouveau lot</button>}
        {canWrite && <button className="btn ghost" disabled={!lotissementId} title={lotissementId ? '' : 'Choisissez un lotissement'} onClick={() => setImporting(true)}>Importer CSV</button>}
      </div>
      {error && <div className="err">{error}</div>}
      {view === 'liste' ? (
        <table>
          <thead><tr><th>Lotissement</th><th>Îlot</th><th>N°</th><th>Superficie</th><th>Prix</th><th>Statut</th></tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className={canWrite ? 'click' : ''} onClick={() => canWrite && setEdit(l)}>
                <td>{l.lotissement_nom}</td><td>{l.ilot}</td><td>{l.numero}</td><td>{l.superficie} m²</td><td>{formatFcfa(l.prix)}</td>
                <td><span className={`badge s-${l.statut}`}>{LOT_STATUT_LABELS[l.statut]}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="muted">Aucun lot.</td></tr>}
          </tbody>
        </table>
      ) : (
        <div className="grid">
          {shown.map((l) => (
            <div key={l.id} className={`cell s-${l.statut}`} title={`${LOT_STATUT_LABELS[l.statut]} — ${formatFcfa(l.prix)}`} onClick={() => canWrite && setEdit(l)}>
              <b>{l.numero}</b><small>{l.ilot && `Îlot ${l.ilot} · `}{l.superficie} m²</small>
            </div>
          ))}
        </div>
      )}
      {edit && <LotForm initial={edit} lotissements={lotissements} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      {importing && lotissementId && <ImportForm lotissementId={lotissementId} onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />}
    </>
  )
}

function LotForm({ initial, lotissements, onClose, onSaved }: { initial: Partial<Lot>; lotissements: Lotissement[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    lotissement_id: initial.lotissement_id?.toString() ?? '', numero: initial.numero ?? '', ilot: initial.ilot ?? '',
    superficie: initial.superficie?.toString() ?? '', mode: initial.prix_fixe != null ? 'fixe' : 'm2',
    prix: (initial.prix_fixe ?? initial.prix_m2)?.toString() ?? '', statut: (initial.statut ?? 'disponible') as LotStatut, observations: initial.observations ?? '',
  })
  const { error, busy, run } = useAction()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  // Réservé/Vendu sont posés par les réservations/ventes ; on ne les propose pas à la main.
  const lockedStatut = initial.statut === 'reserve' || initial.statut === 'vendu'
  const options = lockedStatut ? [initial.statut as LotStatut] : (['disponible', 'bloque'] as LotStatut[])
  return (
    <Modal title={initial.id ? 'Modifier le lot' : 'Nouveau lot'} onClose={onClose}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault()
        const prix = toInt(f.prix)
        const id = await run(() => api('lots:save', {
          id: initial.id, lotissement_id: Number(f.lotissement_id), numero: f.numero, ilot: f.ilot, superficie: toInt(f.superficie) ?? 0,
          prix_m2: f.mode === 'm2' ? prix : null, prix_fixe: f.mode === 'fixe' ? prix : null, statut: f.statut, observations: f.observations,
        }))
        if (id) onSaved()
      }}>
        <label className="full">Lotissement
          <select value={f.lotissement_id} onChange={set('lotissement_id')}>
            <option value="">—</option>{lotissements.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </select></label>
        <label>Numéro<input value={f.numero} onChange={set('numero')} /></label>
        <label>Îlot<input value={f.ilot} onChange={set('ilot')} /></label>
        <label>Superficie (m²)<input inputMode="numeric" value={f.superficie} onChange={set('superficie')} /></label>
        <label>Statut<select value={f.statut} onChange={set('statut')} disabled={lockedStatut}>{options.map((s) => <option key={s} value={s}>{LOT_STATUT_LABELS[s]}</option>)}</select></label>
        <label>Mode de prix<select value={f.mode} onChange={set('mode')}><option value="m2">Prix au m²</option><option value="fixe">Prix fixe</option></select></label>
        <label>Prix (FCFA)<input inputMode="numeric" value={f.prix} onChange={set('prix')} /></label>
        <label className="full">Observations<textarea rows={2} value={f.observations} onChange={set('observations')} /></label>
        {error && <div className="err full">{error}</div>}
        <div className="actions full"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn" disabled={busy}>Enregistrer</button></div>
      </form>
    </Modal>
  )
}

function ImportForm({ lotissementId, onClose, onDone }: { lotissementId: number; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const { error, busy, run } = useAction()
  return (
    <Modal title="Importer des lots (CSV)" onClose={onClose}>
      <p className="muted">Colonnes : <code>numero; ilot; superficie; prix_m2; prix_fixe; observations</code>. Exactement un des deux prix par ligne. Excel : « Enregistrer sous » → CSV. L'import est tout-ou-rien.</p>
      <input type="file" accept=".csv,text/csv,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setResult(null) } }} />
      {error && <div className="err">{error}</div>}
      {result && (result.erreurs.length > 0
        ? <div className="err">Import annulé :<ul>{result.erreurs.slice(0, 15).map((x, i) => <li key={i}>Ligne {x.ligne} : {x.message}</li>)}</ul></div>
        : <div className="ok">{result.inseres} lots importés.</div>)}
      <div className="actions">
        <button className="btn ghost" onClick={result && result.erreurs.length === 0 ? onDone : onClose}>Fermer</button>
        <button className="btn" disabled={!csv || busy || (result?.inseres ?? 0) > 0} onClick={async () => { const r = await run(() => api<ImportResult>('lots:import', { lotissement_id: lotissementId, csv })); if (r) setResult(r) }}>Importer</button>
      </div>
    </Modal>
  )
}
