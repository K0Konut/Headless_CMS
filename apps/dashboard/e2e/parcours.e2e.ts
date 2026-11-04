import { expect, test } from '@playwright/test'
import { ADMIN, PASSWORD, adminApi, login } from './fixtures'

test.describe('sans session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('connexion au clavier, puis retour à l’écran demandé', async ({ page }) => {
    await page.goto('/espaces/blog/analytics')
    await expect(page).toHaveURL(/\/connexion\?retour=/)

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Email')).toBeFocused()
    await page.keyboard.type(ADMIN)
    await page.keyboard.press('Tab')
    await page.keyboard.type('faux-mot-de-passe')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('Email ou mot de passe incorrect')

    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/espaces/blog/analytics')
    await expect(page).toHaveTitle('Analytics · Blog · CMS')
  })

  test('un invité crée son compte et ne voit que son espace', async ({ browser, page }) => {
    const admin = await adminApi(browser)
    const { token } = await admin.call('post', '/spaces/blog/invitations', {
      email: 'lea@exemple.fr',
    })
    await admin.close()

    await page.goto(`/invitation/${token}`)
    await expect(page.getByRole('heading', { name: 'Rejoindre Blog' })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue('lea@exemple.fr')

    await page.getByLabel('Nouveau mot de passe').fill(PASSWORD)
    await page.getByLabel('Confirmer').fill('autre-chose-encore')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByRole('alert')).toHaveText('Les deux mots de passe ne correspondent pas')

    await page.getByLabel('Confirmer').fill(PASSWORD)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page).toHaveURL('/espaces/blog/analytics')

    // Un seul espace : pas de sélecteur. L'autre espace n'existe pas pour ce compte.
    await expect(page.getByRole('button', { name: /Changer d’espace/ })).toHaveCount(0)
    await page.goto('/espaces/portfolio/analytics')
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()

    // Le lien ne sert qu'une fois.
    await page.goto(`/invitation/${token}`)
    await expect(page.getByText('Ce lien n’est plus valide')).toBeVisible()
  })
})

test('le lien d’évitement mène au contenu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Aller au contenu' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#contenu')).toBeFocused()
})

test('déconnexion depuis le menu du compte', async ({ browser }) => {
  // Session à part : se déconnecter fermerait celle partagée par les autres tests.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/connexion')
  await login(page, ADMIN)
  await page.getByRole('button', { name: ADMIN }).click()
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL('/connexion')

  await page.goto('/compte')
  await expect(page).toHaveURL(/\/connexion\?retour=\/compte/)
  await context.close()
})

test('changer de mot de passe depuis Mon compte', async ({ page }) => {
  await page.goto('/compte')

  await page.getByLabel('Mot de passe actuel').fill('pas-le-bon-mot-de-passe')
  await page.getByLabel('Nouveau mot de passe').fill('nouveau-mot-de-passe')
  await page.getByLabel('Confirmer').fill('nouveau-mot-de-passe')
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect(page.getByRole('alert')).toHaveText('Mot de passe actuel incorrect')
  // Une erreur sur ce champ ne déconnecte pas.
  await expect(page).toHaveURL('/compte')

  await page.getByLabel('Mot de passe actuel').fill(PASSWORD)
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect(page.getByRole('status')).toContainText('Mot de passe modifié')

  // Remet le mot de passe d'origine pour les autres tests.
  await page.getByLabel('Mot de passe actuel').fill('nouveau-mot-de-passe')
  await page.getByLabel('Nouveau mot de passe').fill(PASSWORD)
  await page.getByLabel('Confirmer').fill(PASSWORD)
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect(page.getByRole('status')).toContainText('Mot de passe modifié')
})

test('un espace créé après le chargement du dashboard est accessible sans recharger', async ({
  browser,
  page,
}) => {
  await page.goto('/espaces/portfolio/analytics')
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', { name: 'Docs', slug: 'docs', siteUrl: 'https://docs.fr' })
  await admin.close()

  // Navigation interne, comme un lien du dashboard : pas de rechargement de la page.
  await page.evaluate(() => {
    history.pushState({}, '', '/espaces/docs/analytics')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveTitle('Analytics · Docs · CMS')
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0)
})
