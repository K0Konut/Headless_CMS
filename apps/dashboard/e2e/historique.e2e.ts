import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('ouvrir une ancienne version en lecture seule, puis la restaurer dans le brouillon', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Histoire',
    slug: 'histoire',
    siteUrl: 'https://histoire.fr',
  })
  await admin.call('post', '/spaces/histoire/types', {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [{ key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true }],
  })
  // Deux publications : deux versions.
  const base = '/spaces/histoire/types/projets/entries'
  let entry = await admin.call('post', base)
  for (const titre of ['Version un', 'Version deux']) {
    entry = await admin.call('patch', `${base}/${entry.id}`, {
      version: entry.version,
      data: { titre: { fr: titre, en: titre } },
      slug: 'projet',
    })
    entry = await admin.call('post', `${base}/${entry.id}/publish`, { version: entry.version })
  }
  await admin.close()

  await page.goto(`/espaces/histoire/contenu/projets/${entry.id}`)
  await page.getByRole('button', { name: 'Historique' }).click()
  const panel = page.getByRole('dialog', { name: 'Historique' })
  await expect(panel.getByRole('listitem')).toHaveCount(2)
  await expect(panel.getByRole('listitem').first()).toContainText('Version 2')
  await expect(panel.getByRole('listitem').first()).toContainText('en ligne')
  await panel.getByRole('button', { name: /Version 1/ }).click()

  // Lecture seule : le contenu de la version, champs désactivés.
  await expect(panel).toBeHidden()
  await expect(page.getByText('Version 1 · publiée le')).toBeVisible()
  await expect(page.getByLabel('Titre (français)')).toHaveValue('Version un')
  await expect(page.getByLabel('Titre (français)')).toBeDisabled()

  await page.getByRole('button', { name: 'Restaurer cette version' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Version 1 restaurée dans le brouillon. Relisez-la, puis publiez.',
  )
  await expect(page.getByLabel('Titre (français)')).toBeEnabled()
  await expect(page.getByLabel('Titre (français)')).toHaveValue('Version un')
  await expect(page.getByRole('main').locator('header')).toContainText('Modifications non publiées')
})
