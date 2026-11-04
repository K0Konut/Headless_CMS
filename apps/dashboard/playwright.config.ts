import { defineConfig, devices } from '@playwright/test'

// Ports et base dédiés : les tests de bout en bout ne touchent ni au serveur de dev ni à ses données.
const API_PORT = 3100
const WEB_PORT = 5174
export const ADMIN_SESSION = 'e2e/.auth/admin.json'
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://cms:cms@localhost:5432/cms_e2e'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    // Une seule connexion du super-admin, réutilisée : la connexion est limitée à 5 par minute.
    { name: 'session', testMatch: 'session.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_SESSION },
      dependencies: ['session'],
    },
  ],
  webServer: [
    {
      // L'API doit avoir été compilée (npm run build -w @cms/api).
      command: 'node ../api/dist/main.js',
      port: API_PORT,
      env: { PORT: String(API_PORT), DATABASE_URL: E2E_DATABASE_URL },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
})
