import { useState, type ReactNode } from 'react'
import { ApiError } from './api'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label={title}><h3>{title}</h3>{children}</div>
    </div>
  )
}

export function useAction() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError(''); setBusy(true)
    try { return await fn() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Erreur inattendue'); return undefined }
    finally { setBusy(false) }
  }
  return { error, busy, run, setError }
}

/** Champ numérique : '' = vide (null), sinon entier. */
export const toInt = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(/\s/g, '')))
