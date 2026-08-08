import { QueryClient } from '@tanstack/react-query'
import { AxiosHeaders } from 'axios'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  getAdminAuthGetAccountQueryKey,
  getAdminAuthListAccountsQueryKey,
  getAdminAuthListRolesQueryKey,
  type AdminAccountResponseDto,
  type ApiResponse,
  ApiProtocolError,
} from '@/shared/api'
import { server } from '@/shared/lib/testing'

import {
  accountDetailSnapshotFromResponse,
  adminAccountListQueryKey,
  adminAccountListQueryOptions,
  adminAccountQueryKey,
  adminAccountQueryOptions,
  adminRoleCatalogQueryKey,
  refreshAdminAccount,
  setAdminAccount,
} from './account'

const apiOrigin = 'http://localhost:3000'
const accountId = 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184'
const uppercaseAccountId = accountId.toUpperCase()
const etag = `"account-${accountId}-2"`

const account = {
  createdAt: '2026-08-08T08:00:00.000Z',
  email: 'operator@example.test',
  emailVerifiedAt: '2026-08-08T08:00:00.000Z',
  id: accountId,
  retiredAt: null,
  revision: 2,
  roleKeys: ['system.admin'],
  state: 'active',
  updatedAt: '2026-08-08T09:00:00.000Z',
} satisfies AdminAccountResponseDto

function responseWithEtag(
  value: AdminAccountResponseDto,
  valueEtag = etag,
): ApiResponse<AdminAccountResponseDto> {
  return {
    data: value,
    headers: new AxiosHeaders({ etag: valueEtag }),
  }
}

describe('admin account query adapter', () => {
  it('uses the generated query key with a canonical UUID cache identity', () => {
    expect(adminAccountQueryKey(uppercaseAccountId)).toEqual(
      getAdminAuthGetAccountQueryKey({ accountId }),
    )
  })

  it('delegates list and role catalog cache identities to generated helpers', () => {
    const params = {
      page: 2,
      pageSize: 25,
      search: 'operator',
      state: 'active' as const,
    }

    expect(adminAccountListQueryKey(params)).toEqual(
      getAdminAuthListAccountsQueryKey(params),
    )
    expect(adminAccountListQueryOptions(params).queryKey).toEqual(
      adminAccountListQueryKey(params),
    )
    expect(adminRoleCatalogQueryKey()).toEqual(getAdminAuthListRolesQueryKey())
  })

  it('preserves route UUID spelling in HTTP while caching the ETag snapshot canonically', async () => {
    let requestedId: string | undefined
    server.use(
      http.get(
        `${apiOrigin}/v1/admin/auth/accounts/:requestedAccountId`,
        ({ params }) => {
          requestedId = String(params.requestedAccountId)
          return HttpResponse.json(account, { headers: { ETag: etag } })
        },
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await expect(
      queryClient.fetchQuery(adminAccountQueryOptions(uppercaseAccountId)),
    ).resolves.toEqual({ account, etag })

    expect(requestedId).toBe(uppercaseAccountId)
    expect(queryClient.getQueryData(adminAccountQueryKey(accountId))).toEqual({
      account,
      etag,
    })
  })

  it('rejects a response for another account instead of caching it under the requested key', async () => {
    const anotherAccountId = '8dc70a15-d91f-4c67-b5a6-479faa42433c'
    const anotherAccount = { ...account, id: anotherAccountId }
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () =>
        HttpResponse.json(anotherAccount, {
          headers: { ETag: `"account-${anotherAccountId}-2"` },
        }),
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await expect(
      queryClient.fetchQuery(adminAccountQueryOptions(accountId)),
    ).rejects.toBeInstanceOf(ApiProtocolError)
    expect(
      queryClient.getQueryData(adminAccountQueryKey(accountId)),
    ).toBeUndefined()
  })

  it('rejects a successful response without a strong account ETag', () => {
    expect(() =>
      accountDetailSnapshotFromResponse(
        responseWithEtag(account, 'weak-etag'),
        accountId,
      ),
    ).toThrow(ApiProtocolError)
  })

  it.each([
    ['malformed account UUID', '"account---2"'],
    [
      'another account UUID',
      '"account-8dc70a15-d91f-4c67-b5a6-479faa42433c-2"',
    ],
    ['wrong response revision', `"account-${accountId}-3"`],
    ['unsafe revision', `"account-${accountId}-9007199254740992"`],
    ['weak validator', `W/"account-${accountId}-2"`],
  ])('rejects a %s ETag', (_case, valueEtag) => {
    expect(() =>
      accountDetailSnapshotFromResponse(
        responseWithEtag(account, valueEtag),
        accountId,
      ),
    ).toThrow(ApiProtocolError)
  })

  it('replaces an existing detail snapshot with the exact server response', () => {
    const queryClient = new QueryClient()
    const nextAccount = { ...account, revision: 3 }

    setAdminAccount(queryClient, {
      account: nextAccount,
      etag: `"account-${accountId}-3"`,
    })

    expect(
      queryClient.getQueryData(adminAccountQueryKey(uppercaseAccountId)),
    ).toEqual({
      account: nextAccount,
      etag: `"account-${accountId}-3"`,
    })
  })

  it('authoritatively refreshes an inactive detail query and returns the snapshot', async () => {
    let requests = 0
    const refreshedAccount = { ...account, revision: 3 }
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, () => {
        requests += 1
        return HttpResponse.json(refreshedAccount, {
          headers: { ETag: `"account-${accountId}-3"` },
        })
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(adminAccountQueryKey(accountId), { account, etag })

    await expect(refreshAdminAccount(queryClient, accountId)).resolves.toEqual({
      account: refreshedAccount,
      etag: `"account-${accountId}-3"`,
    })
    expect(requests).toBe(1)
    expect(queryClient.getQueryData(adminAccountQueryKey(accountId))).toEqual({
      account: refreshedAccount,
      etag: `"account-${accountId}-3"`,
    })
  })

  it('deduplicates concurrent authoritative refreshes for the same account', async () => {
    let requests = 0
    const refreshedAccount = { ...account, revision: 3 }
    server.use(
      http.get(`${apiOrigin}/v1/admin/auth/accounts/${accountId}`, async () => {
        requests += 1
        await Promise.resolve()
        return HttpResponse.json(refreshedAccount, {
          headers: { ETag: `"account-${accountId}-3"` },
        })
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const snapshots = await Promise.all([
      refreshAdminAccount(queryClient, accountId),
      refreshAdminAccount(queryClient, uppercaseAccountId),
    ])

    expect(snapshots).toEqual([
      {
        account: refreshedAccount,
        etag: `"account-${accountId}-3"`,
      },
      {
        account: refreshedAccount,
        etag: `"account-${accountId}-3"`,
      },
    ])
    expect(requests).toBe(1)
  })
})
