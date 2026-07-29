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
