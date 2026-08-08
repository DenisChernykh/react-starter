import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createElement } from 'react'
import { RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/shared/lib/testing'

const apiOrigin = 'http://localhost:3000'
const requestId = 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184'
const authorId = '401deac1-f230-4926-961e-d4c3ac510cec'
const reviewerId = '6a9f79ea-b651-4dc2-870b-c4e9f2da4d58'

const currentUser = {
  userId: reviewerId,
  normalizedEmail: 'reviewer@example.test',
  roleKeys: ['reviewer'],
  permissions: ['approval.requests.decide'],
}

const request = {
  id: requestId,
  title: 'Публикация релиза',
  description: 'Проверить релиз перед публикацией',
  status: 'pending',
  createdByUserId: authorId,
  decidedByUserId: null,
  createdAt: '2026-07-29T06:15:00.000Z',
  decidedAt: null,
}
const account = {
  createdAt: '2026-08-08T08:00:00.000Z',
  email: 'member@example.test',
  emailVerifiedAt: '2026-08-08T08:00:00.000Z',
  id: requestId,
  retiredAt: null,
  revision: 2,
  roleKeys: [],
  state: 'active',
  updatedAt: '2026-08-08T09:00:00.000Z',
}

const activeRouters = new Set<{ dispose: () => void }>()
const activeQueryClients = new Set<{ clear: () => void }>()
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'matchMedia',
)

function authenticationRequired() {
  return HttpResponse.json(
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
  )
}

async function createApplicationRouter(path: string) {
  window.history.replaceState({}, '', path)
  vi.resetModules()
  const [{ router }, { queryClient }, api, session] = await Promise.all([
    import('./router'),
    import('../config/query-client'),
    import('@/shared/api'),
    import('@/entities/session'),
  ])
  activeRouters.add(router)
  activeQueryClients.add(queryClient)
  return { api, queryClient, router, session }
}

function renderApplicationRouter(
  router: Awaited<ReturnType<typeof createApplicationRouter>>['router'],
  queryClient: Awaited<
    ReturnType<typeof createApplicationRouter>
  >['queryClient'],
) {
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(RouterProvider, { router }),
    ),
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  for (const router of activeRouters) router.dispose()
  activeRouters.clear()
  for (const queryClient of activeQueryClients) queryClient.clear()
  activeQueryClients.clear()
  if (originalMatchMediaDescriptor === undefined) {
    Reflect.deleteProperty(window, 'matchMedia')
  } else {
    Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor)
  }
})

