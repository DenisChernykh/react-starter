import type { LoaderFunction } from 'react-router'
import { redirect } from 'react-router'

import { isProblemCode } from '@/shared/api'

type SessionLoaderDependencies = {
  load: (signal: AbortSignal) => Promise<unknown>
  clear: () => void
}

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
