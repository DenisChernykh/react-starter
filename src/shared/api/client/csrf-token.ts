let csrfToken: string | null = null
let pendingCsrfToken: Promise<string> | null = null

export function peekCsrfToken() {
  return csrfToken
}

export function setCsrfToken(token: string) {
  csrfToken = token
}

export function clearCsrfToken() {
  csrfToken = null
  pendingCsrfToken = null
}

export async function getOrFetchCsrfToken(
  fetcher: () => Promise<string>,
): Promise<string> {
  if (csrfToken !== null) return csrfToken
  if (pendingCsrfToken !== null) return pendingCsrfToken

  pendingCsrfToken = fetcher()
    .then((token) => {
      csrfToken = token
      return token
    })
    .finally(() => {
      pendingCsrfToken = null
    })

  return pendingCsrfToken
}
