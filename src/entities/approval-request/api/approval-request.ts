import { type QueryClient, useQuery } from '@tanstack/react-query'

import {
  getApprovalRequestsGetQueryKey,
  getApprovalRequestsGetQueryOptions,
  isProblemCode,
  approvalRequestPathSchema,
  type ApprovalRequestResponseDto,
} from '@/shared/api'

/**
 * Возвращает canonical cache identity для валидного UUID запроса.
 *
 * @remarks Нормализует только регистр валидного UUID. Невалидное значение
 * сохраняется без изменений, чтобы helper ключа не подменял route validation.
 */
function getApprovalRequestCacheId(requestId: string): string {
  const parsed = approvalRequestPathSchema.safeParse({ requestId })
  return parsed.success ? parsed.data.requestId.toLowerCase() : requestId
}

/**
 * Создаёт ключ кеша React Query для запроса согласования.
 *
 * @remarks Делегирует generated helper с canonical lowercase identity для
 * валидного UUID. Поэтому route UUID в любом допустимом регистре, create и
 * decide используют один detail-кеш; невалидные строки остаются без
 * нормализации.
 */
export function approvalRequestQueryKey(requestId: string) {
  return getApprovalRequestsGetQueryKey({
    requestId: getApprovalRequestCacheId(requestId),
  })
}

/**
 * Создаёт параметры React Query для загрузки запроса согласования.
 *
 * @remarks Сохраняет исходное написание `requestId` в generated `queryFn` и
 * HTTP URL, но подменяет только query key на canonical entity identity.
 * Generated `queryFn` продолжает передавать `AbortSignal` в API mutator.
 */
export function approvalRequestQueryOptions(requestId: string) {
  return getApprovalRequestsGetQueryOptions(
    { requestId },
    {
      query: {
        queryKey: approvalRequestQueryKey(requestId),
      },
    },
  )
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
 * @remarks Использует canonical UUID identity, чтобы lowercase DTO сервера
 * заменял данные активного detail-запроса даже после uppercase route. Результат
 * create или decide записывается без optimistic преобразований.
 */
export function setApprovalRequest(
  queryClient: QueryClient,
  request: ApprovalRequestResponseDto,
): void {
  queryClient.setQueryData(approvalRequestQueryKey(request.id), request)
}
