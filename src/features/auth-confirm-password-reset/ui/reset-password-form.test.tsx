import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import { clearCsrfToken, peekCsrfToken, setCsrfToken } from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { ResetPasswordForm } from './reset-password-form'

describe('ResetPasswordForm', () => {
  it('confirms a new password with the exact backend body and clears session state', async () => {
    let body: unknown
    server.use(
      http.post(
        'http://localhost:3000/v1/auth/password-reset/confirm',
        async ({ request }) => {
          body = await request.json()
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    queryClient.setQueryData(currentSessionQueryKey(), { userId: 'id' })
    setCsrfToken('csrf-token')
    const router = createMemoryRouter(
      [{ path: '/auth/reset-password', element: <ResetPasswordForm /> }],
      { initialEntries: [`/auth/reset-password#token=${'B'.repeat(43)}`] },
    )
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Новый пароль'), 'new long password')
    await user.type(
      screen.getByLabelText('Повторите пароль'),
      'new long password',
    )
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(await screen.findByText('Пароль изменён')).toBeVisible()
    expect(body).toEqual({
      token: 'B'.repeat(43),
      newPassword: 'new long password',
    })
    expect(queryClient.getQueryData(currentSessionQueryKey())).toBeUndefined()
    expect(peekCsrfToken()).toBeNull()
    const cachedMutationVariables = JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.variables),
    )
    expect(cachedMutationVariables).not.toContain('B'.repeat(43))
    expect(cachedMutationVariables).not.toContain('new long password')
  })

  it('does not send a request for an invalid token', async () => {
    let requests = 0
    server.use(
      http.post('http://localhost:3000/v1/auth/password-reset/confirm', () => {
        requests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = createMemoryRouter(
      [{ path: '/auth/reset-password', element: <ResetPasswordForm /> }],
      { initialEntries: ['/auth/reset-password#token=bad'] },
    )
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByText('Ссылка недействительна или устарела'),
    ).toBeVisible()
    expect(requests).toBe(0)
    clearCsrfToken()
  })

  it('blocks two submit events dispatched in the same turn', async () => {
    let requests = 0
    let releaseRequest!: () => void
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      http.post(
        'http://localhost:3000/v1/auth/password-reset/confirm',
        async () => {
          requests += 1
          await requestGate
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const router = createMemoryRouter(
      [{ path: '/auth/reset-password', element: <ResetPasswordForm /> }],
      { initialEntries: [`/auth/reset-password#token=${'C'.repeat(43)}`] },
    )
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.type(
      await screen.findByLabelText('Новый пароль'),
      'new long password',
    )
    await user.type(
      screen.getByLabelText('Повторите пароль'),
      'new long password',
    )
    const form = screen
      .getByRole('button', { name: 'Изменить пароль' })
      .closest('form')
    if (form === null) throw new Error('Reset password form is missing')

    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(requests).toBeGreaterThan(0))
    expect(requests).toBe(1)
    expect(
      screen.getByRole('button', { name: 'Изменяем пароль' }),
    ).toBeDisabled()
    releaseRequest()
    await screen.findByText('Пароль изменён')
  })

  it('validates password confirmation without HTTP', async () => {
    let requests = 0
    server.use(
      http.post('http://localhost:3000/v1/auth/password-reset/confirm', () => {
        requests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = createMemoryRouter(
      [{ path: '/auth/reset-password', element: <ResetPasswordForm /> }],
      { initialEntries: [`/auth/reset-password#token=${'E'.repeat(43)}`] },
    )
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.type(
      await screen.findByLabelText('Новый пароль'),
      'new long password',
    )
    await user.type(
      screen.getByLabelText('Повторите пароль'),
      'different password',
    )
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(await screen.findByText('Пароли не совпадают')).toBeVisible()
    expect(requests).toBe(0)
  })

  it('maps an expired token to safe local copy without raw detail', async () => {
    server.use(
      http.post('http://localhost:3000/v1/auth/password-reset/confirm', () =>
        HttpResponse.json(
          {
            type: 'https://example.test/problems/auth-token-invalid-or-expired',
            title: 'Title must stay hidden',
            status: 400,
            detail: 'Raw detail must stay hidden',
            instance: 'urn:request:400',
            code: 'AUTH_TOKEN_INVALID_OR_EXPIRED',
            requestId: '400',
          },
          {
            status: 400,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    const router = createMemoryRouter(
      [{ path: '/auth/reset-password', element: <ResetPasswordForm /> }],
      { initialEntries: [`/auth/reset-password#token=${'F'.repeat(43)}`] },
    )
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.type(
      await screen.findByLabelText('Новый пароль'),
      'new long password',
    )
    await user.type(
      screen.getByLabelText('Повторите пароль'),
      'new long password',
    )
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(
      await screen.findByText('Ссылка недействительна или устарела'),
    ).toBeVisible()
    expect(
      screen.queryByText('Raw detail must stay hidden'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Title must stay hidden')).not.toBeInTheDocument()
  })

  it('shows only the allowlisted newPassword validation error', async () => {
    server.use(
      http.post('http://localhost:3000/v1/auth/password-reset/confirm', () =>
        HttpResponse.json(
          {
            type: 'https://example.test/problems/validation-failed',
            title: 'Title must stay hidden',
            status: 422,
            detail: 'Raw detail must stay hidden',
            instance: 'urn:request:422',
            code: 'VALIDATION_FAILED',
            requestId: '422',
            errors: [
              {
                pointer: '/newPassword',
                code: 'invalid_password',
                detail: 'Password rejected',
              },
              {
                pointer: '/token',
                code: 'unknown',
                detail: 'Token pointer detail',
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
    const router = createMemoryRouter(
      [{ path: '/auth/reset-password', element: <ResetPasswordForm /> }],
      { initialEntries: [`/auth/reset-password#token=${'G'.repeat(43)}`] },
    )
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.type(
      await screen.findByLabelText('Новый пароль'),
      'new long password',
    )
    await user.type(
      screen.getByLabelText('Повторите пароль'),
      'new long password',
    )
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(await screen.findByText('Password rejected')).toBeVisible()
    expect(screen.queryByText('Token pointer detail')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Raw detail must stay hidden'),
    ).not.toBeInTheDocument()
  })
})
