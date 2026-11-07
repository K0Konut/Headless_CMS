import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('générer la clé API dans Réglages, puis lire le contenu publié avec elle', async ({
  browser,
  page,
  request,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Lecture',
    slug: 'lecture',
    siteUrl: 'https://lecture.fr',
  })
  await admin.call('post', '/spaces/lecture/types', {
    slug: 'a-propos',
    kind: 'single',
    name: 'À propos',
    entryLabel: null,
    fields: [{ key: 'bio', label: 'Bio', type: 'text', required: true, translatable: true }],
  })
  const base = '/spaces/lecture/types/a-propos/entries/single'
  const entry = await admin.call('get', base)
  const saved = await admin.call('patch', base, {
    version: entry.version,
    data: { bio: { fr: 'Développeur', en: 'Developer' } },
  })
  await admin.call('post', `${base}/publish`, { version: saved.version })
  await admin.close()

  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/espaces/lecture/reglages')
  await expect(
    page.getByText('Aucune clé : le site ne peut pas encore lire le contenu.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Générer une clé' }).click()
  const field = page.getByRole('textbox', { name: 'Clé API' })
  await expect(field).toHaveValue(/^dly_/)
  await expect(page.getByText('Copiez-la maintenant : elle ne sera plus affichée.')).toBeVisible()
  const key = await field.inputValue()

  const res = await request.get('/api/v1/content/a-propos?locale=en', {
    headers: { Authorization: `Bearer ${key}` },
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).fields).toEqual({ bio: 'Developer' })

  // Après rechargement, la clé n'est plus affichée, seulement sa date.
  await page.reload()
  await expect(page.getByText(/^Clé créée le /)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Clé API' })).toHaveCount(0)

  // Régénérer (après confirmation) : l'ancienne clé ne fonctionne plus.
  await page.getByRole('button', { name: 'Régénérer la clé' }).click()
  await expect(page.getByRole('textbox', { name: 'Clé API' })).not.toHaveValue(key)
  const old = await request.get('/api/v1/content/a-propos', {
    headers: { Authorization: `Bearer ${key}` },
  })
  expect(old.status()).toBe(401)
})

test('la documentation de l’API s’affiche', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.text().includes('Content Security Policy') && errors.push(m.text()))
  await page.goto('/api/docs')
  await expect(page.getByText('Dashility — API de lecture')).toBeVisible()
  await expect(page.getByText('/content/{type}/{slug}')).toBeVisible()
  expect(errors).toEqual([])
})
