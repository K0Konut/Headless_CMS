import { expect, test } from '@playwright/test'
import { adminApi } from './fixtures'

const title = { key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true }

test('programmer une publication fige l’entrée ; « Modifier l’entrée » annule la programmation', async ({
  browser,
  page,
}) => {
  const admin = await adminApi(browser)
  await admin.call('post', '/spaces', {
    name: 'Agenda',
    slug: 'agenda',
    siteUrl: 'https://agenda.fr',
  })
  await admin.call('post', '/spaces/agenda/types', {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [title],
  })
  const entry = await admin.call('post', '/spaces/agenda/types/projets/entries')
  await admin.call('patch', `/spaces/agenda/types/projets/entries/${entry.id}`, {
    version: 1,
    data: { titre: { fr: 'Ce portfolio', en: 'This portfolio' } },
    slug: 'ce-portfolio',
  })
  await admin.close()

  await page.goto(`/espaces/agenda/contenu/projets/${entry.id}`)
  await page.getByRole('button', { name: 'Programmer…' }).click()
  const panel = page.getByRole('form', { name: 'Programmer la publication' })
  await expect(panel.getByText('heure de Paris')).toBeVisible()
  await expect(panel.getByLabel('Heure')).toHaveValue('09:00')

  // Une heure passée est refusée sur le champ.
  const date = await panel.getByLabel('Date').inputValue()
  await panel.getByLabel('Date').fill('2026-01-01')
  await panel.getByRole('button', { name: 'Programmer', exact: true }).click()
  await expect(panel.getByText('Choisissez une date à venir')).toBeVisible()
  await panel.getByLabel('Date').fill(date)
  await panel.getByRole('button', { name: 'Programmer', exact: true }).click()

  await expect(
    page.getByText(/Publication programmée le .* à 9:00 \(heure de Paris\)/),
  ).toBeVisible()
  await expect(page.getByText(/Programmé le .* à 9:00/)).toBeVisible()
  await expect(page.getByLabel('Titre (français)')).toBeDisabled()
  await expect(page.getByLabel('Identifiant d’URL')).toBeDisabled()

  await page.getByRole('main').getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('row', { name: /Ce portfolio.*Programmé le/ })).toBeVisible()
  await page.getByRole('link', { name: 'Ce portfolio' }).click()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Modifier l’entrée' }).click()
  await expect(page.getByLabel('Titre (français)')).toBeEnabled()
  await expect(page.getByText(/\(heure de Paris\)\. Les champs/)).toHaveCount(0)
  await page.getByLabel('Titre (français)').fill('Ce portfolio, corrigé')
  await expect(page.getByText(/^Enregistré à/)).toBeVisible()
})
