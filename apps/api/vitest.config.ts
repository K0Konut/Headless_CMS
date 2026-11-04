import { defineConfig } from 'vitest/config'

// Base dédiée aux tests : ils peuvent la vider sans toucher aux données de développement.
// Posée sur process.env (et non test.env) pour être vue aussi par le globalSetup.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://dashility:dashility@localhost:5432/dashility_test'

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    // Les fichiers partagent la même base : on les exécute l'un après l'autre.
    fileParallelism: false,
  },
})
