import { Pool, type PoolClient } from 'pg'
import { app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let pool: Pool | null = null

/** DATABASE_URL (variable d'environnement) ou fichier config.json du dossier utilisateur du logiciel. */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const file = join(app.getPath('userData'), 'config.json')
  if (existsSync(file)) {
    const cfg = JSON.parse(readFileSync(file, 'utf8')) as { databaseUrl?: string }
    if (cfg.databaseUrl) return cfg.databaseUrl
  }
  throw new Error(`Base de données non configurée. Renseignez "databaseUrl" dans ${file}`)
}

export function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: databaseUrl(), max: 5, ssl: { rejectUnauthorized: true } })
  return pool
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

export async function audit(
  q: { query: PoolClient['query'] },
  userId: number | null,
  action: string,
  entite: string,
  entiteId: string | number | null,
  details?: unknown,
): Promise<void> {
  await q.query(
    'INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, details) VALUES ($1,$2,$3,$4,$5)',
    [userId, action, entite, entiteId == null ? null : String(entiteId), details ? JSON.stringify(details) : null],
  )
}
