import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import type {
  AdminAccountResponseDto,
  CurrentUserResponseDto,
} from '@/shared/api'
import {
  adminAccountListQueryKey,
  adminAccountQueryKey,
  useAdminAccount,
} from '@/entities/account'
import { server } from '@/shared/lib/testing'

import { AccountActions } from './account-actions'

const apiOrigin = window.location.origin
const account = {
  createdAt: '2026-08-08T08:00:00.000Z',
  email: 'member@example.test',
  emailVerifiedAt: '2026-08-08T08:00:00.000Z',
  id: 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184',
  retiredAt: null,
  revision: 2,
  roleKeys: [],
  state: 'active',
  updatedAt: '2026-08-08T09:00:00.000Z',
} satisfies AdminAccountResponseDto
const currentUser = {
  normalizedEmail: 'operator@example.test',
  permissions: ['auth.accounts.manage'],
  roleKeys: ['operator'],
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
} satisfies CurrentUserResponseDto
const roleManager = {
  ...currentUser,
  permissions: ['auth.accounts.manage', 'auth.accounts.roles.manage'],
} satisfies CurrentUserResponseDto

function renderActions(userOverride: CurrentUserResponseDto = currentUser) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/admin/accounts/:accountId',
        element: (
          <AccountActions
            snapshot={{ account, etag: `"account-${account.id}-2"` }}
            currentUser={userOverride}
          />
        ),
      },
    ],
    { initialEntries: [`/admin/accounts/${account.id}`] },
  )
  queryClient.setQueryData(adminAccountQueryKey(account.id), {
    account,
    etag: `"account-${account.id}-2"`,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

function QueriedAccountActions() {
  const detail = useAdminAccount(account.id)
  if (!detail.data) return <p>Загружаем аккаунт</p>
  return <AccountActions snapshot={detail.data} currentUser={currentUser} />
}

function renderQueriedActions() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/admin/accounts/:accountId',
        element: <QueriedAccountActions />,
      },
    ],
    { initialEntries: [`/admin/accounts/${account.id}`] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

describe('AccountActions', () => {
  it('sends the current strong ETag when disabling an account', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    let csrfRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-token' })
      }),
      http.put(
        `${apiOrigin}/v1/admin/auth/accounts/${account.id}/status`,
        async ({ request }) => {
          ifMatch = request.headers.get('If-Match')
          expect(await request.json()).toEqual({ status: 'disabled' })
          return HttpResponse.json(
            { ...account, revision: 3, state: 'disabled' },
            { headers: { ETag: `"account-${account.id}-3"` } },
          )
        },
      ),
    )

    const { queryClient } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Отключить аккаунт' }))

    await screen.findByText('Аккаунт обновлён')
    expect(ifMatch).toBe(`"account-${account.id}-2"`)
    expect(csrfRequests).toBe(1)
    expect(queryClient.getQueryData(adminAccountQueryKey(account.id))).toEqual({
      account: { ...account, revision: 3, state: 'disabled' },
      etag: `"account-${account.id}-3"`,
    })
  })

  it('authoritatively recovers after a committed status response has no ETag', async () => {
    const user = userEvent.setup()
    let detailRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () => {
        detailRequests += 1
        const refreshed =
          detailRequests === 1
            ? account
            : { ...account, revision: 3, state: 'disabled' as const }
        return HttpResponse.json(refreshed, {
          headers: { ETag: `"account-${account.id}-${refreshed.revision}"` },
        })
      }),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.put(`${apiOrigin}/v1/admin/auth/accounts/${account.id}/status`, () =>
        HttpResponse.json({
          ...account,
          revision: 3,
          state: 'disabled',
        }),
      ),
    )
    const { queryClient } = renderQueriedActions()
    const listKey = adminAccountListQueryKey({ page: 1, pageSize: 25 })
    queryClient.setQueryData(listKey, { items: [account], total: 1 })

    await user.click(
      await screen.findByRole('button', { name: 'Отключить аккаунт' }),
    )

    expect(
      await screen.findByText(
        'Сервер вернул некорректный ответ. Данные аккаунта перечитаны.',
      ),
    ).toBeVisible()
    expect(detailRequests).toBe(2)
    expect(queryClient.getQueryData(adminAccountQueryKey(account.id))).toEqual({
      account: { ...account, revision: 3, state: 'disabled' },
      etag: `"account-${account.id}-3"`,
    })
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
  })

  it('removes a stale snapshot when ambiguous-response recovery also fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/dependency-unavailable',
            title: 'Raw recovery title',
            status: 503,
            detail: 'Raw recovery detail',
            instance: 'urn:request:account-recovery',
            code: 'DEPENDENCY_UNAVAILABLE',
            requestId: 'account-recovery',
          },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
      http.put(`${apiOrigin}/v1/admin/auth/accounts/${account.id}/status`, () =>
        HttpResponse.json({
          ...account,
          revision: 3,
          state: 'disabled',
        }),
      ),
    )
    const { queryClient } = renderActions()
    const listKey = adminAccountListQueryKey({ page: 1, pageSize: 25 })
    queryClient.setQueryData(listKey, { items: [account], total: 1 })

    await user.click(screen.getByRole('button', { name: 'Отключить аккаунт' }))

    expect(
      await screen.findByText(
        'Сервер вернул некорректный ответ. Актуальные данные аккаунта получить не удалось.',
      ),
    ).toBeVisible()
    expect(
      queryClient.getQueryData(adminAccountQueryKey(account.id)),
    ).toBeUndefined()
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    expect(screen.queryByText('Raw recovery detail')).not.toBeInTheDocument()
  })

  it('refreshes the account snapshot after revoking every session', async () => {
    const user = userEvent.setup()
    let detailRequests = 0
    let statusEtag: string | null = null
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.delete(
        `${apiOrigin}/v1/admin/auth/accounts/${account.id}/sessions`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () => {
        detailRequests += 1
        return HttpResponse.json(
          { ...account, revision: detailRequests },
          { headers: { ETag: `"account-${account.id}-${detailRequests}"` } },
        )
      }),
      http.put(
        `${apiOrigin}/v1/admin/auth/accounts/${account.id}/status`,
        ({ request }) => {
          statusEtag = request.headers.get('If-Match')
          return HttpResponse.json(
            { ...account, revision: 3, state: 'disabled' },
            { headers: { ETag: `"account-${account.id}-3"` } },
          )
        },
      ),
    )

    renderQueriedActions()
    await user.click(
      await screen.findByRole('button', { name: 'Завершить все сессии' }),
    )

    await waitFor(() => expect(detailRequests).toBe(2))
    await user.click(screen.getByRole('button', { name: 'Отключить аккаунт' }))
    await waitFor(() => expect(statusEtag).toBe(`"account-${account.id}-2"`))
  })

  it('refreshes account and role data after a role conflict', async () => {
    const user = userEvent.setup()
    let roleRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () => {
        roleRequests += 1
        return HttpResponse.json({
          roles: [
            {
              key: roleRequests === 1 ? 'retired.role' : 'current.role',
              permissions: [],
            },
          ],
        })
      }),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () =>
        HttpResponse.json(account, {
          headers: { ETag: `"account-${account.id}-2"` },
        }),
      ),
      http.put(`${apiOrigin}/v1/admin/auth/accounts/${account.id}/roles`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/conflict',
            title: 'Raw conflict title',
            status: 409,
            detail: 'Raw conflict detail',
            instance: 'urn:request:roles-conflict',
            code: 'CONFLICT',
            requestId: 'roles-conflict',
          },
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    renderActions(roleManager)
    await user.click(
      await screen.findByRole('button', { name: 'retired.role' }),
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить роли' }))

    expect(
      await screen.findByRole('button', { name: 'current.role' }),
    ).toBeVisible()
    expect(roleRequests).toBe(2)
    expect(screen.queryByText('Raw conflict detail')).not.toBeInTheDocument()
  })

  it('keeps conflict recovery usable when refreshing the role catalog fails', async () => {
    const user = userEvent.setup()
    let roleRequests = 0
    let detailRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () => {
        roleRequests += 1
        if (roleRequests === 2) {
          return HttpResponse.json(
            {
              type: 'https://nest-js-starter.invalid/problems/dependency-unavailable',
              title: 'Raw catalog title',
              status: 503,
              detail: 'Raw catalog detail',
              instance: 'urn:request:catalog-recovery',
              code: 'DEPENDENCY_UNAVAILABLE',
              requestId: 'catalog-recovery',
            },
            {
              status: 503,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          )
        }
        return HttpResponse.json({
          roles: [
            {
              key: roleRequests === 1 ? 'retired.role' : 'current.role',
              permissions: [],
            },
          ],
        })
      }),
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () => {
        detailRequests += 1
        return HttpResponse.json(account, {
          headers: { ETag: `"account-${account.id}-2"` },
        })
      }),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.put(`${apiOrigin}/v1/admin/auth/accounts/${account.id}/roles`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/conflict',
            title: 'Raw conflict title',
            status: 409,
            detail: 'Raw conflict detail',
            instance: 'urn:request:roles-conflict',
            code: 'CONFLICT',
            requestId: 'roles-conflict',
          },
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    renderActions(roleManager)
    await user.click(
      await screen.findByRole('button', { name: 'retired.role' }),
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить роли' }))

    expect(
      await screen.findByText(
        'Действие недоступно для текущего состояния аккаунта.',
      ),
    ).toBeVisible()
    expect(detailRequests).toBe(1)
    expect(
      screen.getByText(
        'Не удалось загрузить каталог ролей. Код запроса: catalog-recovery',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Raw catalog detail')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Повторить загрузку ролей' }),
    )
    expect(
      await screen.findByRole('button', { name: 'current.role' }),
    ).toBeVisible()
    expect(roleRequests).toBe(3)
  })

  it('replaces roles with If-Match and stores the returned ETag snapshot', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    let body: unknown
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () =>
        HttpResponse.json({
          roles: [{ key: 'current.role', permissions: [] }],
        }),
      ),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.put(
        `${apiOrigin}/v1/admin/auth/accounts/${account.id}/roles`,
        async ({ request }) => {
          ifMatch = request.headers.get('If-Match')
          body = await request.json()
          return HttpResponse.json(
            { ...account, revision: 3, roleKeys: ['current.role'] },
            { headers: { ETag: `"account-${account.id}-3"` } },
          )
        },
      ),
    )

    const { queryClient } = renderActions(roleManager)
    await user.click(
      await screen.findByRole('button', { name: 'current.role' }),
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить роли' }))

    await screen.findByText('Роли аккаунта обновлены')
    expect(ifMatch).toBe(`"account-${account.id}-2"`)
    expect(body).toEqual({ roleKeys: ['current.role'] })
    expect(queryClient.getQueryData(adminAccountQueryKey(account.id))).toEqual({
      account: { ...account, revision: 3, roleKeys: ['current.role'] },
      etag: `"account-${account.id}-3"`,
    })
  })

  it('keeps the stale-precondition message after refreshing the snapshot', async () => {
    const user = userEvent.setup()
    let detailRequests = 0
    let roleRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () => {
        detailRequests += 1
        return HttpResponse.json(
          { ...account, revision: detailRequests },
          { headers: { ETag: `"account-${account.id}-${detailRequests}"` } },
        )
      }),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () => {
        roleRequests += 1
        return HttpResponse.json({ roles: [] })
      }),
      http.put(`${apiOrigin}/v1/admin/auth/accounts/${account.id}/status`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/precondition-failed',
            title: 'Raw precondition title',
            status: 412,
            detail: 'Raw precondition detail',
            instance: 'urn:request:stale-account',
            code: 'AUTH_ACCOUNT_PRECONDITION_FAILED',
            requestId: 'stale-account',
          },
          {
            status: 412,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    renderQueriedActions()
    await user.click(
      await screen.findByRole('button', { name: 'Отключить аккаунт' }),
    )

    expect(
      await screen.findByText('Данные аккаунта изменились. Они обновлены.'),
    ).toBeVisible()
    expect(detailRequests).toBe(2)
    expect(roleRequests).toBe(0)
    expect(
      screen.queryByText('Raw precondition detail'),
    ).not.toBeInTheDocument()
  })

  it.each([
    {
      code: 'AUTH_ACCOUNT_PRECONDITION_REQUIRED',
      status: 428,
      requestId: 'missing-precondition',
    },
    {
      code: 'AUTH_ACCOUNT_ETAG_MALFORMED',
      status: 400,
      requestId: 'malformed-precondition',
    },
  ] as const)(
    'refreshes the snapshot after $code',
    async ({ code, requestId, status }) => {
      const user = userEvent.setup()
      let detailRequests = 0
      server.use(
        http.get(`${apiOrigin}/v1/admin/auth/accounts/${account.id}`, () => {
          detailRequests += 1
          return HttpResponse.json(
            { ...account, revision: detailRequests },
            {
              headers: {
                ETag: `"account-${account.id}-${detailRequests}"`,
              },
            },
          )
        }),
        http.get(`${apiOrigin}/v1/auth/csrf`, () =>
          HttpResponse.json({ csrfToken: 'csrf-token' }),
        ),
        http.put(
          `${apiOrigin}/v1/admin/auth/accounts/${account.id}/status`,
          () =>
            HttpResponse.json(
              {
                type: 'https://nest-js-starter.invalid/problems/precondition',
                title: 'Raw precondition title',
                status,
                detail: 'Raw precondition detail',
                instance: `urn:request:${requestId}`,
                code,
                requestId,
              },
              {
                status,
                headers: { 'Content-Type': 'application/problem+json' },
              },
            ),
        ),
      )

      renderQueriedActions()
      await user.click(
        await screen.findByRole('button', { name: 'Отключить аккаунт' }),
      )

      expect(
        await screen.findByText(
          `Не удалось выполнить действие. Код запроса: ${requestId}`,
        ),
      ).toBeVisible()
      expect(detailRequests).toBe(2)
      expect(
        screen.queryByText('Raw precondition detail'),
      ).not.toBeInTheDocument()
    },
  )

  it('presents failed password-reset mail as a persisted workflow', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.post(
        `${apiOrigin}/v1/admin/auth/accounts/${account.id}/password-reset`,
        () => HttpResponse.json({ mailDelivery: 'failed' }),
      ),
    )

    renderActions()
    await user.click(
      screen.getByRole('button', { name: 'Отправить сброс пароля' }),
    )

    expect(
      await screen.findByText(/Данные сохранены, но письмо не отправлено/u),
    ).toBeVisible()
  })

  it('removes retired detail, invalidates lists and returns to the list', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.delete(
        `${apiOrigin}/v1/admin/auth/accounts/${account.id}`,
        ({ request }) => {
          ifMatch = request.headers.get('If-Match')
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const { queryClient, router } = renderActions()
    const listKey = adminAccountListQueryKey({ page: 1, pageSize: 25 })
    queryClient.setQueryData(listKey, { items: [account], total: 1 })

    await user.click(
      screen.getByRole('button', { name: 'Архивировать аккаунт' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Архивировать' }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/accounts'),
    )
    expect(ifMatch).toBe(`"account-${account.id}-2"`)
    expect(
      queryClient.getQueryData(adminAccountQueryKey(account.id)),
    ).toBeUndefined()
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
  })
})
