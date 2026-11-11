import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('régler le déploiement, publier, voir l’échec et relancer', async ({ browser, page }) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Chantier',
    slug: 'chantier',
    siteUrl: 'https://chantier.fr',
  })
  await admin.call('post', '/spaces/chantier/types', {
    slug: 'a-propos',
    kind: 'single',
    name: 'À propos',
    entryLabel: null,
    fields: [{ key: 'bio', label: 'Bio', type: 'text', required: true, translatable: false }],
  })
  await admin.close()
  page.on('dialog', (dialog) => dialog.accept())

  // Sans URL : l'éditeur le dit, avec un lien vers les réglages pour le super-admin.
  await page.goto('/espaces/chantier/contenu/a-propos')
  await expect(page.getByText('Aucun déploiement configuré')).toBeVisible()
  await page.getByRole('link', { name: 'Régler le déploiement' }).click()
  await expect(page).toHaveURL('/espaces/chantier/reglages#integration')

  // Une adresse en http est refusée ; un site qui ne répond pas sert à voir l'échec.
  await page.getByLabel('URL de déploiement').fill('http://exemple.fr/hook')
  await page.getByLabel('URL de déploiement').press('Enter')
  await expect(page.getByText('Adresse invalide : elle doit commencer par https://')).toBeVisible()
  await page.getByLabel('URL de déploiement').fill('https://127.0.0.1:9/hook')
  await page.getByLabel('Jeton (facultatif)').fill('ghp_secret')
  await page.getByLabel('URL de déploiement').press('Enter')
  await expect(page.getByText('Réglages du déploiement enregistrés.')).toBeVisible()
  await expect(page.getByLabel('Jeton (facultatif)')).toHaveValue('')
  await expect(page.getByLabel('Jeton (facultatif)')).toHaveAttribute(
    'placeholder',
    'Jeton enregistré',
  )
  await page.getByRole('button', { name: 'Lancer un déploiement' }).click()
  await expect(page.getByText('Le déploiement a échoué (le site est injoignable)')).toBeVisible()

  // Publier demande un déploiement, regroupé ; l'éditeur suit l'appel jusqu'à son résultat.
  await page.goto('/espaces/chantier/contenu/a-propos')
  await page.getByRole('textbox', { name: 'Bio' }).fill('Développeur')
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(page.getByText('Déploiement demandé…')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveText(
    /Le déploiement a échoué \(le site est injoignable\)/,
    {
      timeout: 10_000,
    },
  )
  await page.getByRole('button', { name: 'Relancer' }).click()
  await expect(page.getByRole('button', { name: 'Relancer' })).toBeEnabled()
})
