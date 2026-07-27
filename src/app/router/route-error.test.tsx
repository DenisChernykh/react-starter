import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  clearCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from '@/shared/api'

import { queryClient } from '../providers/query-client'
import { getRouteErrorPresentation } from './route-error-presentation'
import { RouteError } from './route-error'

function problem(status: number, code: string, requestId: string) {
  return new ApiProblemError(
    {
      type: 'https://example.test/problem',
      title: 'Text not used',
      status,
      detail: 'Raw backend detail',
      instance: `urn:request:${requestId}`,
      code,
      requestId,
    },
    null,
  )
}

describe('RouteError', () => {
  beforeEach(() => {
    clearCsrfToken()
    queryClient.clear()
  })

  it.each([
    [
      new ApiNetworkError(),
      {
        message: 'Не удалось подключиться к серверу.',
        retryable: true,
      },
    ],
    [
      new ApiProtocolError(),
      {
        message: 'Сервер вернул некорректный ответ.',
        retryable: false,
      },
    ],
    [
      problem(403, 'AUTHORIZATION_DENIED', 'request-403'),
      { message: 'Недостаточно прав', retryable: false },
    ],
    [
      problem(503, 'DEPENDENCY_UNAVAILABLE', 'request-503'),
      { message: 'Сервис временно недоступен.', retryable: true },
    ],
    [
      problem(500, 'INTERNAL_ERROR', 'request-500'),
      {
        message: 'Не удалось выполнить запрос.',
        requestId: 'request-500',
        retryable: true,
      },
    ],
  ])('maps route errors without raw backend detail', (error, expected) => {
    expect(getRouteErrorPresentation(error)).toEqual(expected)
    expect(JSON.stringify(getRouteErrorPresentation(error))).not.toContain(
      'Raw backend detail',
    )
  })

  it('clears memory and redirects when a route error is authentication required', async () => {
    setCsrfToken('csrf-token')
    queryClient.setQueryData(currentSessionQueryKey(), { userId: 'user-1' })
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => {
            throw problem(401, 'AUTHENTICATION_REQUIRED', 'request-401')
          },
          element: <p>Dashboard route</p>,
          errorElement: <RouteError />,
        },
        { path: '/login', element: <p>Login route</p> },
      ],
      { initialEntries: ['/'] },
    )

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Login route')).toBeVisible()
    expect(router.state.location.pathname).toBe('/login')
    expect(peekCsrfToken()).toBeNull()
    expect(queryClient.getQueryData(currentSessionQueryKey())).toBeUndefined()
  })
})
