import { expect, test as setup } from '@playwright/test'
import { ADMIN_SESSION } from '../playwright.config'
import { ADMIN, login } from './fixtures'

setup('connexion du super-admin et espaces de test', async ({ page }) => {
  await page.goto('/connexion')
  await login(page, ADMIN)
  await expect(page).not.toHaveURL(/connexion/)
  await page.context().storageState({ path: ADMIN_SESSION })

  for (const space of [
    { name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' },
    { name: 'Blog', slug: 'blog', siteUrl: 'https://blog.fr' },
  ]) {
    expect((await page.request.post('/api/spaces', { data: space })).status()).toBe(201)
  }
})
