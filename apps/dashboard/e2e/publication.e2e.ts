import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('publier, modifier, annuler, dépublier, supprimer puis rattraper un projet', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Vitrine',
    slug: 'vitrine',
    siteUrl: 'https://vitrine.fr',
  })
  await admin.call('post', '/spaces/vitrine/types', {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [
      { key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true },
      {
        key: 'type',
        label: 'Type de projet',
        type: 'choice',
        required: true,
        translatable: false,
        choices: [{ key: 'perso', fr: 'Projet perso', en: 'Personal project' }],
      },
    ],
  })
  // Brouillon commencé en anglais seulement, sans identifiant d'URL.
  const entry = await admin.call('post', '/spaces/vitrine/types/projets/entries')
  await admin.call('patch', `/spaces/vitrine/types/projets/entries/${entry.id}`, {
    version: entry.version,
    data: { titre: { en: 'This portfolio' } },
  })
  await admin.close()

  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.accept()
  })

  await page.goto(`/espaces/vitrine/contenu/projets/${entry.id}`)
  const header = page.getByRole('main').locator('header')
  await expect(header).toContainText('Brouillon')

  // Publication refusée : chaque champ fautif est signalé, le focus va sur le premier.
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('3 champs à corriger')
  await expect(page.getByLabel('Identifiant d’URL')).toBeFocused()
  await expect(page.getByLabel('Identifiant d’URL')).toHaveAccessibleDescription(
    /Identifiant d’URL obligatoire pour publier/,
  )
  await expect(page.getByLabel('Titre (français)')).toHaveAttribute('aria-invalid', 'true')

  // Les erreurs disparaissent à mesure qu'on corrige ; l'identifiant suit le titre.
  await page.getByLabel('Titre (français)').fill('Ce portfolio')
  await expect(page.getByLabel('Identifiant d’URL')).toHaveValue('ce-portfolio')
  await expect(page.getByLabel('Titre (français)')).not.toHaveAttribute('aria-invalid')
  await page.getByRole('combobox', { name: 'Type de projet' }).click()
  await page.getByRole('option', { name: 'Projet perso' }).click()

  // Version anglaise complète : pas de confirmation.
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Entrée publiée.')
  await expect(header).toContainText('Publié')
  expect(dialogs).toEqual([])

  // Une correction reste à part : le site garde l'ancienne version.
  await page.getByLabel('Titre (français)').fill('Ce portfolio, version 2')
  await expect(header).toContainText('Modifications non publiées')
  await page.getByRole('button', { name: 'Annuler les modifications' }).click()
  await expect(page.getByRole('status')).toContainText('Modifications annulées')
  await expect(page.getByLabel('Titre (français)')).toHaveValue('Ce portfolio')
  await expect(header).not.toContainText('Modifications non publiées')

  // Version anglaise retirée : la publication des modifications demande confirmation.
  await page.getByLabel('Titre (anglais)').fill('')
  await expect(header).toContainText('EN incomplet')
  await page.getByRole('button', { name: 'Publier les modifications' }).click()
  await expect(page.getByRole('status')).toHaveText('Modifications publiées.')
  expect(dialogs.at(-1)).toContain('La version anglaise est incomplète')

  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Dépublier' }).click()
  await expect(page.getByRole('status')).toContainText('Entrée dépubliée')
  await expect(header).toContainText('Brouillon')

  // Supprimer met à la corbeille, sans confirmation ; la liste propose « Annuler ».
  const asked = dialogs.length
  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL('/espaces/vitrine/contenu/projets')
  expect(dialogs).toHaveLength(asked)
  await expect(page.getByText('Aucune entrée pour l’instant.')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('« Ce portfolio » mis à la corbeille.')
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('status')).toHaveText('« Ce portfolio » restauré en brouillon.')
  await expect(page.getByRole('link', { name: 'Ce portfolio' })).toBeVisible()
})
