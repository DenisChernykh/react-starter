let csrfToken: string | null = null
let csrfGeneration = 0

type PendingCsrfToken = {
  generation: number
  promise: Promise<string>
}

let pendingCsrfToken: PendingCsrfToken | null = null

export function peekCsrfToken() {
  return csrfToken
}

export function setCsrfToken(token: string) {
  csrfGeneration += 1
  csrfToken = token
  pendingCsrfToken = null
}

export function clearCsrfToken() {
  csrfGeneration += 1
  csrfToken = null
  pendingCsrfToken = null
}

export async function getOrFetchCsrfToken(
  fetcher: () => Promise<string>,
): Promise<string> {
  if (csrfToken !== null) return csrfToken
  if (pendingCsrfToken !== null) return pendingCsrfToken.promise

  const pending: PendingCsrfToken = {
    generation: csrfGeneration,
    promise: fetcher(),
  }
  pending.promise = pending.promise
    .then((token) => {
      if (
        pendingCsrfToken === pending &&
        pending.generation === csrfGeneration
      ) {
        csrfToken = token
      }
      return token
    })
    .finally(() => {
      if (pendingCsrfToken === pending) pendingCsrfToken = null
    })
  pendingCsrfToken = pending

  return pending.promise
}
