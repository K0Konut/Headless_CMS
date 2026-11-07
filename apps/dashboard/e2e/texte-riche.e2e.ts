import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

test('saisir du texte riche : mises en forme, lien, enregistrement et publication', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', { name: 'Plume', slug: 'plume', siteUrl: 'https://plume.fr' })
  await admin.call('post', '/spaces/plume/types', {
    slug: 'qui-je-suis',
    kind: 'single',
    name: 'Qui je suis',
    entryLabel: null,
    fields: [
      { key: 'texte', label: 'Texte', type: 'richtext', required: true, translatable: true },
    ],
  })
  await admin.close()

  // Aucune violation de la CSP (styles ou scripts en ligne) pendant la saisie.
  const errors: string[] = []
  page.on('console', (m) => m.text().includes('Content Security Policy') && errors.push(m.text()))
  page.on('dialog', (dialog) =>
    dialog.type() === 'prompt' ? dialog.accept('https://exemple.fr') : dialog.accept(),
  )

  await page.goto('/espaces/plume/contenu/qui-je-suis')
  const fr = page.getByRole('textbox', { name: 'Texte (français)' })
  await expect(fr).toBeVisible()

  // Publication refusée tant que le texte français est vide.
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(fr).toBeFocused()
  await expect(fr).toHaveAttribute('aria-invalid', 'true')

  await page.keyboard.type('Développeur ')
  const tools = page.getByRole('toolbar', { name: 'Mise en forme : Texte (français)' })
  await tools.getByRole('button', { name: 'Gras' }).click()
  await expect(tools.getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('web')
  await tools.getByRole('button', { name: 'Gras' }).click()
  await page.keyboard.press('Enter')
  await tools.getByRole('button', { name: 'Liste à puces' }).click()
  await page.keyboard.type('Vue 3')
  await page.keyboard.press('Shift+Home')
  await tools.getByRole('button', { name: 'Lien' }).click()

  await expect(fr.locator('strong')).toHaveText('web')
  await expect(fr.locator('ul li')).toHaveText('Vue 3')
  await expect(fr.locator('a')).toHaveAttribute('href', 'https://exemple.fr')
  await expect(fr).not.toHaveAttribute('aria-invalid')
  await expect(page.getByText(/^Enregistré à/)).toBeVisible()

  await page.reload()
  await expect(fr.locator('strong')).toHaveText('web')
  await expect(fr.locator('a')).toHaveText('Vue 3')
  await expect(page.getByRole('textbox', { name: 'Texte (anglais)' })).toHaveAttribute('lang', 'en')

  // Anglais vide : publication après la confirmation « version anglaise incomplète ».
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Entrée publiée.')
  expect(errors).toEqual([])
})
