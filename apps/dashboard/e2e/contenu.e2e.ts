import { type Browser, expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

const text = (key: string, label: string, required = true) => ({
  key,
  label,
  type: 'text',
  required,
  translatable: true,
})

/** Espace avec un type « Projets » et une page unique « CV ». */
async function setup(browser: Browser, slug: string) {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', { name: slug, slug, siteUrl: `https://${slug}.fr` })
  await admin.call('post', `/spaces/${slug}/types`, {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [
      text('titre', 'Titre'),
      {
        key: 'type',
        label: 'Type de projet',
        type: 'choice',
        required: true,
        translatable: false,
        choices: [{ key: 'perso', fr: 'Projet perso', en: 'Personal project' }],
      },
      { key: 'stack', label: 'Stack', type: 'list', required: false, translatable: false },
      {
        key: 'contraintes',
        label: 'Contraintes',
        type: 'group',
        required: false,
        translatable: false,
        fields: [text('nom', 'Nom')],
      },
    ],
  })
  await admin.call('post', `/spaces/${slug}/types`, {
    slug: 'cv',
    kind: 'single',
    name: 'CV',
    entryLabel: null,
    fields: [text('accroche', 'Accroche', false)],
  })
  return admin
}

test('ajouter un projet : saisie FR/EN enregistrée toute seule, retrouvée après rechargement', async ({
  browser,
  page,
}) => {
  const admin = await setup(browser, 'atelier-contenu')
  await admin.close()

  await page.goto('/espaces/atelier-contenu/analytics')
  await page.getByRole('link', { name: 'Contenu', exact: true }).click()
  await expect(
    page.getByRole('main').getByRole('listitem').filter({ hasText: 'Projets' }),
  ).toContainText('0 entrée')
  // Les types sont aussi dans la barre latérale.
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Projets' })).toBeVisible()
  // On ajoute un projet depuis Contenu, sans passer par la liste.
  await page.getByRole('button', { name: 'Ajouter un projet' }).click()
  await expect(page).toHaveURL(/\/contenu\/projets\/[0-9a-f-]{36}$/)

  await page.getByLabel('Titre (français)').fill('Ce portfolio')
  await page.getByLabel('Titre (anglais)').fill('This portfolio')
  await expect(page.getByLabel('Identifiant d’URL')).toHaveValue('ce-portfolio')
  await page.getByRole('combobox', { name: 'Type de projet' }).click()
  await page.getByRole('option', { name: 'Projet perso' }).click()
  await page.getByLabel('Stack : nouvelle valeur').fill('Vue')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Ajouter un élément à « Contraintes »' }).click()
  await page.getByLabel('Nom (français)').fill('Budget : 0 €')
  await expect(page.getByText(/^Enregistré à/)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ce portfolio' })).toBeVisible()
  await expect(page.getByLabel('Titre (anglais)')).toHaveValue('This portfolio')
  await expect(page.getByRole('list', { name: 'Stack' })).toContainText('Vue')
  // Les éléments d'un groupe sont repliés, leur titre dans l'en-tête.
  await expect(page.getByLabel('Nom (français)')).toBeHidden()
  await page.getByRole('button', { name: 'Contraintes 1 · Budget : 0 €' }).click()
  await expect(page.getByLabel('Nom (français)')).toHaveValue('Budget : 0 €')
  // Une seule langue à la fois, sur toute la largeur.
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByLabel('Titre (français)')).toBeHidden()
  await page.getByRole('button', { name: 'Côte à côte' }).click()
  await expect(page.getByLabel('Titre (français)')).toBeVisible()
  // La contrainte n'a pas de nom anglais : l'entrée sera masquée sur le site en anglais.
  await expect(page.getByText('EN incomplet')).toBeVisible()

  await page.getByRole('main').getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('row', { name: /Ce portfolio.*Brouillon/ })).toBeVisible()
})

