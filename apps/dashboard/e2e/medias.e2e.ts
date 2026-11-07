import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

// Image PNG de 1 × 1 pixel et PDF minimal.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

test('envoyer une image et un PDF, avec les textes alternatifs, puis publier', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Galerie',
    slug: 'galerie',
    siteUrl: 'https://galerie.fr',
  })
  await admin.call('post', '/spaces/galerie/types', {
    slug: 'accueil',
    kind: 'single',
    name: 'Accueil',
    entryLabel: null,
    fields: [
      { key: 'portrait', label: 'Portrait', type: 'image', required: true, translatable: false },
      { key: 'cv', label: 'CV', type: 'pdf', required: true, translatable: true },
    ],
  })
  await admin.close()
  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/espaces/galerie/contenu/accueil')
  await expect(page.getByRole('button', { name: 'Parcourir : Portrait' })).toBeVisible()

  // Un fichier qui n'est pas une image est refusé avant l'envoi.
  const [imageInput, frInput] = await page.locator('input[type=file]').all()
  await imageInput!.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  })
  await expect(page.getByText('Type de fichier non accepté : JPEG, PNG ou WebP.')).toBeVisible()

  await imageInput!.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG })
  const preview = page.getByRole('main').locator('img')
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await expect(page.getByText('portrait.png, 1 × 1 px.')).toBeVisible()

  await frInput!.setInputFiles({ name: 'CV Léa.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(page.getByText('CV Léa.pdf')).toBeVisible()
  const download = page.getByRole('link', { name: 'Télécharger : CV (français)' })
  await expect(download).toHaveAttribute('href', /\/api\/media\/[0-9a-f-]{36}\/original\.pdf$/)
  await expect(page.getByText(/^Enregistré à/)).toBeVisible()

  // Le texte alternatif français est exigé pour publier ; le focus y va.
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  const altFr = page.getByLabel('Texte alternatif (français)')
  await expect(altFr).toBeFocused()
  await expect(page.getByText('Texte alternatif obligatoire')).toBeVisible()
  await altFr.fill('Léa devant son bureau')
  await page.getByLabel('Texte alternatif (anglais)').fill('Léa at her desk')

  // Après rechargement : l'image, ses textes et le PDF sont là.
  await expect(page.getByText(/^Enregistré à/)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Texte alternatif (anglais)')).toHaveValue('Léa at her desk')
  await expect(page.getByText('CV Léa.pdf')).toBeVisible()

  // Le PDF anglais manque : publication après la confirmation « EN incomplet ».
  await page.getByRole('button', { name: 'Publier', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Entrée publiée.')

  // Remplacer demande confirmation ; retirer vide le champ.
  await page.getByRole('button', { name: 'Retirer : Portrait' }).click()
  await expect(page.getByRole('button', { name: 'Parcourir : Portrait' })).toBeVisible()
  await expect(page.getByRole('main').locator('header')).toContainText('Modifications non publiées')
})
