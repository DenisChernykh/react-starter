// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { syncOpenApi, validateOpenApiDocument } from './sync-openapi.mjs'

const requiredPaths = {
  '/v1/auth/login': { post: { operationId: 'authLogin' } },
  '/v1/auth/me': { get: { operationId: 'authGetMe' } },
  '/v1/auth/csrf': { get: { operationId: 'authGetCsrfToken' } },
  '/v1/auth/logout': { post: { operationId: 'authLogout' } },
  '/v1/auth/register': { post: { operationId: 'authRegister' } },
  '/v1/auth/email-verification/resend': {
    post: { operationId: 'authResendEmailVerification' },
  },
  '/v1/auth/email-verification/confirm': {
    post: { operationId: 'authConfirmEmailVerification' },
  },
  '/v1/auth/password-reset/request': {
    post: { operationId: 'authRequestPasswordReset' },
  },
  '/v1/auth/password-reset/confirm': {
    post: { operationId: 'authConfirmPasswordReset' },
  },
  '/v1/auth/account-invitations/accept': {
    post: { operationId: 'authAcceptAccountInvitation' },
  },
  '/v1/admin/auth/accounts': {
    get: { operationId: 'adminAuthListAccounts' },
  },
  '/v1/admin/auth/accounts/{accountId}': {
    get: { operationId: 'adminAuthGetAccount' },
    delete: { operationId: 'adminAuthRetireAccount' },
  },
  '/v1/admin/auth/accounts/{accountId}/status': {
    put: { operationId: 'adminAuthUpdateAccountStatus' },
  },
  '/v1/admin/auth/accounts/{accountId}/roles': {
    put: { operationId: 'adminAuthReplaceAccountRoles' },
  },
  '/v1/admin/auth/accounts/{accountId}/sessions': {
    delete: { operationId: 'adminAuthLogoutAll' },
  },
  '/v1/admin/auth/accounts/{accountId}/invitation/resend': {
    post: { operationId: 'adminAuthResendAccountInvitation' },
  },
  '/v1/admin/auth/accounts/{accountId}/password-reset': {
    post: { operationId: 'adminAuthRequestPasswordReset' },
  },
  '/v1/admin/auth/roles': {
    get: { operationId: 'adminAuthListRoles' },
  },
  '/v1/admin/auth/account-invitations': {
    post: { operationId: 'adminAuthCreateAccountInvitation' },
  },
  '/v1/approval-requests': {
    post: { operationId: 'approvalRequestsCreate' },
  },
  '/v1/approval-requests/{requestId}': {
    get: { operationId: 'approvalRequestsGet' },
  },
  '/v1/approval-requests/{requestId}/decision': {
    put: { operationId: 'approvalRequestsDecide' },
  },
}

const requiredApprovalOperations = [
  {
    label: 'create',
    path: '/v1/approval-requests',
    method: 'post',
    operationId: 'approvalRequestsCreate',
  },
  {
    label: 'get',
    path: '/v1/approval-requests/{requestId}',
    method: 'get',
    operationId: 'approvalRequestsGet',
  },
  {
    label: 'decide',
    path: '/v1/approval-requests/{requestId}/decision',
    method: 'put',
    operationId: 'approvalRequestsDecide',
  },
]

const requiredSelfServiceOperations = [
  {
    label: 'register',
    path: '/v1/auth/register',
    method: 'post',
    operationId: 'authRegister',
  },
  {
    label: 'resend email verification',
    path: '/v1/auth/email-verification/resend',
    method: 'post',
    operationId: 'authResendEmailVerification',
  },
  {
    label: 'confirm email verification',
    path: '/v1/auth/email-verification/confirm',
    method: 'post',
    operationId: 'authConfirmEmailVerification',
  },
  {
    label: 'request password reset',
    path: '/v1/auth/password-reset/request',
    method: 'post',
    operationId: 'authRequestPasswordReset',
  },
  {
    label: 'confirm password reset',
    path: '/v1/auth/password-reset/confirm',
    method: 'post',
    operationId: 'authConfirmPasswordReset',
  },
]

