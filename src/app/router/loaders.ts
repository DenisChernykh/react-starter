import type { LoaderFunction } from 'react-router'
import { redirect } from 'react-router'

import { isProblemCode } from '@/shared/api'

type SessionLoaderDependencies = {
  load: (signal: AbortSignal) => Promise<unknown>
  clear: () => void
}

/**
 * Создаёт loader, который допускает к маршруту только аутентифицированного пользователя.
 *
 * @remarks Передаёт в `load` `AbortSignal` маршрута. При `AUTHENTICATION_REQUIRED`
 * очищает локальную сессию и перенаправляет на login с `returnTo`; отменённые и
 * остальные ошибки пробрасывает в route error boundary.
 */
export function createRequireSessionLoader({
  load,
  clear,
}: SessionLoaderDependencies): LoaderFunction {
  return async ({ request }) => {
    try {
      await load(request.signal)
      return null
    } catch (error) {
      if (request.signal.aborted) throw error
      if (!isProblemCode(error, 'AUTHENTICATION_REQUIRED')) throw error
      clear()
      const url = new URL(request.url)
      const returnTo = `${url.pathname}${url.search}${url.hash}`
      throw redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    }
  }
}

/**
 * Создаёт loader, который перенаправляет аутентифицированного пользователя с публичного маршрута.
 *
 * @remarks Успешная загрузка сессии ведёт на `/`. Ошибка
 * `AUTHENTICATION_REQUIRED` оставляет публичный маршрут доступным, а отменённые
 * и остальные ошибки пробрасываются дальше.
 */
export function createRedirectAuthenticatedLoader({
  load,
}: Pick<SessionLoaderDependencies, 'load'>): LoaderFunction {
  return async ({ request }) => {
    let authenticated = false
    try {
      await load(request.signal)
      authenticated = true
    } catch (error) {
      if (request.signal.aborted) throw error
      if (!isProblemCode(error, 'AUTHENTICATION_REQUIRED')) throw error
    }
    return authenticated ? redirect('/') : null
  }
}
