let csrfToken: string | null = null
let csrfGeneration = 0

type PendingCsrfToken = {
  generation: number
  promise: Promise<string>
}

let pendingCsrfToken: PendingCsrfToken | null = null

/** Возвращает сохранённый CSRF-токен без сетевого запроса. */
export function peekCsrfToken() {
  return csrfToken
}

/** Сохраняет CSRF-токен и отменяет ожидание предыдущего запроса. */
export function setCsrfToken(token: string) {
  csrfGeneration += 1
  csrfToken = token
  pendingCsrfToken = null
}

/** Удаляет CSRF-токен и отменяет ожидающий запрос токена. */
export function clearCsrfToken() {
  csrfGeneration += 1
  csrfToken = null
  pendingCsrfToken = null
}

/** Возвращает сохранённый CSRF-токен или запрашивает его один раз для параллельных вызовов. */
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
