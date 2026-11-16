import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { ROLES, ROLE_LABELS, type Role, type SessionUser, type Utilisateur } from '../../shared/types'
import { Modal, useAction } from '../ui'

export function UtilisateursPage({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Utilisateur[]>([])
  const [edit, setEdit] = useState<Partial<Utilisateur> | null>(null)
  const { error, run } = useAction()
  const load = useCallback(() => { void run(async () => setRows(await api<Utilisateur[]>('utilisateurs:list'))) }, [])
  useEffect(load, [load])
  return (
    <>
      <h2>Utilisateurs</h2>
      <div className="bar"><button className="btn" onClick={() => setEdit({ role: 'commercial', actif: true })}>Nouvel utilisateur</button></div>
      {error && <div className="err">{error}</div>}
      <table>
        <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Actif</th></tr></thead>
        <tbody>{rows.map((u) => <tr key={u.id} className="click" onClick={() => setEdit(u)}><td>{u.nom}{u.id === user.id && ' (vous)'}</td><td>{u.email}</td><td>{ROLE_LABELS[u.role]}</td><td>{u.actif ? 'Oui' : 'Non'}</td></tr>)}</tbody>
      </table>
      {edit && <UserForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function UserForm({ initial, onClose, onSaved }: { initial: Partial<Utilisateur>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ nom: initial.nom ?? '', email: initial.email ?? '', role: (initial.role ?? 'commercial') as Role, actif: initial.actif ?? true, password: '' })
  const { error, busy, run } = useAction()
  return (
    <Modal title={initial.id ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} onClose={onClose}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault()
        const id = await run(() => api('utilisateurs:save', { id: initial.id, ...f, password: f.password || undefined }))
        if (id) onSaved()
      }}>
        <label>Nom<input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></label>
        <label>E-mail<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Rôle<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
        <label>{initial.id ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}<input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label><span>Actif</span><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /></label>
        {error && <div className="err full">{error}</div>}
        <div className="actions full"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn" disabled={busy}>Enregistrer</button></div>
      </form>
    </Modal>
  )
}
