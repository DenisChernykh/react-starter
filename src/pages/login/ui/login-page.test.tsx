import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { LoginPage } from './login-page'

describe('LoginPage', () => {
  it('renders a level-one heading with the login form inside the route', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const router = createMemoryRouter(
      [{ path: '/login', element: <LoginPage /> }],
      { initialEntries: ['/login?returnTo=%2Fprivate'] },
    )

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Вход' }),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible()
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled()
  })
})
