import { QueryClient } from '@tanstack/react-query'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

/**
 * Определяет, нужно ли повторить неудачный запрос к API.
 *
 * @remarks Не повторяет protocol errors и попытки после второй. Повторяет сетевые
 * ошибки и problem responses со статусом `5xx`.
 */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2 || error instanceof ApiProtocolError) return false
  if (error instanceof ApiNetworkError) return true
  return error instanceof ApiProblemError && error.status >= 500
}

/**
 * Общий клиент React Query с настройками повторных запросов.
 *
 * @remarks Queries используют `shouldRetryQuery` и не перезапрашиваются при
 * возврате фокуса окна. Mutations намеренно не повторяются автоматически.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
