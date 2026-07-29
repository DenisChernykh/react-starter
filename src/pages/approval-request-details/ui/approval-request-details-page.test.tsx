import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import type {
  ApprovalRequestResponseDto,
  CurrentUserResponseDto,
  ProblemCode,
} from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { ApprovalRequestDetailsPage } from './approval-request-details-page'

const apiOrigin = 'http://localhost:3000'
const requestId = 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184'
const authorId = '401deac1-f230-4926-961e-d4c3ac510cec'
const reviewerId = '6a9f79ea-b651-4dc2-870b-c4e9f2da4d58'

const pendingRequest = {
  id: requestId,
  title: 'Публикация релиза',
  description: 'Проверить релиз перед публикацией',
  status: 'pending',
  createdByUserId: authorId,
  decidedByUserId: null,
  createdAt: '2026-07-29T12:15:00.000Z',
  decidedAt: null,
} satisfies ApprovalRequestResponseDto

const approvedRequest = {
  ...pendingRequest,
  status: 'approved',
  decidedByUserId: reviewerId,
  decidedAt: '2026-07-29T12:30:00.000Z',
} satisfies ApprovalRequestResponseDto

const reviewer = {
  normalizedEmail: 'reviewer@example.test',
  permissions: ['approval.requests.decide'],
  roleKeys: ['reviewer'],
  userId: reviewerId,
} satisfies CurrentUserResponseDto

const author = {
  ...reviewer,
  userId: authorId,
} satisfies CurrentUserResponseDto

const userWithoutPermission = {
  ...reviewer,
  permissions: [],
} satisfies CurrentUserResponseDto

const routers = new Set<ReturnType<typeof createMemoryRouter>>()
const queryClients = new Set<QueryClient>()

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  queryClients.add(queryClient)
  return queryClient
}

