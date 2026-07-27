import type { LoaderFunction } from 'react-router'
import { redirect } from 'react-router'

import { isProblemCode } from '@/shared/api'

type SessionLoaderDependencies = {
  load: () => Promise<unknown>
  clear: () => void
}

export function createRequireSessionLoader({
  load,
  clear,
}: SessionLoaderDependencies): LoaderFunction {
  return async ({ request }) => {
    try {
      await load()
      return null
    } catch (error) {
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
  return async () => {
    let authenticated = false
    try {
      await load()
      authenticated = true
    } catch (error) {
      if (!isProblemCode(error, 'AUTHENTICATION_REQUIRED')) throw error
    }
    return authenticated ? redirect('/') : null
  }
}
