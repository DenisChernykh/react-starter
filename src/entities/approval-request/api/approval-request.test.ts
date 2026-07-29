import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  getApprovalRequestsGetQueryKey,
  type ApprovalRequestResponseDto,
} from '@/shared/api'
import { server } from '@/shared/lib/testing'

import {
  approvalRequestQueryKey,
  approvalRequestQueryOptions,
  setApprovalRequest,
} from './approval-request'

const apiOrigin = 'http://localhost:3000'

const request = {
  createdAt: '2026-07-29T06:15:00.000Z',
  createdByUserId: 'author-1',
  decidedAt: null,
  decidedByUserId: null,
  description: 'Проверить договор',
  id: 'request-1',
  status: 'pending',
  title: 'Согласовать договор',
} satisfies ApprovalRequestResponseDto

describe('approval request query adapter', () => {
  it('uses the generated query key for a request', () => {
    expect(approvalRequestQueryKey(request.id)).toEqual(
      getApprovalRequestsGetQueryKey({ requestId: request.id }),
    )
  })

  it('preserves the generated query key in query options', () => {
    expect(approvalRequestQueryOptions(request.id).queryKey).toEqual(
      approvalRequestQueryKey(request.id),
    )
  })

  it('forwards TanStack Query cancellation to the HTTP request', async () => {
    let resolveRequestStarted!: () => void
    const requestStarted = new Promise<void>((resolve) => {
      resolveRequestStarted = resolve
    })
    let releaseResponse!: () => void
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    let querySignal: AbortSignal | undefined
    let generatedRequestOutcome: 'pending' | 'resolved' | 'rejected' = 'pending'

    server.use(
      http.get(`${apiOrigin}/v1/approval-requests/${request.id}`, async () => {
        resolveRequestStarted()
        await responseReleased
        return HttpResponse.json(request)
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryOptions = approvalRequestQueryOptions(request.id)
    const generatedQueryFn = queryOptions.queryFn
    if (typeof generatedQueryFn !== 'function') {
      throw new Error('Generated approval request queryFn is required')
    }
    const settledQuery = queryClient
      .fetchQuery({
        ...queryOptions,
        queryFn: (context) => {
          querySignal = context.signal
          const generatedRequest = Promise.resolve(generatedQueryFn(context))
          void generatedRequest.then(
            () => {
              generatedRequestOutcome = 'resolved'
            },
            () => {
              generatedRequestOutcome = 'rejected'
            },
          )
          return generatedRequest
        },
      })
      .catch(() => undefined)

    try {
      await requestStarted
      await queryClient.cancelQueries({
        queryKey: approvalRequestQueryKey(request.id),
      })

      expect(querySignal?.aborted).toBe(true)
      await expect.poll(() => generatedRequestOutcome).toBe('rejected')
    } finally {
      releaseResponse()
      await settledQuery
    }
  })

  it('writes a request under its generated query key', () => {
    const queryClient = new QueryClient()

    setApprovalRequest(queryClient, request)

    expect(
      queryClient.getQueryData(approvalRequestQueryKey(request.id)),
    ).toEqual(request)
  })
})
