import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('créer un type avec un choix et un groupe, puis le retrouver figé après rechargement', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Atelier',
    slug: 'atelier',
    siteUrl: 'https://atelier.fr',
  })
  await admin.close()

  // Espace sans type : l'état vide propose d'en créer un.
  await page.goto('/espaces/atelier/analytics')
  await page.getByRole('link', { name: 'Structure' }).click()
  await page.getByRole('link', { name: 'Nouveau type' }).click()
  await expect(page).toHaveURL('/espaces/atelier/structure/nouveau')

  await page.getByLabel('Nom au pluriel').fill('Projets')
  await expect(page.getByLabel('Identifiant', { exact: true })).toHaveValue('projets')
  await page.getByLabel('Une entrée').fill('un projet')

  // Champ texte : l'identifiant suit le libellé.
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await expect(page.locator('#field-0-label')).toBeFocused()
  await page.keyboard.type('Titre du projet')
  await expect(page.locator('#field-0-key')).toHaveValue('titre_du_projet')
  await page.getByLabel('Obligatoire').check()
  await page.getByLabel('Une valeur en français et une en anglais').check()

  // Liste de choix.
  await page.getByLabel('Type du nouveau champ').click()
  await page.getByRole('option', { name: 'Liste de choix' }).click()
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.locator('#field-1-label').fill('Type de projet')
  await page.getByLabel('Libellé français').fill('Projet perso')
  await page.getByLabel('Libellé anglais').fill('Personal project')

  // Groupe répétable avec un sous-champ.
  await page.getByLabel('Type du nouveau champ').click()
  await page.getByRole('option', { name: 'Groupe répétable' }).click()
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.locator('#field-2-label').fill('Contraintes')
  await page.getByRole('button', { name: 'Ajouter un sous-champ' }).click()
  await page.locator('#field-2-sub-0-label').fill('Titre')

  await page.getByRole('button', { name: 'Créer le type' }).click()
  await expect(page).toHaveURL('/espaces/atelier/structure/projets')
  await expect(page.getByRole('status')).toHaveText('Type enregistré.')

  // Après rechargement : tout est là, et les identifiants sont figés.
  await page.reload()
  const nav = page.getByRole('navigation', { name: 'Types de contenu' })
  await expect(nav.getByRole('link', { name: 'Projets' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('listitem', { name: 'Titre du projet' })).toContainText('Obligatoire')
  await page.getByRole('button', { name: 'Titre du projet', exact: true }).click()
  await expect(page.locator('#field-0-key')).toBeDisabled()
  await expect(page.getByLabel('Identifiant', { exact: true }).first()).toBeDisabled()
  await expect(page.getByRole('listitem', { name: 'Contraintes' })).toContainText('1 sous-champ')
})

test('une modification non enregistrée est signalée avant de quitter', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Carnet',
    slug: 'carnet',
    siteUrl: 'https://carnet.fr',
  })
  await admin.call('post', '/spaces/carnet/types', {
    slug: 'cv',
    kind: 'single',
    name: 'CV',
    entryLabel: null,
    fields: [],
  })
  await admin.close()

  await page.goto('/espaces/carnet/structure')
  await expect(page).toHaveURL('/espaces/carnet/structure/cv')
  await page.getByLabel('Nom au pluriel').fill('Curriculum')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page).toHaveURL('/espaces/carnet/structure/cv')

  await page.getByRole('button', { name: 'Annuler les modifications' }).click()
  await expect(page.getByLabel('Nom au pluriel')).toHaveValue('CV')
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page).toHaveURL('/espaces/carnet/reglages')
})
