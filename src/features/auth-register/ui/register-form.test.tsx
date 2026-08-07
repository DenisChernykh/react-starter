import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { RegisterForm } from './register-form'

function validationProblem() {
  return HttpResponse.json(
    {
      type: 'https://example.test/problems/validation-failed',
      title: 'Title must stay hidden',
      status: 422,
      detail: 'Raw detail must stay hidden',
      instance: 'urn:request:422',
      code: 'VALIDATION_FAILED',
      requestId: '422',
      errors: [
        { pointer: '/email', code: 'invalid_email', detail: 'Email rejected' },
        { pointer: '/role', code: 'unknown', detail: 'Unknown pointer detail' },
      ],
    },
    { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/register', element: <RegisterForm /> }],
    { initialEntries: ['/register'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

describe('RegisterForm', () => {
  it('validates password confirmation without HTTP', async () => {
    let requests = 0
    server.use(
      http.post('http://localhost:3000/v1/auth/register', () => {
        requests += 1
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderRegister()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'long password')
    await user.type(screen.getByLabelText('Повторите пароль'), 'different')
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }))

    expect(await screen.findByText('Пароли не совпадают')).toBeVisible()
    expect(requests).toBe(0)
  })

  it('sends only backend fields and shows generic success', async () => {
    let body: unknown
    server.use(
      http.post(
        'http://localhost:3000/v1/auth/register',
        async ({ request }) => {
          body = await request.json()
          return new HttpResponse(null, { status: 202 })
        },
      ),
    )
    const { queryClient } = renderRegister()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'long password')
    await user.type(screen.getByLabelText('Повторите пароль'), 'long password')
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }))

    expect(
      await screen.findByText(
        'Если регистрация доступна для этого адреса, письмо с подтверждением уже отправлено',
      ),
    ).toBeVisible()
    expect(body).toEqual({
      email: 'person@example.com',
      password: 'long password',
    })
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument()
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('long password')
  })

  it('blocks two submit events dispatched in the same turn', async () => {
    let requests = 0
    let releaseRequest!: () => void
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      http.post('http://localhost:3000/v1/auth/register', async () => {
        requests += 1
        await requestGate
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderRegister()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'long password')
    await user.type(screen.getByLabelText('Повторите пароль'), 'long password')
    const form = screen
      .getByRole('button', { name: 'Создать аккаунт' })
      .closest('form')
    if (form === null) throw new Error('Register form is missing')

    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(requests).toBeGreaterThan(0))
    expect(requests).toBe(1)
    expect(
      screen.getByRole('button', { name: 'Создаём аккаунт' }),
    ).toBeDisabled()
    releaseRequest()
    await screen.findByText(
      'Если регистрация доступна для этого адреса, письмо с подтверждением уже отправлено',
    )
  })

  it('shows only allowlisted validation field errors', async () => {
    server.use(
      http.post('http://localhost:3000/v1/auth/register', validationProblem),
    )
    renderRegister()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'long password')
    await user.type(screen.getByLabelText('Повторите пароль'), 'long password')
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }))

    expect(await screen.findByText('Email rejected')).toBeVisible()
    expect(screen.queryByText('Unknown pointer detail')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Raw detail must stay hidden'),
    ).not.toBeInTheDocument()
  })
})
