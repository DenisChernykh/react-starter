import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import { clearCsrfToken, peekCsrfToken, setCsrfToken } from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { LogoutButton } from './logout-button'

const apiOrigin = 'http://localhost:3000'
const currentUser = {
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
  normalizedEmail: 'admin@example.com',
  roleKeys: ['admin'],
  permissions: [],
}

function renderLogout() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(currentSessionQueryKey(), currentUser)
  const router = createMemoryRouter(
    [
      { path: '/', element: <LogoutButton /> },
      { path: '/login', element: <p>Login route</p> },
    ],
    { initialEntries: ['/'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

describe('LogoutButton', () => {
  beforeEach(() => {
    clearCsrfToken()
    setCsrfToken('csrf-before-logout')
  })

  it('sends CSRF, clears local auth state, and replaces the route', async () => {
    let csrfHeader: string | null = null
    server.use(
      http.post(`${apiOrigin}/v1/auth/logout`, ({ request }) => {
        csrfHeader = request.headers.get('X-CSRF-Token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { queryClient, router } = renderLogout()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Login route')).toBeVisible()
    expect(csrfHeader).toBe('csrf-before-logout')
    expect(peekCsrfToken()).toBeNull()
    expect(queryClient.getQueryData(currentSessionQueryKey())).toBeUndefined()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('preserves the session and offers retry for a 503', async () => {
    server.use(
      http.post(`${apiOrigin}/v1/auth/logout`, () =>
        HttpResponse.json(
          {
            type: 'https://example.test/problems/dependency-unavailable',
            title: 'Dependency unavailable',
            status: 503,
            detail: 'Raw infrastructure detail',
            instance: 'urn:request:503',
            code: 'DEPENDENCY_UNAVAILABLE',
            requestId: '503',
          },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    const { queryClient, router } = renderLogout()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(
      await screen.findByText('Не удалось выйти. Повторите попытку.'),
    ).toBeVisible()
    expect(queryClient.getQueryData(currentSessionQueryKey())).toEqual(
      currentUser,
    )
    expect(peekCsrfToken()).toBe('csrf-before-logout')
    expect(router.state.location.pathname).toBe('/')
    expect(
      screen.queryByText('Raw infrastructure detail'),
    ).not.toBeInTheDocument()
  })

  it('shows an accessible spinner and blocks repeated logout while pending', async () => {
    let releaseLogout!: () => void
    const logoutGate = new Promise<void>((resolve) => {
      releaseLogout = resolve
    })
    server.use(
      http.post(`${apiOrigin}/v1/auth/logout`, async () => {
        await logoutGate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderLogout()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    const pendingButton = await screen.findByRole('button', {
      name: 'Выходим',
    })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    expect(
      pendingButton.querySelector('[data-slot="spinner"]'),
    ).toBeInTheDocument()

    releaseLogout()
    expect(await screen.findByText('Login route')).toBeVisible()
  })
})
