// Budget du PRD : le script de collecte pèse moins de 2 Ko compressé.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const LIMIT = 2048
const size = gzipSync(readFileSync(new URL('../dist/index.js', import.meta.url))).length
console.log(`dist/index.js : ${size} octets compressés (limite ${LIMIT})`)
if (size > LIMIT) process.exit(1)
