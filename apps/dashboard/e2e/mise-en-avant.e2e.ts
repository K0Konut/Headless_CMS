import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('régler la mise en avant d’une collection dans Structure', async ({ browser, page }) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Palmarès',
    slug: 'palmares',
    siteUrl: 'https://palmares.fr',
  })
  await admin.call('post', '/spaces/palmares/types', {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [
      { key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true },
      {
        key: 'une',
        label: 'À la une',
        type: 'boolean',
        required: false,
        translatable: false,
        defaultValue: false,
      },
    ],
  })
  await admin.close()

  await page.goto('/espaces/palmares/structure/projets')
  await page
    .getByRole('checkbox', { name: /Mettre en avant les entrées les plus efficaces/ })
    .check()

  // Une adresse sans {slug} est refusée à l'enregistrement.
  await page.getByLabel('Pages sur le site (français)').fill('/fr/projets')
  await page.getByRole('button', { name: 'Enregistrer le type' }).click()
  await expect(page.getByText('L’adresse doit contenir {slug} une fois')).toBeVisible()

  await page.getByLabel('Pages sur le site (français)').fill('/fr/projets/{slug}')
  await page.getByLabel('Pages sur le site (anglais, facultatif)').fill('/en/projects/{slug}')
  await page.getByRole('combobox', { name: 'Toujours mis en avant si coché' }).click()
  await page.getByRole('option', { name: 'À la une' }).click()
  await page.getByRole('button', { name: 'Enregistrer le type' }).click()
  await expect(page.getByText('Type enregistré.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Pages sur le site (français)')).toHaveValue('/fr/projets/{slug}')
  await expect(page.getByRole('combobox', { name: 'Toujours mis en avant si coché' })).toHaveText(
    'À la une',
  )
})
