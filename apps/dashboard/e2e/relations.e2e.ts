import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('relier un projet à des catégories, puis supprimer une catégorie citée', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Atelier',
    slug: 'atelier',
    siteUrl: 'https://atelier.fr',
  })
  const titre = { key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true }
  await admin.call('post', '/spaces/atelier/types', {
    slug: 'categories',
    kind: 'collection',
    name: 'Catégories',
    entryLabel: 'une catégorie',
    fields: [titre],
  })
  await admin.call('post', '/spaces/atelier/types', {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [
      titre,
      {
        key: 'categories',
        label: 'Catégories',
        type: 'relation',
        required: false,
        translatable: false,
        target: 'categories',
        multiple: true,
      },
    ],
  })
  const create = async (type: string, fr: string, publish: boolean) => {
    const base = `/spaces/atelier/types/${type}/entries`
    let entry = await admin.call('post', base)
    entry = await admin.call('patch', `${base}/${entry.id}`, {
      version: entry.version,
      data: { titre: { fr } },
    })
    if (publish) await admin.call('post', `${base}/${entry.id}/publish`, { version: entry.version })
    return entry.id as string
  }
  const web = await create('categories', 'Web', true)
  await create('categories', 'Data', false)
  const project = await create('projets', 'Dashility', false)
  await admin.close()

  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.accept()
  })

  await page.goto(`/espaces/atelier/contenu/projets/${project}`)
  const search = page.getByRole('combobox', { name: 'Catégories : ajouter une entrée' })
  await search.fill('We')
  await page.getByRole('option', { name: 'Web' }).click()
  await search.fill('Da')
  await page.getByRole('option', { name: /Data/ }).click()

  const chosen = page.getByRole('list', { name: 'Catégories' })
  await expect(chosen.getByRole('listitem')).toHaveText([/Web/, /Data\s*Brouillon/])
  await expect(
    page.getByText('Les entrées en brouillon n’apparaissent pas sur le site.'),
  ).toBeVisible()
  // Enregistré : les étiquettes reviennent au rechargement.
  await expect(page.getByText('Modifications en cours…')).toBeHidden()
  await expect(page.getByText('Enregistrement…')).toBeHidden()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Catégories' }).getByRole('listitem')).toHaveCount(2)

  // Supprimer une catégorie citée demande confirmation.
  await page.goto(`/espaces/atelier/contenu/categories/${web}`)
  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL('/espaces/atelier/contenu/categories')
  expect(dialogs.at(-1)).toContain('« Web » est relié à 1 entrée (Projets › Dashility)')
})
