import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import type { CurrentUserResponseDto } from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { AdminAccountsPage } from './admin-accounts-page'

const apiOrigin = window.location.origin
const currentUser = {
  normalizedEmail: 'reader@example.test',
  permissions: ['auth.accounts.read'],
  roleKeys: ['reader'],
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
} satisfies CurrentUserResponseDto

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(currentSessionQueryKey(), currentUser)
  const router = createMemoryRouter(
    [{ path: '/admin/accounts', element: <AdminAccountsPage /> }],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('AdminAccountsPage URL state', () => {
  it('synchronizes the search draft after browser navigation', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts`, () =>
        HttpResponse.json({ items: [], total: 0 }),
      ),
    )
    const router = renderPage('/admin/accounts?search=first')

    expect(await screen.findByLabelText('Поиск')).toHaveValue('first')

    await router.navigate('/admin/accounts?search=second')

    await waitFor(() =>
      expect(screen.getByLabelText('Поиск')).toHaveValue('second'),
    )
  })

  it('normalizes invalid URL filters before requesting accounts', async () => {
    let requestedSearch = ''
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts`, ({ request }) => {
        requestedSearch = new URL(request.url).search
        return HttpResponse.json({ items: [], total: 0 })
      }),
    )

    renderPage('/admin/accounts?page=-4&state=unknown&search=%20operator%20')

    await screen.findByText('Аккаунты не найдены.')
    expect(new URLSearchParams(requestedSearch)).toEqual(
      new URLSearchParams({ page: '1', pageSize: '25', search: 'operator' }),
    )
  })
})