test('une entrée modifiée ailleurs n’est pas écrasée', async ({ browser, page }) => {
  const admin = await setup(browser, 'atelier-conflit')
  await admin.close()

  await page.goto('/espaces/atelier-conflit/contenu/cv')
  await expect(page.getByRole('heading', { name: 'CV' })).toBeVisible()

  // Un autre onglet enregistre d'abord.
  const other = await page.context().newPage()
  await other.goto('/espaces/atelier-conflit/contenu/cv')
  await other.getByLabel('Accroche (français)').fill('Version de l’autre onglet')
  await expect(other.getByText(/^Enregistré à/)).toBeVisible()
  await other.close()

  await page.getByLabel('Accroche (français)').fill('Ma version')
  await expect(page.getByRole('alert')).toContainText('modifiée ailleurs')
  await page.getByRole('button', { name: 'Recharger la dernière version' }).click()
  await expect(page.getByLabel('Accroche (français)')).toHaveValue('Version de l’autre onglet')
})

test('supprimer un champ utilisé demande une confirmation', async ({ browser, page }) => {
  const admin = await setup(browser, 'atelier-structure')
  const entry = await admin.call('post', '/spaces/atelier-structure/types/projets/entries')
  await admin.call('patch', `/spaces/atelier-structure/types/projets/entries/${entry.id}`, {
    version: 1,
    data: { stack: ['Vue'] },
  })
  await admin.close()

  await page.goto('/espaces/atelier-structure/structure/projets')
  await page.getByRole('button', { name: 'Supprimer « Stack »' }).click()
  let message = ''
  page.once('dialog', (dialog) => {
    message = dialog.message()
    void dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Enregistrer le type' }).click()
  await expect
    .poll(() => message)
    .toContain('« Stack » seront supprimées des entrées qui en ont (le type en compte 1 entrée)')
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('un identifiant d’URL déjà pris n’empêche pas d’enregistrer le contenu', async ({
  browser,
  page,
}) => {
  const admin = await setup(browser, 'atelier-doublon')
  const first = await admin.call('post', '/spaces/atelier-doublon/types/projets/entries')
  await admin.call('patch', `/spaces/atelier-doublon/types/projets/entries/${first.id}`, {
    version: 1,
    data: { titre: { fr: 'Test' } },
    slug: 'test',
  })
  await admin.close()

  await page.goto('/espaces/atelier-doublon/contenu/projets')
  await page.getByRole('button', { name: 'Ajouter un projet' }).click()
  await page.getByLabel('Titre (français)').fill('Test')
  await expect(
    page.getByText('Cet identifiant d’URL est déjà utilisé par une autre entrée'),
  ).toBeVisible()
  await expect(page.getByText(/^Enregistré à/)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Titre (français)')).toHaveValue('Test')

  // Le bouton « Ajouter » ressert au retour à la liste.
  await page.getByRole('main').getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('button', { name: 'Ajouter un projet' })).toBeEnabled()
})

test('publier ouvre l’élément replié et la langue masquée qui ont une erreur', async ({
  browser,
  page,
}) => {
  const admin = await setup(browser, 'atelier-repli')
  await admin.close()

  await page.goto('/espaces/atelier-repli/contenu/projets')
  await page.getByRole('button', { name: 'Ajouter un projet' }).click()
  await page.getByLabel('Titre (français)').fill('Ce portfolio')
  await page.getByRole('combobox', { name: 'Type de projet' }).click()
  await page.getByRole('option', { name: 'Projet perso' }).click()
  await page.getByRole('button', { name: 'Ajouter un élément à « Contraintes »' }).click()
  await page.getByRole('button', { name: 'Contraintes 1', exact: true }).click()
  await expect(page.getByLabel('Nom (français)')).toBeHidden()
  // L'erreur est en français alors que seul l'anglais est affiché : l'éditeur bascule.
  await page.getByRole('button', { name: 'English' }).click()

  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(page.getByLabel('Nom (français)')).toBeFocused()
})
