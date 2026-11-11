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

  // Champ texte, choisi dans la grille des types : l'identifiant suit le libellé.
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.getByRole('button', { name: /^Texte court/ }).click()
  await expect(page.locator('#field-0-label')).toBeFocused()
  await page.keyboard.type('Titre du projet')
  await expect(page.locator('#field-0-key')).toHaveValue('titre_du_projet')
  await page.getByLabel('Obligatoire').check()
  await page.getByLabel('Une valeur en français et une en anglais').check()

  // L'identifiant est un réglage avancé, replié.
  await expect(page.locator('#field-0-key')).toBeHidden()

  // Liste de choix.
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.getByRole('button', { name: /^Liste de choix/ }).click()
  await page.locator('#field-1-label').fill('Type de projet')
  // L'aperçu tient avec une structure incomplète (un choix encore vide), et se pilote au clavier.
  await page.getByRole('tab', { name: 'Champs' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Aperçu' })).toBeFocused()
  await expect(page.getByRole('combobox', { name: 'Type de projet' })).toBeVisible()
  await page.getByRole('tab', { name: 'Champs' }).click()
  await page.getByLabel('Libellé français').fill('Projet perso')
  await page.getByLabel('Libellé anglais').fill('Personal project')

  // Groupe répétable avec un sous-champ ; un groupe n'en contient pas d'autre.
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.getByRole('button', { name: /^Groupe répétable/ }).click()
  await page.locator('#field-2-label').fill('Contraintes')
  await page.getByRole('button', { name: 'Ajouter un sous-champ' }).click()
  await expect(page.getByRole('button', { name: /^Groupe répétable/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Texte court/ }).click()
  await page.locator('#field-2-sub-0-label').fill('Titre')

  await page.getByRole('button', { name: 'Créer le type' }).click()
  await expect(page).toHaveURL('/espaces/atelier/structure/projets')
  await expect(page.getByRole('status')).toHaveText('Type enregistré.')

  // Après rechargement : tout est là, et les identifiants sont figés.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projets')
  await expect(page.getByText('Collection, identifiant projets')).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Titre du projet' })).toContainText('Obligatoire')
  await page.getByRole('button', { name: 'Titre du projet', exact: true }).click()
  await expect(page.locator('#field-0-key')).toBeDisabled()
  await expect(page.getByRole('listitem', { name: 'Contraintes' })).toContainText('1 sous-champ')

  // L'aperçu montre l'éditeur d'entrée, désactivé, sous-champs du groupe compris.
  await page.getByRole('tab', { name: 'Aperçu' }).click()
  await expect(page.getByLabel('Titre du projet (français)')).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'Titre', exact: true })).toBeDisabled()

  // La vue d'ensemble liste le type et ses champs.
  await page.getByRole('main').getByRole('link', { name: 'Structure' }).click()
  await expect(page.getByRole('row', { name: /Projets.*3 champs/ })).toBeVisible()
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
  await page.getByRole('main').getByRole('link', { name: 'CV' }).click()
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

test('un brouillon de nouveau type ne remplace pas un type existant au même identifiant', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Cahier',
    slug: 'cahier',
    siteUrl: 'https://cahier.fr',
  })
  await admin.call('post', '/spaces/cahier/types', {
    slug: 'cv',
    kind: 'single',
    name: 'CV',
    entryLabel: null,
    fields: [{ key: 'tag', label: 'Tag', type: 'text', required: false, translatable: false }],
  })
  await admin.close()

  // Brouillon dont l'identifiant reprend celui du type existant, abandonné pour ce type.
  await page.goto('/espaces/cahier/structure/nouveau')
  await page.getByLabel('Nom au pluriel').fill('Cv')
  await expect(page.getByLabel('Identifiant', { exact: true })).toHaveValue('cv')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('main').getByRole('link', { name: 'Structure' }).click()
  await page.getByRole('main').getByRole('link', { name: 'CV', exact: true }).click()
  await expect(page).toHaveURL('/espaces/cahier/structure/cv')
  await expect(page.getByLabel('Nom au pluriel')).toHaveValue('CV')
  await expect(page.getByRole('listitem', { name: 'Tag' })).toBeVisible()

  // Un champ ajouté dont l'identifiant reprend celui d'un champ enregistré reste modifiable.
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.getByRole('button', { name: /^Texte court/ }).click()
  await page.keyboard.type('Tag')
  await expect(page.locator('#field-1-key')).toHaveValue('tag')
  await expect(page.locator('#field-1-key')).toBeEnabled()
})
