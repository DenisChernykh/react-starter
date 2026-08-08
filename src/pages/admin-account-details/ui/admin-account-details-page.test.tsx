import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { adminAccountQueryKey } from '@/entities/account'
import { currentSessionQueryKey } from '@/entities/session'
import type { CurrentUserResponseDto, ProblemCode } from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { AdminAccountDetailsPage } from './admin-account-details-page'

const apiOrigin = window.location.origin
const accountId = 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184'
const currentUser = {
  normalizedEmail: 'operator@example.test',
  permissions: ['auth.accounts.read', 'auth.accounts.manage'],
  roleKeys: ['operator'],
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
} satisfies CurrentUserResponseDto

function problem(status: number, code: ProblemCode, requestId: string) {
  return HttpResponse.json(
    {
      type: `https://nest-js-starter.invalid/problems/${code.toLowerCase()}`,
      title: 'Raw server title',
      status,
      detail: 'Raw server detail',
      instance: `urn:request:${requestId}`,
      code,
      requestId,
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  )
}

function renderPage(path = `/admin/accounts/${accountId}`) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  queryClient.setQueryData(currentSessionQueryKey(), currentUser)
  const router = createMemoryRouter(
    [
      {
        path: '/admin/accounts/:accountId',
        element: <AdminAccountDetailsPage />,
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return queryClient
}

describe('AdminAccountDetailsPage errors', () => {
  it('distinguishes a missing account and keeps the request ID', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () =>
        problem(404, 'NOT_FOUND', 'account-not-found'),
      ),
    )

    renderPage()

    expect(
      await screen.findByText('Аккаунт не существует или раздел недоступен.'),
    ).toBeVisible()
    expect(screen.getByText('Код запроса: account-not-found')).toBeVisible()
    expect(screen.queryByText('Raw server detail')).not.toBeInTheDocument()
  })

  it('shows a retryable network error separately', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () =>
        HttpResponse.error(),
      ),
    )

    renderPage()

    expect(
      await screen.findByText('Не удалось подключиться к серверу.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeVisible()
  })

  it('shows a safe dependency error with its request ID', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () =>
        problem(503, 'DEPENDENCY_UNAVAILABLE', 'account-dependency'),
      ),
    )

    renderPage()

    expect(await screen.findByText('Сервис временно недоступен.')).toBeVisible()
    expect(screen.getByText('Код запроса: account-dependency')).toBeVisible()
    expect(screen.queryByText('Raw server title')).not.toBeInTheDocument()
  })

  it('does not offer retry for a protocol error', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () =>
        HttpResponse.json({ unexpected: true }, { status: 503 }),
      ),
    )

    renderPage()

    expect(
      await screen.findByText('Сервер вернул некорректный ответ.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument()
  })

  it('does not keep rendering a stale account after ambiguous mutation recovery fails', async () => {
    const user = userEvent.setup()
    let detailRequests = 0
    const account = {
      createdAt: '2026-08-08T08:00:00.000Z',
      email: 'member@example.test',
      emailVerifiedAt: '2026-08-08T08:00:00.000Z',
      id: accountId,
      retiredAt: null,
      revision: 2,
      roleKeys: [],
      state: 'active',
      updatedAt: '2026-08-08T09:00:00.000Z',
    } as const
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () => {
        detailRequests += 1
        if (detailRequests === 1) {
          return HttpResponse.json(account, {
            headers: { ETag: `"account-${accountId}-2"` },
          })
        }
        return problem(503, 'DEPENDENCY_UNAVAILABLE', 'account-recovery')
      }),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.put(`${apiOrigin}/v1/admin/auth/accounts/${accountId}/status`, () =>
        HttpResponse.json({
          ...account,
          revision: 3,
          state: 'disabled',
        }),
      ),
    )
    const queryClient = renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Отключить аккаунт' }),
    )

    expect(await screen.findByText('Сервис временно недоступен.')).toBeVisible()
    expect(screen.getByText('Код запроса: account-recovery')).toBeVisible()
    expect(
      queryClient.getQueryData(adminAccountQueryKey(accountId)),
    ).toBeUndefined()
    expect(screen.queryByText('member@example.test')).not.toBeInTheDocument()
  })
})
