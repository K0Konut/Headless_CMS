import { type Browser, type Page, expect } from '@playwright/test'
import { ADMIN_SESSION } from '../playwright.config'

export const ADMIN = 'admin@exemple.fr'
export const PASSWORD = 'motdepasse-solide'

/** Connexion par le formulaire, au clavier. */
export async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.keyboard.press('Enter')
}

/** Appels à l'API avec la session du super-admin, pour préparer les données. */
export async function adminApi(browser: Browser) {
  const context = await browser.newContext({ storageState: ADMIN_SESSION })
  const call = async (method: 'post' | 'delete', path: string, data?: object) => {
    const res = await context.request[method](`/api${path}`, { data: data ?? {} })
    expect(res.ok(), `${method} ${path} : ${res.status()}`).toBe(true)
    return res.status() === 204 ? null : res.json()
  }
  return { call, close: () => context.close() }
}
