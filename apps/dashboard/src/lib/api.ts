/** Erreur renvoyée par l'API, au format `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

let onUnauthorized: (() => void) | undefined

/** Appelé quand une requête reçoit 401 : la session a expiré ou a été fermée. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

/** Appel JSON à l'API, sur la même origine (le cookie de session part tout seul). */
export async function api<T = void>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    // Toujours JSON : l'API refuse les écritures sans ce Content-Type (protection CSRF).
    headers: { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T

  const payload = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string }
  } | null
  if (res.status === 401) onUnauthorized?.()
  throw new ApiError(
    res.status,
    payload?.error?.code ?? 'error',
    payload?.error?.message ?? 'Le serveur ne répond pas. Réessayez dans un instant.',
  )
}
