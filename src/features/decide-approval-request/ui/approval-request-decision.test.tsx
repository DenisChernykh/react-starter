import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { approvalRequestQueryKey } from '@/entities/approval-request'
import {
  approvalRequestsGet,
  type ApprovalRequestResponseDto,
  type CurrentUserResponseDto,
  type ProblemCode,
} from '@/shared/api'
import { server } from '@/shared/lib/testing'

import { ApprovalRequestDecision } from './approval-request-decision'

const apiOrigin = 'http://localhost:3000'
const csrfToken = 'C'.repeat(43)
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
  createdAt: '2026-07-29T06:15:00.000Z',
  decidedAt: null,
} satisfies ApprovalRequestResponseDto

const approvedRequest = {
  ...pendingRequest,
  status: 'approved',
  decidedByUserId: reviewerId,
  decidedAt: '2026-07-29T06:30:00.000Z',
} satisfies ApprovalRequestResponseDto

const rejectedRequest = {
  ...pendingRequest,
  status: 'rejected',
  decidedByUserId: reviewerId,
  decidedAt: '2026-07-29T06:30:00.000Z',
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

type RenderDecisionOptions = {
  request?: ApprovalRequestResponseDto
  currentUser?: CurrentUserResponseDto
  loader?: () => null
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderApprovalRequestDecision({
  request = pendingRequest,
  currentUser = reviewer,
  loader,
}: RenderDecisionOptions = {}) {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(
    [
      {
        id: 'approval-request',
        path: '/approval-requests/:requestId',
        ...(loader === undefined ? {} : { loader }),
        element: (
          <ApprovalRequestDecision
            request={request}
            currentUser={currentUser}
          />
        ),
      },
    ],
    { initialEntries: [`/approval-requests/${requestId}`] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}

function csrfHandler() {
  return http.get(`${apiOrigin}/v1/auth/csrf`, () =>
    HttpResponse.json({ csrfToken }),
  )
}

function problem(
  status: number,
  code: ProblemCode,
  requestIdValue = String(status),
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

function ApprovalRequestDetailFixture() {
  const details = useQuery({
    queryKey: approvalRequestQueryKey(requestId),
    queryFn: () => approvalRequestsGet({ requestId }),
    retry: false,
  })

  if (details.isError) return <p>Запрос недоступен</p>
  if (details.data === undefined) return <p>Загружаем запрос</p>

  return (
    <ApprovalRequestDecision request={details.data} currentUser={reviewer} />
  )
}

function renderActiveApprovalRequestDetail() {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(
    [
      {
        path: '/approval-requests/:requestId',
        element: <ApprovalRequestDetailFixture />,
      },
    ],
    { initialEntries: [`/approval-requests/${requestId}`] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}

describe('ApprovalRequestDecision', () => {
  it('shows a neutral note instead of decision controls to the request author', () => {
    renderApprovalRequestDecision({ currentUser: author })

    expect(
      screen.getByText(
        'Собственный запрос должен одобрить другой пользователь.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Одобрить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Отклонить' }),
    ).not.toBeInTheDocument()
  })

  it('shows a neutral note instead of decision controls without permission', () => {
    renderApprovalRequestDecision({ currentUser: userWithoutPermission })

    expect(
      screen.getByText('У вас нет права принимать решение по этому запросу.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Одобрить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Отклонить' }),
    ).not.toBeInTheDocument()
  })

  it('hides decision controls for a terminal request', () => {
    renderApprovalRequestDecision({ request: approvedRequest })

    expect(
      screen.queryByRole('button', { name: 'Одобрить' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Отклонить' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows approve and reject controls to an eligible reviewer', () => {
    renderApprovalRequestDecision()

    expect(screen.getByRole('button', { name: 'Одобрить' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeVisible()
  })

  it.each([
    { action: 'Одобрить', title: 'Одобрить запрос?' },
    { action: 'Отклонить', title: 'Отклонить запрос?' },
  ])(
    'opens the $action confirmation without sending PUT',
    async ({ action, title }) => {
      let putRequests = 0
      server.use(
        http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, () => {
          putRequests += 1
          return HttpResponse.json(approvedRequest)
        }),
      )
      renderApprovalRequestDecision()
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: action }))

      expect(await screen.findByRole('heading', { name: title })).toBeVisible()
      expect(
        screen.getByText(`«${pendingRequest.title}». Решение нельзя отменить.`),
      ).toBeVisible()
      expect(putRequests).toBe(0)
    },
  )

  it.each([
    { action: 'Одобрить', decision: 'approved', response: approvedRequest },
    { action: 'Отклонить', decision: 'rejected', response: rejectedRequest },
  ])(
    'sends the exact $decision decision DTO only after confirmation',
    async ({ action, decision, response }) => {
      let requestBody: unknown
      server.use(
        csrfHandler(),
        http.put(
          `${apiOrigin}/v1/approval-requests/:id/decision`,
          async ({ request }) => {
            requestBody = await request.json()
            return HttpResponse.json(response)
          },
        ),
      )
      renderApprovalRequestDecision()
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: action }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: action }))

      await waitFor(() => expect(requestBody).toEqual({ decision }))
    },
  )

  it('uses a loading shared action and locks cancellation while confirmation is pending', async () => {
    let putRequests = 0
    let releaseRequest!: () => void
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      csrfHandler(),
      http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, async () => {
        putRequests += 1
        await requestGate
        return HttpResponse.json(approvedRequest)
      }),
    )
    renderApprovalRequestDecision()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Одобрить' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }))

    const confirmation = await within(dialog).findByRole('button', {
      name: 'Одобряем запрос',
    })
    expect(confirmation).toBeDisabled()
    expect(confirmation).toHaveAttribute('aria-busy', 'true')
    expect(
      within(dialog).getByRole('button', { name: 'Отмена' }),
    ).toBeDisabled()
    await user.click(confirmation)
    await waitFor(() => expect(putRequests).toBe(1))

    releaseRequest()
  })

  it('writes the returned server DTO to detail cache and closes the dialog', async () => {
    server.use(
      csrfHandler(),
      http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, () =>
        HttpResponse.json(approvedRequest),
      ),
    )
    const { queryClient } = renderApprovalRequestDecision()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Одобрить' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }))

    await waitFor(() => {
      expect(
        queryClient.getQueryData(approvalRequestQueryKey(requestId)),
      ).toEqual(approvedRequest)
    })
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('refreshes active details and shows safe conflict copy when a request was already decided', async () => {
    let detailsRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:id`, () => {
        detailsRequests += 1
        return HttpResponse.json(
          detailsRequests === 1 ? pendingRequest : approvedRequest,
        )
      }),
      csrfHandler(),
      http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, () =>
        problem(409, 'APPROVAL_REQUEST_ALREADY_DECIDED'),
      ),
    )
    renderActiveApprovalRequestDetail()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Одобрить' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }))

    expect(
      await screen.findByText('Запрос уже обработан. Данные обновлены.'),
    ).toBeVisible()
    await waitFor(() => expect(detailsRequests).toBeGreaterThanOrEqual(2))
  })

  it('refreshes active details into the unavailable state when the request disappears', async () => {
    let detailsRequests = 0
    let requestIsUnavailable = false
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:id`, () => {
        detailsRequests += 1
        return requestIsUnavailable
          ? problem(404, 'APPROVAL_REQUEST_NOT_FOUND')
          : HttpResponse.json(pendingRequest)
      }),
      csrfHandler(),
      http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, () => {
        requestIsUnavailable = true
        return problem(404, 'APPROVAL_REQUEST_NOT_FOUND')
      }),
    )
    renderActiveApprovalRequestDetail()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Одобрить' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }))

    expect(await screen.findByText('Запрос недоступен')).toBeVisible()
    await waitFor(() => expect(detailsRequests).toBeGreaterThanOrEqual(2))
  })

  it('revalidates the route after an authentication failure', async () => {
    let loaderCalls = 0
    server.use(
      csrfHandler(),
      http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, () =>
        problem(401, 'AUTHENTICATION_REQUIRED'),
      ),
    )
    renderApprovalRequestDecision({
      loader: () => {
        loaderCalls += 1
        return null
      },
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Одобрить' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }))

    await waitFor(() => expect(loaderCalls).toBe(2))
  })

  it.each(['Одобрить', 'Отклонить'])(
    'returns focus to the exact %s trigger after cancellation',
    async (action) => {
      renderApprovalRequestDecision()
      const user = userEvent.setup()
      const trigger = screen.getByRole('button', { name: action })

      await user.click(trigger)
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))

      await waitFor(() => expect(trigger).toHaveFocus())
    },
  )

  it('keeps a failed dialog open with safe copy and without raw server detail', async () => {
    server.use(
      csrfHandler(),
      http.put(`${apiOrigin}/v1/approval-requests/:id/decision`, () =>
        problem(503, 'DEPENDENCY_UNAVAILABLE'),
      ),
    )
    renderApprovalRequestDecision()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Одобрить' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить' }))

    expect(await screen.findByText('Сервис временно недоступен.')).toBeVisible()
    expect(screen.getByRole('alertdialog')).toBeVisible()
    expect(
      screen.queryByText('Сырой detail сервера нельзя показывать пользователю'),
    ).not.toBeInTheDocument()
  })
})
