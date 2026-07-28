import { useSuspenseQuery } from '@tanstack/react-query'

import {
  authGetMe,
  getAuthGetMeQueryKey,
  getAuthGetMeQueryOptions,
} from '@/shared/api'

/** Создаёт ключ кеша текущей пользовательской сессии. */
export const currentSessionQueryKey = getAuthGetMeQueryKey
/** Создаёт параметры запроса текущей пользовательской сессии. */
export const currentSessionQueryOptions = getAuthGetMeQueryOptions

/** Возвращает текущую пользовательскую сессию из React Query. */
export function useCurrentSession() {
  return useSuspenseQuery({
    ...currentSessionQueryOptions(),
    queryFn: ({ signal }) => authGetMe(undefined, signal),
  })
}
