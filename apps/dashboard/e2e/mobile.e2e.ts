import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

for (const path of [
  '/espaces/portfolio/analytics',
  '/espaces/portfolio/reglages',
  '/espaces/portfolio/structure/nouveau',
  '/espaces/portfolio/contenu',
  '/compte',
]) {
  test(`aucun défilement horizontal sur téléphone : ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
  })
}
