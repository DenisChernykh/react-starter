import type { QueryClient } from '@tanstack/react-query'

import { clearCsrfToken } from '@/shared/api'

import {
  currentSessionQueryKey,
  currentSessionQueryOptions,
} from '../api/session'

export async function refreshCurrentSession(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: currentSessionQueryKey() })
  return queryClient.fetchQuery(currentSessionQueryOptions())
}

export function clearCurrentSession(queryClient: QueryClient) {
  clearCsrfToken()
  queryClient.removeQueries({ queryKey: currentSessionQueryKey() })
}
