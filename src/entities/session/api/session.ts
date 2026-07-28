import { useSuspenseQuery } from '@tanstack/react-query'

import {
  authGetMe,
  getAuthGetMeQueryKey,
  getAuthGetMeQueryOptions,
} from '@/shared/api'

/**
 * Создаёт ключ кеша текущей пользовательской сессии.
 *
 * @remarks Тот же ключ используют route loaders, hooks и cache helpers для
 * согласованного чтения, инвалидирования и удаления сессии.
 */
export const currentSessionQueryKey = getAuthGetMeQueryKey
/**
 * Создаёт параметры запроса текущей пользовательской сессии.
 *
 * @remarks Основан на generated query options, чтобы session entity не дублировала
 * transport contract API.
 */
export const currentSessionQueryOptions = getAuthGetMeQueryOptions

/**
 * Возвращает текущую пользовательскую сессию из React Query.
 *
 * @remarks Использует suspense query и должен вызываться внутри `AppProvider` и
 * маршрута, который уже гарантирует наличие аутентифицированной сессии.
 */
export function useCurrentSession() {
  return useSuspenseQuery({
    ...currentSessionQueryOptions(),
    queryFn: ({ signal }) => authGetMe(undefined, signal),
  })
}
