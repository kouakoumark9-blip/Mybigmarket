import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL manquant')
  const c = new Client({ connectionString: url })
  await c.connect()
  await c.query(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'))
  await c.end()
  console.log('Schéma appliqué.')
}
main().catch((e) => { console.error(e); process.exit(1) })
