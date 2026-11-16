import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('restaurer depuis la corbeille, puis la vider', async ({ browser, page }) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Grenier',
    slug: 'grenier',
    siteUrl: 'https://grenier.fr',
  })
  await admin.call('post', '/spaces/grenier/types', {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [{ key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true }],
  })
  const base = '/spaces/grenier/types/projets/entries'
  for (const titre of ['Jeu de plateau', 'Vieux site']) {
    const entry = await admin.call('post', base)
    await admin.call('patch', `${base}/${entry.id}`, {
      version: entry.version,
      data: { titre: { fr: titre } },
    })
    await admin.call('delete', `${base}/${entry.id}`)
  }
  await admin.close()

  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.accept()
  })

  await page.goto('/espaces/grenier/contenu')
  await page.getByRole('link', { name: 'Corbeille (2)' }).click()
  await expect(page).toHaveURL('/espaces/grenier/contenu/corbeille')
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('main').getByRole('listitem').first()).toContainText(
    'définitivement dans 30 jours',
  )

  await page.getByRole('button', { name: 'Restaurer « Projets › Jeu de plateau »' }).click()
  await expect(page.getByRole('status')).toContainText('« Jeu de plateau » restauré en brouillon.')
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)

  // Super-admin : vider la corbeille, après confirmation.
  await page.getByRole('button', { name: 'Vider la corbeille' }).click()
  expect(dialogs.at(-1)).toContain('Vider la corbeille ?')
  await expect(page.getByText('La corbeille est vide.')).toBeVisible()

  await page.goto('/espaces/grenier/contenu/projets')
  await expect(page.getByRole('link', { name: 'Jeu de plateau' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Vieux site' })).toHaveCount(0)
})
