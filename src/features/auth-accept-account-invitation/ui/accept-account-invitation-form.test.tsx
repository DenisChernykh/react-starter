import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { AcceptAccountInvitationForm } from './accept-account-invitation-form'

const apiOrigin = window.location.origin
const token = 'A'.repeat(43)

function renderForm(hash = `#token=${token}`) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/auth/accept-invitation',
        element: <AcceptAccountInvitationForm />,
      },
    ],
    { initialEntries: [`/auth/accept-invitation${hash}`] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

describe('AcceptAccountInvitationForm', () => {
  it('accepts a fragment token without requesting CSRF or a session', async () => {
    const user = userEvent.setup()
    let csrfRequests = 0
    let acceptedBody: unknown
    let hashAtRequest: string | undefined
    let requestSearch: string | undefined
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-token' })
      }),
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        throw new Error('Invitation acceptance must not request a session')
      }),
      http.post(
        `${apiOrigin}/v1/auth/account-invitations/accept`,
        async ({ request }) => {
          hashAtRequest = router?.state.location.hash
          requestSearch = new URL(request.url).search
          acceptedBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    const { queryClient, router } = renderForm()

    await user.type(
      await screen.findByLabelText('Пароль'),
      'valid invitation password',
    )
    await user.type(
      await screen.findByLabelText('Повторите пароль'),
      'valid invitation password',
    )
    await user.click(
      screen.getByRole('button', { name: 'Принять приглашение' }),
    )

    expect(await screen.findByText('Аккаунт активирован')).toBeVisible()
    expect(acceptedBody).toEqual({
      token,
      password: 'valid invitation password',
    })
    expect(csrfRequests).toBe(0)
    expect(hashAtRequest).toBe('')
    expect(requestSearch).toBe('')
    const cachedMutationVariables = JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.variables),
    )
    expect(cachedMutationVariables).not.toContain(token)
    expect(cachedMutationVariables).not.toContain('valid invitation password')
  })

  it('does not submit an absent or malformed fragment token', () => {
    renderForm('#token=invalid')

    expect(
      screen.getByText('Ссылка недействительна или устарела'),
    ).toBeVisible()
  })

  it('submits an invitation token at most once while the request is pending', async () => {
    let acceptedRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        throw new Error('Invitation acceptance must not request CSRF')
      }),
      http.post(`${apiOrigin}/v1/auth/account-invitations/accept`, () => {
        acceptedRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderForm()
    await user.type(
      await screen.findByLabelText('Пароль'),
      'valid invitation password',
    )
    await user.type(
      screen.getByLabelText('Повторите пароль'),
      'valid invitation password',
    )
    const form = screen
      .getByRole('button', { name: 'Принять приглашение' })
      .closest('form')
    if (form === null) throw new Error('Invitation form not found')

    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(await screen.findByText('Аккаунт активирован')).toBeVisible()
    expect(acceptedRequests).toBe(1)
  })
})
