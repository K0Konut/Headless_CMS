import { expect, test } from '@playwright/test'
import { PASSWORD } from './fixtures'

const NO_SESSION = { storageState: { cookies: [], origins: [] } }

test('créer un espace, puis inviter un membre qui ne voit que « Ne pas me compter »', async ({
  browser,
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  // Nouvel espace : le slug suit le nom.
  await page.goto('/espaces/nouveau')
  await page.getByLabel('Nom').fill('Journal de bord')
  await expect(page.getByLabel('Slug')).toHaveValue('journal-de-bord')
  await page.getByLabel('URL du site').fill('https://journal.fr/accueil')
  await page.getByRole('button', { name: 'Créer l’espace' }).click()

  // Arrivée sur l'intégration, étape suivante du parcours.
  await expect(page).toHaveURL('/espaces/journal-de-bord/reglages#integration')
  await expect(page.locator('#integration')).toBeInViewport()
  await expect(page.getByLabel('Identifiant public', { exact: true })).toHaveValue(/^pk_/)
  await expect(page.getByLabel('Extrait d’installation', { exact: true })).toContainText(
    'initAnalytics',
  )
  await expect(page.getByLabel('URL du site')).toHaveValue('https://journal.fr')

  // Invitation : lien affiché, copié, transmis à la main.
  await page.getByLabel('Email', { exact: true }).fill('marc@exemple.fr')
  await page.getByRole('button', { name: 'Inviter un membre' }).click()
  const link = page.getByLabel('Lien d’invitation pour marc@exemple.fr', { exact: true })
  await expect(link).toHaveValue(/\/invitation\//)
  await page
    .getByRole('button', { name: 'Copier : Lien d’invitation pour marc@exemple.fr' })
    .click()
  await expect(page.getByText('Copié', { exact: true })).toBeVisible()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toBe(await link.inputValue())
  await expect(page.getByRole('row', { name: /marc@exemple\.fr.*Invité/ })).toBeVisible()

  // Le membre accepte, puis ne voit que sa section des réglages.
  const memberContext = await browser.newContext(NO_SESSION)
  const member = await memberContext.newPage()
  await member.goto(url)
  await member.getByLabel('Nouveau mot de passe').fill(PASSWORD)
  await member.getByLabel('Confirmer').fill(PASSWORD)
  await member.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(member).toHaveURL('/espaces/journal-de-bord/analytics')
  await member.getByRole('link', { name: 'Réglages' }).click()
  await expect(member.getByRole('heading', { name: 'Ne pas me compter' })).toBeVisible()
  await expect(member.getByRole('link', { name: /m’exclure/ })).toHaveAttribute(
    'href',
    'https://journal.fr/?cms-ignore=1',
  )
  for (const hidden of ['Général', 'Membres', 'Intégration', 'Supprimer l’espace']) {
    await expect(member.getByRole('heading', { name: hidden })).toHaveCount(0)
  }
  await member.goto('/espaces/nouveau')
  await expect(member.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
  await memberContext.close()

  await page.reload()
  await expect(page.getByRole('row', { name: /marc@exemple\.fr.*Actif/ })).toBeVisible()
})

test('renommer le slug, puis supprimer l’espace', async ({ page }) => {
  await page.goto('/espaces/nouveau')
  await page.getByLabel('Nom').fill('Brouillon')
  await page.getByLabel('URL du site').fill('https://brouillon.fr')
  await page.getByRole('button', { name: 'Créer l’espace' }).click()
  await expect(page).toHaveURL(/\/espaces\/brouillon\/reglages/)

  const general = page.getByRole('region', { name: 'Général' })
  await general.getByLabel('Slug').fill('archive')
  await general.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL('/espaces/archive/reglages')
  await expect(general.getByRole('status')).toHaveText('Modifications enregistrées.')

  const danger = page.getByRole('region', { name: 'Supprimer l’espace' })
  const button = danger.getByRole('button', { name: 'Supprimer l’espace' })
  await expect(button).toBeDisabled()
  await danger.getByLabel('Pour confirmer').fill('Brouillon')
  await button.click()
  await expect(page).not.toHaveURL(/archive/)
  await page.goto('/espaces/archive/analytics')
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
})

test('changer d’espace depuis les réglages affiche les membres du nouvel espace', async ({
  page,
}) => {
  // lea@exemple.fr est membre de Blog (parcours.e2e.ts), pas de Portfolio.
  await page.goto('/espaces/blog/reglages')
  await expect(page.getByRole('row', { name: /lea@exemple\.fr/ })).toBeVisible()

  // Navigation interne : la page des réglages est réutilisée par le routeur.
  await page.getByRole('button', { name: /Changer d’espace/ }).click()
  await page.getByRole('menuitem', { name: 'Portfolio' }).click()
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page).toHaveURL('/espaces/portfolio/reglages')
  await expect(page.getByRole('region', { name: 'Membres' })).toBeVisible()
  await expect(page.getByRole('row', { name: /lea@exemple\.fr/ })).toHaveCount(0)
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Portfolio')
})
