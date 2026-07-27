// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { syncOpenApi, validateOpenApiDocument } from './sync-openapi.mjs'

const authPaths = {
  '/v1/auth/login': { post: { operationId: 'authLogin' } },
  '/v1/auth/me': { get: { operationId: 'authGetMe' } },
  '/v1/auth/csrf': { get: { operationId: 'authGetCsrfToken' } },
  '/v1/auth/logout': { post: { operationId: 'authLogout' } },
}

describe('OpenAPI synchronization', () => {
  it.each([undefined, '', {}, { openapi: '2.0', paths: authPaths }])(
    'rejects an invalid document',
    (value) => {
      expect(() => validateOpenApiDocument(value)).toThrow()
    },
  )

  it('rejects a document missing a required auth operation', () => {
    const paths = { ...authPaths }
    delete paths['/v1/auth/csrf']

    expect(() => validateOpenApiDocument({ openapi: '3.0.3', paths })).toThrow(
      '/v1/auth/csrf',
    )
  })

  it('writes the source bytes with one normalized trailing newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'react-starter-openapi-'))
    const source = join(directory, 'source.json')
    const destination = join(directory, 'snapshot.json')
    await writeFile(
      source,
      JSON.stringify({ openapi: '3.0.3', paths: authPaths }),
    )

    await syncOpenApi({ source, destination })

    expect(await readFile(destination, 'utf8')).toBe(
      `${JSON.stringify({ openapi: '3.0.3', paths: authPaths })}\n`,
    )
  })

  it('does not replace an existing snapshot when the source is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'react-starter-openapi-'))
    const source = join(directory, 'invalid.json')
    const destination = join(directory, 'snapshot.json')
    await writeFile(
      source,
      JSON.stringify({ openapi: '2.0', paths: authPaths }),
    )
    await writeFile(destination, 'previous snapshot\n')

    await expect(syncOpenApi({ source, destination })).rejects.toThrow()
    await expect(readFile(destination, 'utf8')).resolves.toBe(
      'previous snapshot\n',
    )
  })
})
