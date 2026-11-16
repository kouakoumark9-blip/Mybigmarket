import { Client } from 'pg'
import bcrypt from 'bcryptjs'

async function main() {
  const url = process.env.DATABASE_URL
  const [email, nom, password] = [process.env.ADMIN_EMAIL, process.env.ADMIN_NAME ?? 'Administrateur', process.env.ADMIN_PASSWORD]
  if (!url || !email || !password) throw new Error('DATABASE_URL, ADMIN_EMAIL et ADMIN_PASSWORD sont requis')
  if (password.length < 8) throw new Error('Mot de passe : 8 caractères minimum')
  const c = new Client({ connectionString: url })
  await c.connect()
  await c.query(
    `INSERT INTO utilisateurs (nom, email, role, mot_de_passe) VALUES ($1,$2,'admin',$3) ON CONFLICT (email) DO NOTHING`,
    [nom, email.toLowerCase(), await bcrypt.hash(password, 12)],
  )
  await c.end()
  console.log('Administrateur créé (ou déjà existant).')
}
main().catch((e) => { console.error(e); process.exit(1) })
