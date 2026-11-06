import { execFileSync } from 'node:child_process'
import { prepareDatabase } from '../../api/test/global-setup'
import { E2E_DATABASE_URL } from '../playwright.config'
import { ADMIN, PASSWORD } from './fixtures'

/** Base vide, puis le super-admin créé par la vraie commande serveur. */
export default async function setup() {
  await prepareDatabase(E2E_DATABASE_URL)
  execFileSync('node', ['../api/dist/cli.js', 'create-super-admin', ADMIN], {
    input: `${PASSWORD}\n${PASSWORD}\n`,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  })
}