const requiredAccountAdministrationOperations = [
  {
    label: 'accept invitation',
    path: '/v1/auth/account-invitations/accept',
    method: 'post',
    operationId: 'authAcceptAccountInvitation',
  },
  {
    label: 'list accounts',
    path: '/v1/admin/auth/accounts',
    method: 'get',
    operationId: 'adminAuthListAccounts',
  },
  {
    label: 'get account',
    path: '/v1/admin/auth/accounts/{accountId}',
    method: 'get',
    operationId: 'adminAuthGetAccount',
  },
  {
    label: 'retire account',
    path: '/v1/admin/auth/accounts/{accountId}',
    method: 'delete',
    operationId: 'adminAuthRetireAccount',
  },
  {
    label: 'update account status',
    path: '/v1/admin/auth/accounts/{accountId}/status',
    method: 'put',
    operationId: 'adminAuthUpdateAccountStatus',
  },
  {
    label: 'replace account roles',
    path: '/v1/admin/auth/accounts/{accountId}/roles',
    method: 'put',
    operationId: 'adminAuthReplaceAccountRoles',
  },
  {
    label: 'logout all sessions',
    path: '/v1/admin/auth/accounts/{accountId}/sessions',
    method: 'delete',
    operationId: 'adminAuthLogoutAll',
  },
  {
    label: 'resend invitation',
    path: '/v1/admin/auth/accounts/{accountId}/invitation/resend',
    method: 'post',
    operationId: 'adminAuthResendAccountInvitation',
  },
  {
    label: 'request password reset',
    path: '/v1/admin/auth/accounts/{accountId}/password-reset',
    method: 'post',
    operationId: 'adminAuthRequestPasswordReset',
  },
  {
    label: 'list roles',
    path: '/v1/admin/auth/roles',
    method: 'get',
    operationId: 'adminAuthListRoles',
  },
  {
    label: 'create invitation',
    path: '/v1/admin/auth/account-invitations',
    method: 'post',
    operationId: 'adminAuthCreateAccountInvitation',
  },
]

describe('OpenAPI synchronization', () => {
  it.each([undefined, '', {}, { openapi: '2.0', paths: requiredPaths }])(
    'rejects an invalid document',
    (value) => {
      expect(() => validateOpenApiDocument(value)).toThrow()
    },
  )

  it('rejects a document missing a required auth operation', () => {
    const paths = { ...requiredPaths }
    delete paths['/v1/auth/csrf']

    expect(() => validateOpenApiDocument({ openapi: '3.0.3', paths })).toThrow(
      '/v1/auth/csrf',
    )
  })

  it.each(requiredApprovalOperations)(
    'rejects a document missing the approval $label operation',
    ({ path, method }) => {
      const paths = structuredClone(requiredPaths)
      delete paths[path][method]

      expect(() =>
        validateOpenApiDocument({ openapi: '3.0.3', paths }),
      ).toThrow(path)
    },
  )

  it.each(requiredSelfServiceOperations)(
    'rejects a document missing the self-service $label operation',
    ({ path, method }) => {
      const paths = structuredClone(requiredPaths)
      delete paths[path][method]

      expect(() =>
        validateOpenApiDocument({ openapi: '3.0.3', paths }),
      ).toThrow(path)
    },
  )

  it.each(requiredAccountAdministrationOperations)(
    'rejects a document missing the account-administration $label operation',
    ({ path, method }) => {
      const paths = structuredClone(requiredPaths)
      delete paths[path][method]

      expect(() =>
        validateOpenApiDocument({ openapi: '3.0.3', paths }),
      ).toThrow(path)
    },
  )

  it.each(requiredSelfServiceOperations)(
    'rejects a wrong operationId for the self-service $label operation',
    ({ path, method, operationId }) => {
      const paths = structuredClone(requiredPaths)
      paths[path][method].operationId = `${operationId}Wrong`

      expect(() =>
        validateOpenApiDocument({ openapi: '3.0.3', paths }),
      ).toThrow(path)
    },
  )

  it.each(requiredApprovalOperations)(
    'rejects a wrong operationId for the approval $label operation',
    ({ path, method, operationId }) => {
      const paths = structuredClone(requiredPaths)
      paths[path][method].operationId = `${operationId}Wrong`

      expect(() =>
        validateOpenApiDocument({ openapi: '3.0.3', paths }),
      ).toThrow(path)
    },
  )

  it.each(requiredAccountAdministrationOperations)(
    'rejects a wrong operationId for account-administration $label',
    ({ path, method, operationId }) => {
      const paths = structuredClone(requiredPaths)
      paths[path][method].operationId = `${operationId}Wrong`

      expect(() =>
        validateOpenApiDocument({ openapi: '3.0.3', paths }),
      ).toThrow(path)
    },
  )

  it('writes the source bytes with one normalized trailing newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'react-starter-openapi-'))
    const source = join(directory, 'source.json')
    const destination = join(directory, 'snapshot.json')
    await writeFile(
      source,
      JSON.stringify({ openapi: '3.0.3', paths: requiredPaths }),
    )

    await syncOpenApi({ source, destination })

    expect(await readFile(destination, 'utf8')).toBe(
      `${JSON.stringify({ openapi: '3.0.3', paths: requiredPaths })}\n`,
    )
  })

  it('does not replace an existing snapshot when the source is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'react-starter-openapi-'))
    const source = join(directory, 'invalid.json')
    const destination = join(directory, 'snapshot.json')
    await writeFile(
      source,
      JSON.stringify({ openapi: '2.0', paths: requiredPaths }),
    )
    await writeFile(destination, 'previous snapshot\n')

    await expect(syncOpenApi({ source, destination })).rejects.toThrow()
    await expect(readFile(destination, 'utf8')).resolves.toBe(
      'previous snapshot\n',
    )
  })
})
