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
 * Удаляет сессию, CSRF-токен и все данные предыдущего пользователя.
 *
 * @remarks Не выполняет HTTP-запрос. Полностью очищает общий QueryClient, чтобы
 * queries и mutations одного principal не переживали logout, authentication loss
 * или последующий вход другого пользователя.
 */
export function clearCurrentSession(queryClient: QueryClient) {
  clearCsrfToken()
  queryClient.clear()
}
