import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

/** Envoi comme le script de collecte du site, directement à l'API des tests (port 3100). */
async function beacon(key: string, t: 'view' | 'cv', p: string) {
  const res = await fetch('http://localhost:3100/api/e', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Origin: 'https://exemple.fr',
      'User-Agent': 'Mozilla/5.0 Firefox/140.0',
    },
    body: JSON.stringify({ k: key, t, p, r: t === 'view' ? 'www.linkedin.com' : undefined }),
  })
  expect(res.status).toBe(204)
}

test('le premier événement remplace l’état vide, sans recharger la page', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  const { publicKey } = await admin.call('get', '/spaces/portfolio')
  await admin.close()

  await page.goto('/espaces/portfolio/analytics')
  await expect(page.getByText('Aucune donnée pour l’instant')).toBeVisible()
  await expect(page.getByText('vue sur les 30 dernières minutes')).toBeVisible()

  const live = page.getByRole('region', { name: 'Temps réel' })
  await live.getByRole('button', { name: 'Voir le flux' }).click()

  await beacon(publicKey, 'view', '/projets/cms')
  await beacon(publicKey, 'cv', '/projets/cms')

  await expect(live.getByRole('listitem').filter({ hasText: '/projets/cms' })).toHaveCount(2)
  await expect(live).toContainText('Dernier événement')
  await expect(live).toContainText('1 vue sur les 30 dernières minutes')

  await expect(page.getByText('Aucune donnée pour l’instant')).toHaveCount(0)
  const tiles = page.locator('dl')
  await expect(tiles).toContainText('Vues1')
  await expect(tiles).toContainText('CV téléchargés1')
  await expect(tiles).toContainText('Taux de conversion100 %')
  await expect(page.getByRole('region', { name: 'Provenances' })).toContainText('LinkedIn')
})

test('la période se choisit dans l’URL et l’export suit la période', async ({ page }) => {
  await page.goto('/espaces/portfolio/analytics?periode=7j')
  await expect(page.getByRole('combobox', { name: 'Période' })).toHaveText('7 derniers jours')

  const href = await page.getByRole('link', { name: 'Exporter en CSV' }).getAttribute('href')
  expect(href).toMatch(
    /\/api\/spaces\/portfolio\/analytics\/export\.csv\?from=\d{4}-\d{2}-\d{2}&to=/,
  )
  const csv = await page.request.get(href!)
  expect(await csv.text()).toContain('date,type,page,provenance')

  await page.getByRole('combobox', { name: 'Période' }).click()
  await page.getByRole('option', { name: 'Personnalisée' }).click()
  await expect(page).toHaveURL(/du=\d{4}-\d{2}-\d{2}&au=\d{4}-\d{2}-\d{2}/)
  await expect(page.getByLabel('Du', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Au', { exact: true })).toBeVisible()
})

test('la pause arrête le temps réel', async ({ browser, page }) => {
  const admin = await adminApi(browser)
  const { publicKey } = await admin.call('get', '/spaces/portfolio')
  await admin.close()

  await page.goto('/espaces/portfolio/analytics')
  const live = page.getByRole('region', { name: 'Temps réel' })
  await live.getByRole('button', { name: 'Mettre le temps réel en pause' }).click()
  await beacon(publicKey, 'view', '/pendant-la-pause')
  await page.waitForTimeout(500)
  await expect(live.getByText('/pendant-la-pause')).toHaveCount(0)

  // La reprise recharge l'état : l'événement manqué apparaît.
  await live.getByRole('button', { name: 'Reprendre le temps réel' }).click()
  await expect(live.getByText('/pendant-la-pause')).toBeVisible()
})
