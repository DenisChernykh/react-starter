import { type QueryClient, useQuery } from '@tanstack/react-query'

import {
  getApprovalRequestsGetQueryKey,
  getApprovalRequestsGetQueryOptions,
  isProblemCode,
  type ApprovalRequestResponseDto,
} from '@/shared/api'

/**
 * Создаёт ключ кеша React Query для запроса согласования.
 *
 * @remarks Делегирует generated helper, поэтому create, detail и decide используют
 * идентичную cache identity без локального дублирования URL-контракта.
 */
export function approvalRequestQueryKey(requestId: string) {
  return getApprovalRequestsGetQueryKey({ requestId })
}

/**
 * Создаёт параметры React Query для загрузки запроса согласования.
 *
 * @remarks Сохраняет generated `queryFn`, который передаёт `AbortSignal` в API
 * mutator, и его cache key без ручного повторения transport-логики.
 */
export function approvalRequestQueryOptions(requestId: string) {
  return getApprovalRequestsGetQueryOptions({ requestId })
}

/**
 * Загружает запрос согласования и передаёт только отсутствие аутентификации в route boundary.
 *
 * @remarks Требует `QueryClientProvider`. Ошибки авторизации и остальные API-ошибки
 * остаются состоянием страницы; `AUTHENTICATION_REQUIRED` выбрасывается для общего
 * маршрутизирующего fallback.
 */
export function useApprovalRequest(requestId: string) {
  return useQuery({
    ...approvalRequestQueryOptions(requestId),
    throwOnError: (error) => isProblemCode(error, 'AUTHENTICATION_REQUIRED'),
  })
}

/**
 * Записывает запрос согласования в detail-кеш React Query.
 *
 * @remarks Использует единственный entity helper для cache write и generated
 * cache key, чтобы результат create или decide был виден detail-запросу.
 */
export function setApprovalRequest(
  queryClient: QueryClient,
  request: ApprovalRequestResponseDto,
): void {
  queryClient.setQueryData(approvalRequestQueryKey(request.id), request)
}
