import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { ConfirmEmailVerificationStatus } from './confirm-email-verification-status'

const endpoint = 'http://localhost:3000/v1/auth/email-verification/confirm'

function renderStatus(path: string, strict = false) {
  const router = createMemoryRouter(
    [
      {
        path: '/auth/verify-email',
        element: <ConfirmEmailVerificationStatus />,
      },
    ],
    { initialEntries: [path] },
  )
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const application = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  render(strict ? <StrictMode>{application}</StrictMode> : application)
  return { queryClient, router }
}

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: `https://example.test/problems/${code.toLowerCase()}`,
      title: 'Title must stay hidden',
      status,
      detail: 'Raw detail must stay hidden',
      instance: `urn:request:${status}`,
      code,
      requestId: String(status),
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  )
}

describe('ConfirmEmailVerificationStatus', () => {
  it('confirms a valid fragment token exactly once under StrictMode', async () => {
    let requests = 0
    server.use(
      http.post(endpoint, async ({ request }) => {
        requests += 1
        expect(await request.json()).toEqual({ token: 'A'.repeat(43) })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { queryClient, router } = renderStatus(
      `/auth/verify-email#token=${'A'.repeat(43)}`,
      true,
    )

    expect(await screen.findByText('Email подтверждён')).toBeVisible()
    await waitFor(() => expect(requests).toBe(1))
    expect(router.state.location.hash).toBe('')
    expect(screen.queryByText('A'.repeat(43))).not.toBeInTheDocument()
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('A'.repeat(43))
  })

  it.each([
    ['missing', '/auth/verify-email'],
    ['malformed', '/auth/verify-email#token=short'],
  ])('does not send HTTP for a %s token', async (_case, path) => {
    let requests = 0
    server.use(
      http.post(endpoint, () => {
        requests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = renderStatus(path)

    expect(
      await screen.findByText('Ссылка недействительна или устарела'),
    ).toBeVisible()
    expect(requests).toBe(0)
    expect(router.state.location.hash).toBe('')
  })

  it('maps an expired token to safe local copy without raw detail', async () => {
    server.use(
      http.post(endpoint, () => problem(400, 'AUTH_TOKEN_INVALID_OR_EXPIRED')),
    )
    renderStatus(`/auth/verify-email#token=${'D'.repeat(43)}`)

    expect(
      await screen.findByText('Ссылка недействительна или устарела'),
    ).toBeVisible()
    expect(
      screen.queryByText('Raw detail must stay hidden'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Title must stay hidden')).not.toBeInTheDocument()
  })
})