function renderApprovalRequestDetails(
  initialEntry = `/approval-requests/${requestId}`,
  currentUser = reviewer,
) {
  const queryClient = createQueryClient()
  queryClient.setQueryData(currentSessionQueryKey(), currentUser)
  const router = createMemoryRouter(
    [
      {
        path: '/approval-requests/:requestId',
        element: <ApprovalRequestDetailsPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  )
  routers.add(router)

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}

function problem(
  status: number,
  code: ProblemCode,
  requestIdValue = `problem-${status}`,
) {
  return HttpResponse.json(
    {
      type: `https://example.test/problems/${code.toLowerCase()}`,
      title: 'Текст сервера не используется в UI',
      status,
      detail: 'Сырой detail сервера нельзя показывать пользователю',
      instance: `urn:request:${requestIdValue}`,
      code,
      requestId: requestIdValue,
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  )
}

afterEach(() => {
  for (const router of routers) router.dispose()
  routers.clear()
  for (const queryClient of queryClients) queryClient.clear()
  queryClients.clear()
})

describe('ApprovalRequestDetailsPage', () => {
  it('shows an unavailable state without a GET for a malformed route parameter', () => {
    let getRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () => {
        getRequests += 1
        return HttpResponse.json(pendingRequest)
      }),
    )

    renderApprovalRequestDetails('/approval-requests/not-a-uuid')

    expect(screen.getByText('Запрос недоступен')).toBeVisible()
    expect(getRequests).toBe(0)
  })

  it('shows accessible loading feedback while the detail GET is pending', async () => {
    let releaseRequest!: () => void
    const responseGate = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, async () => {
        await responseGate
        return HttpResponse.json(pendingRequest)
      }),
    )

    renderApprovalRequestDetails()

    expect(await screen.findByText('Загружаем запрос')).toBeVisible()
    expect(
      screen.getByRole('status', { name: 'Загружаем запрос' }),
    ).toBeVisible()
    releaseRequest()
  })

  it('renders request fields, formatted dates and pending decision values', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        HttpResponse.json(pendingRequest),
      ),
    )

    renderApprovalRequestDetails()

    expect(
      await screen.findByRole('heading', { name: pendingRequest.title }),
    ).toBeVisible()
    expect(screen.getByText(pendingRequest.id)).toBeVisible()
    expect(screen.getByText('Ожидает решения')).toBeVisible()
    expect(screen.getByText(pendingRequest.description)).toBeVisible()
    expect(screen.getByText(pendingRequest.createdByUserId)).toBeVisible()
    expect(screen.getAllByText('Решение ещё не принято')).toHaveLength(2)
    expect(screen.getByText(/29\.07\.2026/u)).toBeVisible()
    expect(screen.queryByText(pendingRequest.createdAt)).not.toBeInTheDocument()
  })

  it('keeps maximum unbroken title and multiline-capable description readable in a mobile card', async () => {
    const longRequest = {
      ...pendingRequest,
      title: 'З'.repeat(120),
      description: 'О'.repeat(2_000),
    } satisfies ApprovalRequestResponseDto
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        HttpResponse.json(longRequest),
      ),
    )

    renderApprovalRequestDetails()

    const title = await screen.findByRole('heading', {
      name: longRequest.title,
    })
    const description = screen.getByText(longRequest.description)
    const card = title.closest('[data-slot="card"]')

    expect(title).toHaveClass('min-w-0', '[overflow-wrap:anywhere]')
    expect(description).toHaveClass(
      'min-w-0',
      'whitespace-pre-wrap',
      '[overflow-wrap:anywhere]',
    )
    expect(card).toHaveClass('min-w-0', 'overflow-visible')
    expect(card).not.toHaveClass('overflow-hidden')
  })

  it('renders the terminal decision actor and date', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        HttpResponse.json(approvedRequest),
      ),
    )

    renderApprovalRequestDetails()

    expect(await screen.findByText('Одобрен')).toBeVisible()
    expect(screen.getByText(reviewerId)).toBeVisible()
    expect(screen.getAllByText(/29\.07\.2026/u)).toHaveLength(2)
  })

  it('renders a safe unavailable message for a concealed request', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        problem(404, 'APPROVAL_REQUEST_NOT_FOUND', 'not-found-request'),
      ),
    )

    renderApprovalRequestDetails()

    expect(
      await screen.findByText('Запрос не существует или недоступен'),
    ).toBeVisible()
    expect(screen.getByText('Код запроса: not-found-request')).toBeVisible()
    expect(
      screen.queryByText('Сырой detail сервера нельзя показывать пользователю'),
    ).not.toBeInTheDocument()
  })

  it.each([
    {
      response: () => HttpResponse.error(),
      message: 'Не удалось подключиться к серверу.',
    },
    {
      response: () => problem(503, 'DEPENDENCY_UNAVAILABLE'),
      message: 'Сервис временно недоступен.',
    },
  ])(
    'renders safe retryable copy for a failed detail request',
    async ({ response, message }) => {
      server.use(
        http.get(`${apiOrigin}/v1/approval-requests/:requestId`, response),
      )

      renderApprovalRequestDetails()

      expect(await screen.findByText(message)).toBeVisible()
      expect(screen.getByRole('button', { name: 'Повторить' })).toBeVisible()
      expect(
        screen.queryByText(
          'Сырой detail сервера нельзя показывать пользователю',
        ),
      ).not.toBeInTheDocument()
    },
  )

  it('does not offer retry for a protocol error', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        HttpResponse.json({ unexpected: true }, { status: 503 }),
      ),
    )

    renderApprovalRequestDetails()

    expect(
      await screen.findByText('Сервер вернул некорректный ответ.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument()
  })

  it('refetches the real query after retrying a failed request', async () => {
    let getRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () => {
        getRequests += 1
        return getRequests === 1
          ? HttpResponse.error()
          : HttpResponse.json(pendingRequest)
      }),
    )
    const user = userEvent.setup()

    renderApprovalRequestDetails()

    await user.click(await screen.findByRole('button', { name: 'Повторить' }))

    expect(
      await screen.findByRole('heading', { name: pendingRequest.title }),
    ).toBeVisible()
    expect(getRequests).toBe(2)
  })

  it('shows decision controls only to an eligible reviewer', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        HttpResponse.json(pendingRequest),
      ),
    )

    renderApprovalRequestDetails()

    expect(
      await screen.findByRole('button', { name: 'Одобрить' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeVisible()
  })

  it.each([
    {
      currentUser: author,
      message: 'Собственный запрос должен одобрить другой пользователь.',
    },
    {
      currentUser: userWithoutPermission,
      message: 'У вас нет права принимать решение по этому запросу.',
    },
  ])(
    'does not show decision controls when the user cannot decide',
    async ({ currentUser, message }) => {
      server.use(
        http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
          HttpResponse.json(pendingRequest),
        ),
      )

      renderApprovalRequestDetails(undefined, currentUser)

      expect(await screen.findByText(message)).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Одобрить' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Отклонить' }),
      ).not.toBeInTheDocument()
    },
  )

  it('does not show decision controls for a terminal request', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () =>
        HttpResponse.json(approvedRequest),
      ),
    )

    renderApprovalRequestDetails()

    await screen.findByText('Одобрен')
    expect(
      screen.queryByRole('button', { name: 'Одобрить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Отклонить' }),
    ).not.toBeInTheDocument()
  })
})
