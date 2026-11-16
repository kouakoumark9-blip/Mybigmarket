import { useEffect, useState } from 'react'
import { api } from './api'
import { can, type Permission } from '../shared/permissions'
import { ROLE_LABELS, type SessionUser } from '../shared/types'
import { useAction } from './ui'
import { LotissementsPage } from './pages/Lotissements'
import { LotsPage } from './pages/Lots'
import { ClientsPage } from './pages/Clients'
import { UtilisateursPage } from './pages/Utilisateurs'

type Page = 'lotissements' | 'lots' | 'clients' | 'utilisateurs'
const NAV: { id: Page; label: string; perm: Permission }[] = [
  { id: 'lotissements', label: 'Lotissements', perm: 'lotissements:read' },
  { id: 'lots', label: 'Lots', perm: 'lots:read' },
  { id: 'clients', label: 'Clients', perm: 'clients:read' },
  { id: 'utilisateurs', label: 'Utilisateurs', perm: 'utilisateurs:manage' },
]

function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, busy, run } = useAction()
  return (
    <form className="login" onSubmit={async (e) => { e.preventDefault(); const u = await run(() => api<SessionUser>('auth:login', { email, password })); if (u) onLogin(u) }}>
      <h2>Gestion de lotissements</h2>
      <input type="email" placeholder="E-mail" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <div className="err">{error}</div>}
      <button className="btn" disabled={busy}>Se connecter</button>
    </form>
  )
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<Page>('lotissements')
  const [lotFilter, setLotFilter] = useState<number | undefined>()

  useEffect(() => { api<SessionUser | null>('auth:me').then(setUser).finally(() => setReady(true)).catch(() => setReady(true)) }, [])
  if (!ready) return null
  if (!user) return <Login onLogin={setUser} />

  const nav = NAV.filter((n) => can(user.role, n.perm))
  return (
    <div className="layout">
      <nav>
        <h1>Lotissements</h1>
        {nav.map((n) => (
          <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => { setPage(n.id); if (n.id !== 'lots') setLotFilter(undefined) }}>{n.label}</button>
        ))}
        <div className="who">
          {user.nom}<br />{ROLE_LABELS[user.role]}<br />
          <button onClick={async () => { await api('auth:logout'); setUser(null) }}>Déconnexion</button>
        </div>
      </nav>
      <main>
        {page === 'lotissements' && <LotissementsPage user={user} onOpenLots={(id) => { setLotFilter(id); setPage('lots') }} />}
        {page === 'lots' && <LotsPage user={user} initialLotissement={lotFilter} />}
        {page === 'clients' && <ClientsPage user={user} />}
        {page === 'utilisateurs' && <UtilisateursPage user={user} />}
      </main>
    </div>
  )
}
