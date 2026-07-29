import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { setApprovalRequest } from '@/entities/approval-request'
import {
  approvalRequestsCreate,
  type CreateApprovalRequestDto,
} from '@/shared/api'
import { approvalRequestDetailsPath } from '@/shared/routes'

/**
 * Создаёт запрос согласования, сохраняет ответ в detail-кеше и открывает его карточку.
 *
 * @remarks Требует `QueryClientProvider` и React Router. После успешной mutation
 * записывает точный DTO сервера только через `setApprovalRequest`, не создаёт и не
 * инвалидирует list-кеш, затем выполняет навигацию на details route.
 *
 * @returns Mutation React Query для отправки `CreateApprovalRequestDto`.
 */
export function useCreateApprovalRequest() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (input: CreateApprovalRequestDto) =>
      approvalRequestsCreate(input),
    onSuccess: (request) => {
      setApprovalRequest(queryClient, request)
      void navigate(approvalRequestDetailsPath(request.id))
    },
  })
}
