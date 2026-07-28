import { QueryClient } from '@tanstack/react-query'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

/** Определяет, нужно ли повторить неудачный запрос к API. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2 || error instanceof ApiProtocolError) return false
  if (error instanceof ApiNetworkError) return true
  return error instanceof ApiProblemError && error.status >= 500
}

/** Общий клиент React Query с настройками повторных запросов. */
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
