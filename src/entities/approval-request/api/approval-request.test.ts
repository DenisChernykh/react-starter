import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import {
  getApprovalRequestsGetQueryKey,
  type ApprovalRequestResponseDto,
} from '@/shared/api'

import {
  approvalRequestQueryKey,
  approvalRequestQueryOptions,
  setApprovalRequest,
} from './approval-request'

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

  it('writes a request under its generated query key', () => {
    const queryClient = new QueryClient()

    setApprovalRequest(queryClient, request)

    expect(
      queryClient.getQueryData(approvalRequestQueryKey(request.id)),
    ).toEqual(request)
  })
})
