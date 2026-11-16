import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { can } from '../../shared/permissions'
import type { Client, SessionUser } from '../../shared/types'
import { Modal, useAction } from '../ui'

const EMPTY: Omit<Client, 'id'> = { nom: '', prenoms: '', telephone: '', whatsapp: '', email: '', adresse: '', profession: '', situation_matrimoniale: '', contact_urgence: '', piece_identite_type: '', piece_identite_numero: '' }
const FIELDS: [keyof typeof EMPTY, string, boolean?][] = [
  ['nom', 'Nom'], ['prenoms', 'Prénoms'], ['telephone', 'Téléphone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['profession', 'Profession'],
  ['adresse', 'Adresse', true], ['situation_matrimoniale', 'Situation matrimoniale'], ['contact_urgence', "Contact d'urgence"],
  ['piece_identite_type', "Type de pièce d'identité"], ['piece_identite_numero', 'N° de la pièce'],
]

export function ClientsPage({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Client[]>([])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Client> | null>(null)
  const { error, run } = useAction()
  const canWrite = can(user.role, 'clients:write')
  const load = useCallback(() => { void run(async () => setRows(await api<Client[]>('clients:list', { q }))) }, [q])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  return (
    <>
      <h2>Clients</h2>
      <div className="bar">
        <input placeholder="Rechercher nom, téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
        {canWrite && <button className="btn" onClick={() => setEdit({})}>Nouveau client</button>}
      </div>
      {error && <div className="err">{error}</div>}
      <table>
        <thead><tr><th>Nom</th><th>Téléphone</th><th>E-mail</th><th>Profession</th></tr></thead>
        <tbody>
          {rows.map((c) => <tr key={c.id} className={canWrite ? 'click' : ''} onClick={() => canWrite && setEdit(c)}><td>{c.nom} {c.prenoms}</td><td>{c.telephone}</td><td>{c.email}</td><td>{c.profession}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={4} className="muted">Aucun client.</td></tr>}
        </tbody>
      </table>
      {edit && <ClientForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function ClientForm({ initial, onClose, onSaved }: { initial: Partial<Client>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...EMPTY, ...initial })
  const { error, busy, run } = useAction()
  return (
    <Modal title={initial.id ? 'Modifier le client' : 'Nouveau client'} onClose={onClose}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); const id = await run(() => api('clients:save', f)); if (id) onSaved() }}>
        {FIELDS.map(([k, label, full]) => (
          <label key={k} className={full ? 'full' : ''}>{label}<input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
        {error && <div className="err full">{error}</div>}
        <div className="actions full"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn" disabled={busy}>Enregistrer</button></div>
      </form>
    </Modal>
  )
}
