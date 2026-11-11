import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

// Page d'aperçu d'un faux site, sur une autre origine que le dashboard : elle lit l'entrée par
// l'API, en CORS, comme le ferait le portfolio.
const PREVIEW_URL = 'http://127.0.0.1:4999/apercu'

test('régler l’URL d’aperçu, prévisualiser un brouillon sur le site et copier le lien', async ({
  browser,
  page,
  baseURL,
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
    fields: [{ key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true }],
  })
  const entry = await admin.call('post', '/spaces/vitrine/types/projets/entries')
  await admin.close()

  await page.context().route(`${PREVIEW_URL}*`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><p id="out">Chargement</p><script>
        const token = new URLSearchParams(location.search).get('dashility-preview')
        fetch('${baseURL}/api/preview/' + token + '?locale=fr')
          .then((res) => res.json())
          .then((body) => (out.textContent = body.fields ? body.fields.titre : body.error.code))
      </script>`,
    }),
  )

  // Sans URL d'aperçu : pas de bouton, mais le super-admin est guidé vers les réglages.
  await page.goto(`/espaces/vitrine/contenu/projets/${entry.id}`)
  await page.getByRole('textbox', { name: 'Titre (français)' }).fill('Mon brouillon')
  await expect(page.getByRole('button', { name: /Prévisualiser/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Configurer la prévisualisation' }).click()
  await expect(page).toHaveURL('/espaces/vitrine/reglages#integration')

  await page.getByLabel('URL d’aperçu').fill('http://exemple.fr/apercu')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).last().click()
  await expect(page.getByText('L’URL d’aperçu doit être en https')).toBeVisible()
  await page.getByLabel('URL d’aperçu').fill(PREVIEW_URL)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).last().click()
  await expect(page.getByText('URL d’aperçu enregistrée.')).toBeVisible()

  // « Tester » : un jeton d'essai, auquel la page répond « lien invalide ».
  const [test] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: /Tester/ }).click(),
  ])
  await expect(test.locator('#out')).toHaveText('preview_not_found')
  await test.close()

  // Le brouillon s'ouvre dans un nouvel onglet, sur la page d'aperçu du site.
  await page.goto(`/espaces/vitrine/contenu/projets/${entry.id}`)
  const [preview] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: /Prévisualiser/ }).click(),
  ])
  await expect(preview).toHaveURL(/^http:\/\/127\.0\.0\.1:4999\/apercu\?dashility-preview=/)
  await expect(preview.locator('#out')).toHaveText('Mon brouillon')
  await preview.close()

  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Copier le lien d’aperçu' }).click()
  await expect(page.getByText(/Lien d’aperçu (copié, )?valable jusqu’au/)).toBeVisible()
})
