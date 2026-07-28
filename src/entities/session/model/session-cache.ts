import type { QueryClient } from '@tanstack/react-query'

import { clearCsrfToken } from '@/shared/api'

import {
  currentSessionQueryKey,
  currentSessionQueryOptions,
} from '../api/session'

/**
 * Обновляет данные текущей пользовательской сессии в кеше.
 *
 * @remarks Сначала инвалидирует текущий session key, затем немедленно запрашивает
 * свежую сессию, а не ждёт фонового refetch.
 *
 * @returns Promise с актуальными данными сессии.
 */
export async function refreshCurrentSession(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: currentSessionQueryKey() })
  return queryClient.fetchQuery(currentSessionQueryOptions())
}

/**
 * Удаляет сессию и CSRF-токен из клиентского кеша.
 *
 * @remarks Не выполняет HTTP-запрос. Вызывающий код отвечает за server-side logout,
 * после чего UI больше не может использовать устаревшие данные или CSRF-токен.
 */
export function clearCurrentSession(queryClient: QueryClient) {
  clearCsrfToken()
  queryClient.removeQueries({ queryKey: currentSessionQueryKey() })
}
