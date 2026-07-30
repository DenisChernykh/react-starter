import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { OpenApprovalRequestForm } from './open-approval-request-form'

const apiOrigin = 'http://localhost:3000'
const requestId = 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184'
const uppercaseRequestId = requestId.toUpperCase()

function renderOpenApprovalRequestForm() {
  const router = createMemoryRouter(
    [
      {
        path: '/approval-requests/open',
        element: <OpenApprovalRequestForm />,
      },
      {
        path: '/approval-requests/:requestId',
        element: <p>Карточка запроса согласования</p>,
      },
    ],
    { initialEntries: ['/approval-requests/open'] },
  )

  render(<RouterProvider router={router} />)

  return router
}

describe('OpenApprovalRequestForm', () => {
  it('shows generated local validation for an empty request ID', async () => {
    const router = renderOpenApprovalRequestForm()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Открыть запрос' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(await screen.findByText('Неверный UUID')).toBeVisible()
    expect(router.state.location.pathname).toBe('/approval-requests/open')
  })

  it('does not navigate or request details for a malformed request ID', async () => {
    let detailsRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () => {
        detailsRequests += 1
        return HttpResponse.json({})
      }),
    )
    const router = renderOpenApprovalRequestForm()
    const user = userEvent.setup()

    await user.type(
      screen.getByRole('textbox', { name: 'ID запроса' }),
      'not-a-uuid',
    )
    await user.click(screen.getByRole('button', { name: 'Открыть запрос' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(await screen.findByText('Неверный UUID')).toBeVisible()
    expect(router.state.location.pathname).toBe('/approval-requests/open')
    expect(detailsRequests).toBe(0)
  })

  it('preserves uppercase UUID spelling in the details route without requesting it', async () => {
    let detailsRequests = 0
    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/:requestId`, () => {
        detailsRequests += 1
        return HttpResponse.json({})
      }),
    )
    const router = renderOpenApprovalRequestForm()
    const user = userEvent.setup()

    await user.type(
      screen.getByRole('textbox', { name: 'ID запроса' }),
      uppercaseRequestId,
    )
    await user.click(screen.getByRole('button', { name: 'Открыть запрос' }))

    expect(
      await screen.findByText('Карточка запроса согласования'),
    ).toBeVisible()
    expect(router.state.location.pathname).toBe(
      `/approval-requests/${uppercaseRequestId}`,
    )
    expect(detailsRequests).toBe(0)
  })
})
