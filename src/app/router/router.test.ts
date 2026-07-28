import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { clearCsrfToken } from '@/shared/api'
import { server } from '@/shared/lib/testing'

const apiOrigin = 'http://localhost:3000'

describe('application router session guard', () => {
  afterEach(async () => {
    const { queryClient } = await import('../config/query-client')
    clearCsrfToken()
    queryClient.clear()
  })

  it('revalidates a cached session before allowing the protected route', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/authentication-required',
            title: 'Authentication required',
            status: 401,
            detail: 'Valid authentication is required for this request.',
            instance: 'urn:request:expired-session',
            code: 'AUTHENTICATION_REQUIRED',
            requestId: 'expired-session',
          },
          {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    const [{ queryClient }, { currentSessionQueryKey }] = await Promise.all([
      import('../config/query-client'),
      import('@/entities/session'),
    ])
    queryClient.setQueryData(currentSessionQueryKey(), {
      userId: 'cached-user',
      normalizedEmail: 'cached@example.com',
      roleKeys: [],
      permissions: [],
    })

    const { router } = await import('./router')
    await router.navigate('/')

    expect(router.state.location.pathname).toBe('/login')
    router.dispose()
  })
})
