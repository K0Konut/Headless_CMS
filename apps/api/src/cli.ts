import { emailSchema, passwordSchema } from '@cms/shared'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { upsertSuperAdmin } from './auth/super-admin.js'
import { createDb } from './db/index.js'

// L'itérateur garde en tampon les lignes déjà reçues (entrée par pipe), contrairement à rl.question.
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY })
// Masque la saisie : readline n'affiche plus rien de ce qui est tapé.
Object.assign(rl, { _writeToOutput: () => {} })
const lines = rl[Symbol.asyncIterator]()

/** Lit une saisie sans l'afficher dans le terminal. */
async function askHidden(question: string) {
  stdout.write(question)
  const { value } = await lines.next()
  stdout.write('\n')
  return String(value ?? '')
}

const [command, rawEmail] = process.argv.slice(2)
if (command !== 'create-super-admin' || !rawEmail) {
  console.error('Usage : node dist/cli.js create-super-admin <email>')
  process.exit(1)
}

const email = emailSchema.parse(rawEmail)
const password = passwordSchema.parse(await askHidden('Mot de passe : '))
if ((await askHidden('Confirmer : ')) !== password) {
  console.error('Les mots de passe ne correspondent pas.')
  process.exit(1)
}
rl.close()

const db = createDb()
await upsertSuperAdmin(db, email, password)
await db.$client.end()
console.log(`Super-admin ${email} prêt. Ses anciennes sessions sont fermées.`)
