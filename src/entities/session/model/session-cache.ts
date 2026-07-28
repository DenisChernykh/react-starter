import type { QueryClient } from '@tanstack/react-query'

import { clearCsrfToken } from '@/shared/api'

import {
  currentSessionQueryKey,
  currentSessionQueryOptions,
} from '../api/session'

/** Обновляет данные текущей пользовательской сессии в кеше. */
export async function refreshCurrentSession(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: currentSessionQueryKey() })
  return queryClient.fetchQuery(currentSessionQueryOptions())
}

/** Удаляет сессию и CSRF-токен из клиентского кеша. */
export function clearCurrentSession(queryClient: QueryClient) {
  clearCsrfToken()
  queryClient.removeQueries({ queryKey: currentSessionQueryKey() })
}
