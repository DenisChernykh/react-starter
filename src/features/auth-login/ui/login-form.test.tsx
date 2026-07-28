import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearCsrfToken, peekCsrfToken } from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { LoginForm } from './login-form'

const apiOrigin = 'http://localhost:3000'
const loginResponse = {
  csrfToken: 'A'.repeat(43),
  session: {
    publicId: 'AbCdEfGhIjKlMnOpQrStUv',
    absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
  },
}

const currentUser = {
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
  normalizedEmail: 'admin@example.com',
  roleKeys: ['admin'],
  permissions: ['system.docs.read'],
}

function renderLogin(returnTo = '/private') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <LoginForm returnTo={returnTo} />,
      },
      {
        path: '/private',
        element: <p>Private route</p>,
      },
    ],
    { initialEntries: ['/login'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

async function fillValidCredentials() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'admin@example.com')
  await user.type(screen.getByLabelText('Пароль'), 'correct password')
  return user
}

function problem(
  status: number,
  code: string,
  errors?: Array<{ pointer: string; code: string; detail: string }>,
) {
  return HttpResponse.json(
    {
      type: `https://example.test/problems/${code.toLowerCase()}`,
      title: 'Text not used for behavior',
      status,
      detail: 'Raw detail must stay hidden',
      instance: `urn:request:${status}`,
      code,
      requestId: String(status),
      ...(errors === undefined ? {} : { errors }),
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  )
}

describe('LoginForm', () => {
  beforeEach(clearCsrfToken)

  it('rejects an invalid email through the generated schema without HTTP', async () => {
    let loginRequests = 0
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () => {
        loginRequests += 1
        return HttpResponse.json(loginResponse)
      }),
    )
    renderLogin()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Пароль'), 'secret')
    const password = screen.getByLabelText('Пароль')
    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('secret')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Неверный email адрес')).toBeVisible()
    expect(loginRequests).toBe(0)
  })

  it('maps only backend login validation pointers to fields', async () => {
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () =>
        problem(422, 'VALIDATION_FAILED', [
          { pointer: '/email', code: 'invalid_email', detail: 'Email invalid' },
          {
            pointer: '/password',
            code: 'invalid_password',
            detail: 'Password invalid',
          },
          { pointer: '/role', code: 'ignored', detail: 'Must stay hidden' },
        ]),
      ),
    )
    renderLogin()
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Email invalid')).toBeVisible()
    expect(screen.getByText('Password invalid')).toBeVisible()
    expect(screen.queryByText('Must stay hidden')).not.toBeInTheDocument()
  })

  it.each([
    [401, 'AUTHENTICATION_REQUIRED', 'Неверный email или пароль'],
    [
      429,
      'RATE_LIMIT_EXCEEDED',
      'Слишком много запросов. Повторите попытку позже.',
    ],
  ])('renders safe form copy for %s', async (status, code, expected) => {
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () => problem(status, code)),
    )
    renderLogin()
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText(expected)).toBeVisible()
    expect(
      screen.queryByText('Raw detail must stay hidden'),
    ).not.toBeInTheDocument()
  })

  it('navigates after session creation when the following profile request is unavailable', async () => {
    let meRequests = 0
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () =>
        HttpResponse.json(loginResponse),
      ),
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        meRequests += 1
        return problem(503, 'DEPENDENCY_UNAVAILABLE')
      }),
    )
    const { router } = renderLogin('/private')
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Private route')).toBeVisible()
    expect(router.state.location.pathname).toBe('/private')
    expect(peekCsrfToken()).toBe(loginResponse.csrfToken)
    expect(meRequests).toBe(0)
  })

  it('disables submit while login is pending', async () => {
    let releaseLogin!: () => void
    const loginGate = new Promise<void>((resolve) => {
      releaseLogin = () => resolve()
    })
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, async () => {
        await loginGate
        return HttpResponse.json(loginResponse)
      }),
      http.get(`${apiOrigin}/v1/auth/me`, () => HttpResponse.json(currentUser)),
    )
    renderLogin()
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Входим' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    })
    releaseLogin()
    expect(await screen.findByText('Private route')).toBeVisible()
  })
})
