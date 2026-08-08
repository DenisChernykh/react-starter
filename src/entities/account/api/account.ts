import { type QueryClient, useQuery } from '@tanstack/react-query'

import {
  adminAuthGetAccount,
  adminAuthListAccounts,
  adminAuthListRoles,
  ApiProtocolError,
  type ApiResponse,
  getAdminAuthGetAccountQueryKey,
  getAdminAuthListAccountsQueryKey,
  getAdminAuthListRolesQueryKey,
  isProblemCode,
  type AdminAuthListAccountsParams,
  type AdminAccountResponseDto,
  type AdminRoleCatalogResponseDto,
} from '@/shared/api'

const strongAccountEtagPattern =
  /^"account-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})-(0|[1-9][0-9]*)"$/iu

export type AccountDetailSnapshot = Readonly<{
  account: AdminAccountResponseDto
  etag: string
}>

function getCanonicalAccountId(accountId: string): string {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(accountId)
    ? accountId.toLowerCase()
    : accountId
}

function readEtag(
  headers: ApiResponse<unknown>['headers'],
  account: AdminAccountResponseDto,
  expectedAccountId: string,
): string {
  const responseHeaders = headers as {
    etag?: unknown
    get?: (name: string) => unknown
  }
  const value = responseHeaders.get?.('etag') ?? responseHeaders.etag
  if (typeof value !== 'string') throw new ApiProtocolError()
  const match = strongAccountEtagPattern.exec(value)
  if (match === null) throw new ApiProtocolError()
  const [, taggedAccountId, taggedRevisionValue] = match
  const taggedRevision = Number(taggedRevisionValue)
  if (
    account.id.toLowerCase() !== expectedAccountId.toLowerCase() ||
    taggedAccountId.toLowerCase() !== account.id.toLowerCase() ||
    !Number.isSafeInteger(taggedRevision) ||
    taggedRevision !== account.revision
  ) {
    throw new ApiProtocolError()
  }
  return value
}

export function adminAccountQueryKey(accountId: string) {
  return getAdminAuthGetAccountQueryKey({
    accountId: getCanonicalAccountId(accountId),
  })
}

export function adminAccountListQueryKey(params?: AdminAuthListAccountsParams) {
  return getAdminAuthListAccountsQueryKey(params)
}

export function adminRoleCatalogQueryKey() {
  return getAdminAuthListRolesQueryKey()
}

export function accountDetailSnapshotFromResponse(
  response: ApiResponse<AdminAccountResponseDto>,
  expectedAccountId: string,
): AccountDetailSnapshot {
  return {
    account: response.data,
    etag: readEtag(response.headers, response.data, expectedAccountId),
  }
}

export function adminAccountQueryOptions(accountId: string) {
  return {
    queryKey: adminAccountQueryKey(accountId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      adminAuthGetAccount({ accountId }, undefined, signal).then((response) =>
        accountDetailSnapshotFromResponse(response, accountId),
      ),
  }
}

export function adminAccountListQueryOptions(
  params?: AdminAuthListAccountsParams,
) {
  return {
    queryKey: adminAccountListQueryKey(params),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      adminAuthListAccounts(params, undefined, signal),
  }
}

export function adminRoleCatalogQueryOptions() {
  return {
    queryKey: adminRoleCatalogQueryKey(),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      adminAuthListRoles(undefined, signal),
  }
}

export function useAdminAccount(accountId: string) {
  return useQuery({
    ...adminAccountQueryOptions(accountId),
    throwOnError: (error) => isProblemCode(error, 'AUTHENTICATION_REQUIRED'),
  })
}

export function useAdminAccountList(params?: AdminAuthListAccountsParams) {
  return useQuery({
    ...adminAccountListQueryOptions(params),
    throwOnError: (error) => isProblemCode(error, 'AUTHENTICATION_REQUIRED'),
  })
}

export function useAdminRoleCatalog(enabled = true) {
  return useQuery({
    ...adminRoleCatalogQueryOptions(),
    enabled,
    throwOnError: (error) => isProblemCode(error, 'AUTHENTICATION_REQUIRED'),
  })
}

export function setAdminAccount(
  queryClient: QueryClient,
  snapshot: AccountDetailSnapshot,
): void {
  queryClient.setQueryData(adminAccountQueryKey(snapshot.account.id), snapshot)
}

export async function invalidateAdminAccountLists(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: adminAccountListQueryKey(),
  })
}

export async function refreshAdminAccount(
  queryClient: QueryClient,
  accountId: string,
): Promise<AccountDetailSnapshot> {
  await queryClient.invalidateQueries({
    queryKey: adminAccountQueryKey(accountId),
    refetchType: 'none',
  })
  return queryClient.fetchQuery(adminAccountQueryOptions(accountId))
}

export async function refreshAdminRoleCatalog(
  queryClient: QueryClient,
): Promise<AdminRoleCatalogResponseDto> {
  await queryClient.invalidateQueries({
    queryKey: adminRoleCatalogQueryKey(),
    refetchType: 'none',
  })
  return queryClient.fetchQuery(adminRoleCatalogQueryOptions())
}

export function removeAdminAccount(
  queryClient: QueryClient,
  accountId: string,
): void {
  queryClient.removeQueries({ queryKey: adminAccountQueryKey(accountId) })
}
