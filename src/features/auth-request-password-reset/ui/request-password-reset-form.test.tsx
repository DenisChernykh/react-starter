import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { RequestPasswordResetForm } from './request-password-reset-form'

const endpoint = 'http://localhost:3000/v1/auth/password-reset/request'

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

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/forgot-password', element: <RequestPasswordResetForm /> }],
    { initialEntries: ['/forgot-password'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('RequestPasswordResetForm', () => {
  it('validates email without HTTP', async () => {
    let requests = 0
    server.use(
      http.post(endpoint, () => {
        requests += 1
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'invalid')
    await user.click(screen.getByRole('button', { name: 'Отправить письмо' }))

    expect(await screen.findByText('Неверный email адрес')).toBeVisible()
    expect(requests).toBe(0)
  })

  it('sends the exact body and shows the generic accepted state', async () => {
    let body: unknown
    server.use(
      http.post(endpoint, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить письмо' }))

    expect(
      await screen.findByText(
        'Если операция доступна для этого адреса, письмо уже отправлено',
      ),
    ).toBeVisible()
    expect(body).toEqual({ email: 'person@example.com' })
  })

  it('blocks two submit events dispatched in the same turn', async () => {
    let requests = 0
    let releaseRequest!: () => void
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      http.post(endpoint, async () => {
        requests += 1
        await requestGate
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    const form = screen
      .getByRole('button', { name: 'Отправить письмо' })
      .closest('form')
    if (form === null) throw new Error('Password reset request form is missing')

    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(requests).toBeGreaterThan(0))
    expect(requests).toBe(1)
    expect(screen.getByRole('button', { name: 'Отправляем' })).toBeDisabled()
    releaseRequest()
    await screen.findByText(
      'Если операция доступна для этого адреса, письмо уже отправлено',
    )
  })

  it('shows only the allowlisted email validation error', async () => {
    server.use(http.post(endpoint, validationProblem))
    renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить письмо' }))

    expect(await screen.findByText('Email rejected')).toBeVisible()
    expect(screen.queryByText('Unknown pointer detail')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Raw detail must stay hidden'),
    ).not.toBeInTheDocument()
  })
})
