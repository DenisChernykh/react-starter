import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const requiredOperations = [
  ['/v1/auth/login', 'post', 'authLogin'],
  ['/v1/auth/me', 'get', 'authGetMe'],
  ['/v1/auth/csrf', 'get', 'authGetCsrfToken'],
  ['/v1/auth/logout', 'post', 'authLogout'],
  ['/v1/approval-requests', 'post', 'approvalRequestsCreate'],
  ['/v1/approval-requests/{requestId}', 'get', 'approvalRequestsGet'],
  [
    '/v1/approval-requests/{requestId}/decision',
    'put',
    'approvalRequestsDecide',
  ],
]

export function validateOpenApiDocument(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.openapi !== 'string' ||
    !value.openapi.startsWith('3.') ||
    value.paths === null ||
    typeof value.paths !== 'object' ||
    Array.isArray(value.paths)
  ) {
    throw new Error('Expected a non-empty OpenAPI 3 JSON document')
  }

  for (const [path, method, operationId] of requiredOperations) {
    const operation = value.paths[path]?.[method]
    if (operation === undefined) {
      throw new Error(
        `OpenAPI document is missing ${method.toUpperCase()} ${path}`,
      )
    }

    if (operation.operationId !== operationId) {
      throw new Error(
        `OpenAPI document has an unexpected operation ID for ${method.toUpperCase()} ${path}`,
      )
    }
  }

  return value
}

export async function readOpenApiSource(source) {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`OpenAPI download failed with HTTP ${response.status}`)
    }
    return response.text()
  }

  const path = source.startsWith('file:')
    ? fileURLToPath(source)
    : resolve(process.cwd(), source)
  return readFile(path, 'utf8')
}

export async function syncOpenApi({ source, destination }) {
  const raw = await readOpenApiSource(source)
  if (raw.trim() === '') throw new Error('OpenAPI source is empty')

  const parsed = JSON.parse(raw)
  validateOpenApiDocument(parsed)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, `${raw.trimEnd()}\n`)
}

function resolvePairedBackendSource() {
  const fallback = resolve(
    process.cwd(),
    '../nest-js-starter/docs/api/openapi.json',
  )

  try {
    const worktreeList = execFileSync(
      'git',
      ['worktree', 'list', '--porcelain'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    )
    const primaryWorktree = worktreeList
      .split('\n')
      .find((line) => line.startsWith('worktree '))
      ?.slice('worktree '.length)

    return primaryWorktree === undefined
      ? fallback
      : resolve(primaryWorktree, '../nest-js-starter/docs/api/openapi.json')
  } catch {
    return fallback
  }
}

async function main() {
  const source = process.env.OPENAPI_SPEC_SOURCE ?? resolvePairedBackendSource()
  const destination = resolve(process.cwd(), 'openapi/openapi.json')
  await syncOpenApi({ source, destination })
  process.stdout.write(`OpenAPI snapshot updated from ${source}\n`)
}

if (process.argv[1] !== undefined) {
  const invokedUrl = pathToFileURL(resolve(process.argv[1])).href
  if (import.meta.url === invokedUrl) {
    await main()
  }
}
