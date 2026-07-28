import { useSuspenseQuery } from '@tanstack/react-query'

import {
  authGetMe,
  getAuthGetMeQueryKey,
  getAuthGetMeQueryOptions,
} from '@/shared/api'

export const currentSessionQueryKey = getAuthGetMeQueryKey
export const currentSessionQueryOptions = getAuthGetMeQueryOptions

export function useCurrentSession() {
  return useSuspenseQuery({
    ...currentSessionQueryOptions(),
    queryFn: ({ signal }) => authGetMe(undefined, signal),
  })
}
