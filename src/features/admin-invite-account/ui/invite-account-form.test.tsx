import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { InviteAccountForm } from './invite-account-form'

const apiOrigin = window.location.origin

function renderForm(queryClient: QueryClient) {
  const router = createMemoryRouter(
    [{ path: '/', element: <InviteAccountForm /> }],
    { initialEntries: ['/'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('InviteAccountForm', () => {
  it('creates a roleless invitation allowed by the API contract', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
    let invitationBody: unknown
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () =>
        HttpResponse.json({ roles: [] }),
      ),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.post(
        `${apiOrigin}/v1/admin/auth/account-invitations`,
        async ({ request }) => {
          invitationBody = await request.json()
          return HttpResponse.json({ mailDelivery: 'delivered' })
        },
      ),
    )

    renderForm(queryClient)

    await user.type(screen.getByLabelText('Email'), 'roleless@example.test')
    await user.click(
      screen.getByRole('button', { name: 'Создать приглашение' }),
    )

    expect(
      await screen.findByText('Приглашение создано, письмо отправлено.'),
    ).toBeVisible()
    expect(invitationBody).toEqual({
      email: 'roleless@example.test',
      roleKeys: [],
    })
  })

  it('keeps an invitation when mail delivery fails', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () =>
        HttpResponse.json({ roles: [{ key: 'operator', permissions: [] }] }),
      ),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.post(
        `${apiOrigin}/v1/admin/auth/account-invitations`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            email: 'new@example.test',
            roleKeys: ['operator'],
          })
          return HttpResponse.json({ mailDelivery: 'failed' })
        },
      ),
    )

    renderForm(queryClient)

    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.click(await screen.findByRole('button', { name: 'operator' }))
    await user.click(
      screen.getByRole('button', { name: 'Создать приглашение' }),
    )

    expect(
      await screen.findByText(/Приглашение создано, но письмо не отправлено/u),
    ).toBeVisible()
  })

  it('maps only supported server validation pointers to invitation fields', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () =>
        HttpResponse.json({ roles: [] }),
      ),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.post(`${apiOrigin}/v1/admin/auth/account-invitations`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/validation-failed',
            title: 'Raw validation title',
            status: 422,
            detail: 'Raw validation detail',
            instance: 'urn:request:invitation-validation',
            code: 'VALIDATION_FAILED',
            requestId: 'invitation-validation',
            errors: [
              {
                pointer: '/email',
                code: 'invalid_email',
                detail: 'Введите доступный email',
              },
              {
                pointer: '/roleKeys',
                code: 'unknown_role',
                detail: 'Выберите существующие роли',
              },
              {
                pointer: '/actorId',
                code: 'ignored',
                detail: 'Скрытая серверная деталь',
              },
            ],
          },
          {
            status: 422,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    renderForm(queryClient)

    await user.type(screen.getByLabelText('Email'), 'valid@example.test')
    await user.click(
      screen.getByRole('button', { name: 'Создать приглашение' }),
    )

    expect(await screen.findByText('Введите доступный email')).toBeVisible()
    expect(screen.getByText('Выберите существующие роли')).toBeVisible()
    expect(
      screen.queryByText('Скрытая серверная деталь'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Raw validation detail')).not.toBeInTheDocument()
  })

  it('revalidates the protected parent after authentication expires', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
    let loaderCalls = 0
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => {
            loaderCalls += 1
            return null
          },
          children: [
            {
              path: 'admin/accounts',
              element: <InviteAccountForm />,
            },
          ],
        },
      ],
      { initialEntries: ['/admin/accounts'] },
    )
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/roles`, () =>
        HttpResponse.json({ roles: [] }),
      ),
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.post(`${apiOrigin}/v1/admin/auth/account-invitations`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/authentication-required',
            title: 'Raw authentication title',
            status: 401,
            detail: 'Raw authentication detail',
            instance: 'urn:request:invitation-auth',
            code: 'AUTHENTICATION_REQUIRED',
            requestId: 'invitation-auth',
          },
          {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await user.type(await screen.findByLabelText('Email'), 'user@example.test')
    await user.click(
      screen.getByRole('button', { name: 'Создать приглашение' }),
    )

    await waitFor(() => expect(loaderCalls).toBe(2))
    expect(
      screen.queryByText('Raw authentication detail'),
    ).not.toBeInTheDocument()
  })

  it('refreshes the role catalog after an invitation conflict', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
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
      http.post(`${apiOrigin}/v1/admin/auth/account-invitations`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/conflict',
            title: 'Raw conflict title',
            status: 409,
            detail: 'Raw conflict detail',
            instance: 'urn:request:invitation-conflict',
            code: 'CONFLICT',
            requestId: 'invitation-conflict',
          },
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    renderForm(queryClient)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(
      await screen.findByRole('button', { name: 'retired.role' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Создать приглашение' }),
    )

    expect(
      await screen.findByRole('button', { name: 'current.role' }),
    ).toBeVisible()
    expect(roleRequests).toBe(2)
    expect(screen.queryByText('Raw conflict detail')).not.toBeInTheDocument()
  })

  it('keeps conflict recovery usable when refreshing the role catalog fails', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
    let roleRequests = 0
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
      http.get(`${apiOrigin}/v1/auth/csrf`, () =>
        HttpResponse.json({ csrfToken: 'csrf-token' }),
      ),
      http.post(`${apiOrigin}/v1/admin/auth/account-invitations`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/conflict',
            title: 'Raw conflict title',
            status: 409,
            detail: 'Raw conflict detail',
            instance: 'urn:request:invitation-conflict',
            code: 'CONFLICT',
            requestId: 'invitation-conflict',
          },
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    renderForm(queryClient)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(
      await screen.findByRole('button', { name: 'retired.role' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Создать приглашение' }),
    )

    expect(
      await screen.findByText(
        'Не удалось создать приглашение. Код запроса: invitation-conflict',
      ),
    ).toBeVisible()
    expect(
      await screen.findByText(
        'Не удалось загрузить каталог ролей. Код запроса: catalog-recovery',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Raw conflict detail')).not.toBeInTheDocument()
    expect(screen.queryByText('Raw catalog detail')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Повторить загрузку ролей' }),
    )

    expect(
      await screen.findByRole('button', { name: 'current.role' }),
    ).toBeVisible()
    expect(roleRequests).toBe(3)
  })
})
