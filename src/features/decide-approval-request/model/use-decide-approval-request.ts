import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRevalidator } from 'react-router'

import {
  approvalRequestQueryKey,
  setApprovalRequest,
} from '@/entities/approval-request'
import {
  approvalRequestsDecide,
  isProblemCode,
  type DecideApprovalRequestDtoDecision,
} from '@/shared/api'

/**
 * Создаёт mutation для подтверждённого решения по запросу согласования.
 *
 * @remarks Требует React Query и React Router providers. После успеха записывает
 * точный DTO сервера в detail-кеш без optimistic изменения статуса. При конфликте
 * или исчезновении запроса инвалидирует detail; активный query при этом
 * перезапрашивается общей policy TanStack Query. При
 * `AUTHENTICATION_REQUIRED` запускает route revalidation.
 *
 * @returns Mutation, принимающий generated `DecideApprovalRequestDtoDecision`.
 */
export function useDecideApprovalRequest(requestId: string) {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()

  return useMutation({
    mutationFn: (decision: DecideApprovalRequestDtoDecision) =>
      approvalRequestsDecide({ requestId }, { decision }),
    onSuccess: (request) => {
      setApprovalRequest(queryClient, request)
    },
    onError: async (error) => {
      if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
        await revalidator.revalidate()
        return
      }
      const requiresRefresh =
        isProblemCode(error, 'APPROVAL_REQUEST_ALREADY_DECIDED') ||
        isProblemCode(error, 'APPROVAL_REQUEST_NOT_FOUND')
      if (requiresRefresh) {
        await queryClient.invalidateQueries({
          queryKey: approvalRequestQueryKey(requestId),
        })
      }
    },
  })
}
