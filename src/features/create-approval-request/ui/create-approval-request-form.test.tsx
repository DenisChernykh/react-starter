import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { approvalRequestQueryKey } from '@/entities/approval-request'
import { clearCsrfToken, type ApprovalRequestResponseDto } from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { CreateApprovalRequestForm } from './create-approval-request-form'

const apiOrigin = 'http://localhost:3000'
const csrfToken = 'C'.repeat(43)
const createdRequest = {
  id: 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184',
  title: 'Публикация релиза',
  description: 'Проверить релиз перед публикацией',
  status: 'pending',
  createdByUserId: '401deac1-f230-4926-961e-d4c3ac510cec',
  decidedByUserId: null,
  createdAt: '2026-07-29T06:15:00.000Z',
  decidedAt: null,
} satisfies ApprovalRequestResponseDto

function renderCreateApprovalRequestForm(loader?: () => null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const router = createMemoryRouter(
    [
      {
        id: 'create-approval-request',
        path: '/approval-requests/new',
        loader,
        element: <CreateApprovalRequestForm />,
      },
      {
        path: '/approval-requests/:requestId',
        element: <p>Карточка запроса согласования</p>,
      },
    ],
    {
      initialEntries: ['/approval-requests/new'],
      ...(loader === undefined
        ? {}
        : {
            hydrationData: {
              loaderData: { 'create-approval-request': null },
            },
          }),
    },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}

async function fillValidRequest() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Название'), createdRequest.title)
  await user.type(screen.getByLabelText('Описание'), createdRequest.description)
  return user
}

function csrfHandler() {
  return http.get(`${apiOrigin}/v1/auth/csrf`, () =>
    HttpResponse.json({ csrfToken }),
  )
}

function problem(
  status: number,
  code: string,
  errors?: Array<{ pointer: string; code: string; detail: string }>,
) {
  return HttpResponse.json(
    {
      type: `https://example.test/problems/${code.toLowerCase()}`,
      title: 'Текст сервера не используется в UI',
      status,
      detail: 'Сырым текстом сервера нельзя показывать эту строку',
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

describe('CreateApprovalRequestForm', () => {
  beforeEach(clearCsrfToken)

  it('rejects an empty request through the generated schema without a POST', async () => {
    let postRequests = 0
    server.use(
      http.post(`${apiOrigin}/v1/approval-requests`, () => {
        postRequests += 1
        return HttpResponse.json(createdRequest)
      }),
    )
    renderCreateApprovalRequestForm()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Создать запрос' }))

    expect(await screen.findAllByRole('alert')).toHaveLength(2)
    expect(postRequests).toBe(0)
  })

  it('sends business fields with CSRF, caches the returned DTO, and navigates to details', async () => {
    let requestBody: unknown
    let requestCsrf: string | null = null
    server.use(
      csrfHandler(),
      http.post(`${apiOrigin}/v1/approval-requests`, async ({ request }) => {
        requestBody = await request.json()
        requestCsrf = request.headers.get('X-CSRF-Token')
        return HttpResponse.json(createdRequest, { status: 201 })
      }),
    )
    const { queryClient, router } = renderCreateApprovalRequestForm()
    const user = await fillValidRequest()

    await user.click(screen.getByRole('button', { name: 'Создать запрос' }))

    expect(
      await screen.findByText('Карточка запроса согласования'),
    ).toBeVisible()
    expect(router.state.location.pathname).toBe(
      `/approval-requests/${createdRequest.id}`,
    )
    expect(requestBody).toEqual({
      title: createdRequest.title,
      description: createdRequest.description,
    })
    expect(requestCsrf).toBe(csrfToken)
    expect(
      queryClient.getQueryData(approvalRequestQueryKey(createdRequest.id)),
    ).toEqual(createdRequest)
  })

  it('maps only supported backend validation pointers to form fields', async () => {
    server.use(
      csrfHandler(),
      http.post(`${apiOrigin}/v1/approval-requests`, () =>
        problem(422, 'VALIDATION_FAILED', [
          { pointer: '/title', code: 'too_small', detail: 'Введите название' },
          {
            pointer: '/description',
            code: 'too_small',
            detail: 'Введите описание',
          },
          {
            pointer: '/unknown',
            code: 'invalid',
            detail: 'Не показывать неизвестное поле',
          },
        ]),
      ),
    )
    renderCreateApprovalRequestForm()
    const user = await fillValidRequest()

    await user.click(screen.getByRole('button', { name: 'Создать запрос' }))

    expect(await screen.findByText('Введите название')).toBeVisible()
    expect(screen.getByText('Введите описание')).toBeVisible()
    expect(
      screen.queryByText('Не показывать неизвестное поле'),
    ).not.toBeInTheDocument()
  })

  it('renders safe copy for an unavailable dependency', async () => {
    server.use(
      csrfHandler(),
      http.post(`${apiOrigin}/v1/approval-requests`, () =>
        problem(503, 'DEPENDENCY_UNAVAILABLE'),
      ),
    )
    renderCreateApprovalRequestForm()
    const user = await fillValidRequest()

    await user.click(screen.getByRole('button', { name: 'Создать запрос' }))

    expect(await screen.findByText('Сервис временно недоступен.')).toBeVisible()
    expect(
      screen.queryByText('Сырым текстом сервера нельзя показывать эту строку'),
    ).not.toBeInTheDocument()
  })

  it('uses the shared loading button and prevents a duplicate POST while pending', async () => {
    let postRequests = 0
    let releaseRequest!: () => void
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      csrfHandler(),
      http.post(`${apiOrigin}/v1/approval-requests`, async () => {
        postRequests += 1
        await requestGate
        return HttpResponse.json(createdRequest, { status: 201 })
      }),
    )
    renderCreateApprovalRequestForm()
    const user = await fillValidRequest()

    await user.click(screen.getByRole('button', { name: 'Создать запрос' }))

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Создаём запрос' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    })
    await user.click(
      screen.getByRole('button', { name: 'Создаём запрос' }),
    )
    await waitFor(() => expect(postRequests).toBe(1))
    releaseRequest()
  })

  it('revalidates the protected router after authentication is required without showing a stale business error', async () => {
    let loaderCalls = 0
    server.use(
      csrfHandler(),
      http.post(`${apiOrigin}/v1/approval-requests`, () =>
        problem(401, 'AUTHENTICATION_REQUIRED'),
      ),
    )
    renderCreateApprovalRequestForm(() => {
      loaderCalls += 1
      return null
    })
    const user = await fillValidRequest()

    await user.click(screen.getByRole('button', { name: 'Создать запрос' }))

    await waitFor(() => expect(loaderCalls).toBe(1))
    expect(
      screen.queryByText('Сырым текстом сервера нельзя показывать эту строку'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