describe('application router session guard', () => {
  it('opens invitation acceptance without session or CSRF requests', async () => {
    let sessionRequests = 0
    let csrfRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        sessionRequests += 1
        return HttpResponse.json(currentUser)
      }),
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-token' })
      }),
    )
    const { queryClient, router } = await createApplicationRouter(
      `/auth/accept-invitation#token=${'C'.repeat(43)}`,
    )
    renderApplicationRouter(router, queryClient)

    expect(await screen.findByLabelText('Пароль')).toBeVisible()
    expect(router.state.location.hash).toBe('')
    expect(sessionRequests).toBe(0)
    expect(csrfRequests).toBe(0)
  })

  it('allows token confirmation without a session request', async () => {
    let sessionRequests = 0
    let confirmRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        sessionRequests += 1
        return HttpResponse.json(currentUser)
      }),
      http.post(
        `${apiOrigin}/v1/auth/email-verification/confirm`,
        async ({ request }) => {
          confirmRequests += 1
          expect(await request.json()).toEqual({ token: 'A'.repeat(43) })
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const { queryClient, router } = await createApplicationRouter(
      `/auth/verify-email#token=${'A'.repeat(43)}`,
    )
    renderApplicationRouter(router, queryClient)

    expect(await screen.findByText('Email подтверждён')).toBeVisible()
    expect(sessionRequests).toBe(0)
    expect(confirmRequests).toBe(1)
    expect(router.state.location.hash).toBe('')
  })

  it('opens the reset token route without a session request', async () => {
    let sessionRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        sessionRequests += 1
        return HttpResponse.json(currentUser)
      }),
    )
    const { queryClient, router } = await createApplicationRouter(
      `/auth/reset-password#token=${'B'.repeat(43)}`,
    )
    renderApplicationRouter(router, queryClient)

    expect(await screen.findByLabelText('Новый пароль')).toBeVisible()
    expect(sessionRequests).toBe(0)
    expect(router.state.location.hash).toBe('')
  })

  it.each(['/register', '/auth/resend-email-verification', '/forgot-password'])(
    'redirects an authenticated user away from the form route %s',
    async (path) => {
      server.use(
        http.get(`${apiOrigin}/v1/auth/me`, () =>
          HttpResponse.json(currentUser),
        ),
      )
      const { router } = await createApplicationRouter(path)

      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    },
  )

  it('redirects an anonymous approval deep link with its exact returnTo and no detail GET', async () => {
    let detailsRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, authenticationRequired),
      http.get(`${apiOrigin}/v1/approval-requests/:id`, () => {
        detailsRequests += 1
        return HttpResponse.json(request)
      }),
    )
    const { router } = await createApplicationRouter(
      `/approval-requests/${requestId}`,
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })

    expect(router.state.location.search).toBe(
      `?returnTo=%2Fapproval-requests%2F${requestId}`,
    )
    expect(detailsRequests).toBe(0)
  })

  it('redirects an anonymous account deep link with returnTo before its detail GET', async () => {
    let detailRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, authenticationRequired),
      http.get(`${apiOrigin}/v1/admin/auth/accounts/:accountId`, () => {
        detailRequests += 1
        return HttpResponse.json(account, {
          headers: { ETag: `"account-${requestId}-2"` },
        })
      }),
    )
    const { router } = await createApplicationRouter(
      `/admin/accounts/${requestId}`,
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe(
      `?returnTo=%2Fadmin%2Faccounts%2F${requestId}`,
    )
    expect(detailRequests).toBe(0)
  })

  it('revalidates a cached session before allowing a protected approval route', async () => {
    server.use(http.get(`${apiOrigin}/v1/auth/me`, authenticationRequired))
    const { api, queryClient, router, session } =
      await createApplicationRouter('/login')
    api.setCsrfToken('csrf-token')
    queryClient.setQueryData(session.currentSessionQueryKey(), {
      userId: 'cached-user',
      normalizedEmail: 'cached@example.com',
      roleKeys: [],
      permissions: [],
    })

    await router.navigate('/approval-requests/new')

    expect(router.state.location.pathname).toBe('/login')
    expect(api.peekCsrfToken()).toBeNull()
    expect(
      queryClient.getQueryData(session.currentSessionQueryKey()),
    ).toBeUndefined()
  })

  it('loads the session before fetching deep-linked approval details', async () => {
    const calls: string[] = []
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        calls.push('session')
        return HttpResponse.json(currentUser)
      }),
      http.get(`${apiOrigin}/v1/approval-requests/:id`, () => {
        calls.push('details')
        return HttpResponse.json(request)
      }),
    )
    const { queryClient, router } = await createApplicationRouter(
      `/approval-requests/${requestId}`,
    )
    renderApplicationRouter(router, queryClient)

    expect(
      await screen.findByRole('heading', { name: request.title }),
    ).toBeVisible()
    expect(calls.indexOf('session')).toBeLessThan(calls.indexOf('details'))
  })

  it('loads the session before fetching deep-linked account details', async () => {
    const calls: string[] = []
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        calls.push('session')
        return HttpResponse.json({
          ...currentUser,
          permissions: ['auth.accounts.read'],
        })
      }),
      http.get(`${apiOrigin}/v1/admin/auth/accounts/:accountId`, () => {
        calls.push('account')
        return HttpResponse.json(account, {
          headers: { ETag: `"account-${requestId}-2"` },
        })
      }),
    )
    const { queryClient, router } = await createApplicationRouter(
      `/admin/accounts/${requestId}`,
    )
    renderApplicationRouter(router, queryClient)

    expect(
      await screen.findByRole('heading', { name: account.email }),
    ).toBeVisible()
    expect(calls.indexOf('session')).toBeLessThan(calls.indexOf('account'))
  })

  it('clears the cached session and CSRF token before redirecting a 401 detail query', async () => {
    let authenticated = true
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () =>
        authenticated
          ? HttpResponse.json(currentUser)
          : authenticationRequired(),
      ),
      http.get(`${apiOrigin}/v1/approval-requests/:id`, () => {
        authenticated = false
        return authenticationRequired()
      }),
    )
    const { api, queryClient, router, session } = await createApplicationRouter(
      `/approval-requests/${requestId}`,
    )
    api.setCsrfToken('csrf-token')
    queryClient.setQueryData(session.currentSessionQueryKey(), currentUser)
    renderApplicationRouter(router, queryClient)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })

    expect(api.peekCsrfToken()).toBeNull()
    expect(
      queryClient.getQueryData(session.currentSessionQueryKey()),
    ).toBeUndefined()
  })

  it('resolves new and open as static approval routes instead of dynamic details', async () => {
    let detailsRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => HttpResponse.json(currentUser)),
      http.get(`${apiOrigin}/v1/approval-requests/:id`, () => {
        detailsRequests += 1
        return HttpResponse.json(request)
      }),
    )
    const { queryClient, router } = await createApplicationRouter(
      '/approval-requests/new',
    )
    renderApplicationRouter(router, queryClient)

    expect(
      await screen.findByRole('heading', { name: 'Создать запрос' }),
    ).toBeVisible()
    await router.navigate('/approval-requests/open')
    expect(
      await screen.findByRole('heading', { name: 'Открыть запрос' }),
    ).toBeVisible()
    expect(detailsRequests).toBe(0)
  })

  it('runs the protected parent loader once for child navigation and again only on revalidation', async () => {
    let sessionRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        sessionRequests += 1
        return HttpResponse.json(currentUser)
      }),
    )
    const { queryClient, router } = await createApplicationRouter(
      '/approval-requests/new',
    )
    renderApplicationRouter(router, queryClient)

    await screen.findByRole('heading', { name: 'Создать запрос' })
    await router.navigate('/approval-requests/open')
    await screen.findByRole('heading', { name: 'Открыть запрос' })
    expect(sessionRequests).toBe(1)

    router.revalidate()
    await waitFor(() => expect(sessionRequests).toBe(2))
  })
})
