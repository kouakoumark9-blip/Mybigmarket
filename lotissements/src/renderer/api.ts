import type { Result } from '../shared/types'

declare global {
  interface Window { api: { call: <T>(name: string, arg?: unknown) => Promise<Result<T>> } }
}

export class ApiError extends Error {}

export async function api<T>(name: string, arg?: unknown): Promise<T> {
  const r = await window.api.call<T>(name, arg)
  if (!r.ok) throw new ApiError(r.error)
  return r.data
}
