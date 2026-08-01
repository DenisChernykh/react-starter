const REQUEST_TIMEOUT_MS = 5_000
const APPROVAL_REQUEST_PATH =
  '/approval-requests/00000000-0000-4000-8000-000000000001'
const HTML_PATHS = ['/', '/login', APPROVAL_REQUEST_PATH] as const
const FRONTEND_PREFIX_COLLISION_PATHS = [
  '/v10',
  '/v1-admin',
  '/healthcheck',
] as const
const BACKEND_PATHS = [
  '/v1',
  '/v1/__frontend_deployment_probe__',
  '/health',
  '/health/unknown',
] as const
const UNVERSIONED_ASSET_PATH = '/favicon.svg'

/** Ожидаемая публичная identity конкретной frontend image сборки. */
export interface FrontendRuntimeIdentity {
  readonly source: string
  readonly revision: string
}

type ContractRule =
  | 'request'
  | 'status'
  | 'health-body'
  | 'identity-body'
  | 'content-type'
  | 'cache-control'
  | 'app-root'
  | 'hashed-asset'
  | 'backend-not-html'
  | 'x-content-type-options'
  | 'referrer-policy'
  | 'server-version'
  | 'x-frame-options'

/** Ошибка одного фиксированного правила HTTP-контракта без данных ответа. */
class FrontendHttpContractError extends Error {
  constructor(path: string, rule: ContractRule) {
    super(`Frontend HTTP contract failed for "${path}": ${rule}`)
    this.name = 'FrontendHttpContractError'
  }
}

function fail(path: string, rule: ContractRule): never {
  throw new FrontendHttpContractError(path, rule)
}

function requireEqual(
  path: string,
  rule: ContractRule,
  actual: string | null,
  expected: string,
): void {
  if (actual !== expected) {
    fail(path, rule)
  }
}

function requireSecurityHeaders(path: string, response: Response): void {
  requireEqual(
    path,
    'x-content-type-options',
    response.headers.get('x-content-type-options'),
    'nosniff',
  )
  requireEqual(
    path,
    'referrer-policy',
    response.headers.get('referrer-policy'),
    'no-referrer',
  )
  requireEqual(
    path,
    'x-frame-options',
    response.headers.get('x-frame-options'),
    'DENY',
  )
  requireEqual(path, 'server-version', response.headers.get('server'), 'nginx')
}

async function request(
  baseUrl: URL,
  path: string,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImplementation(new URL(path, baseUrl), {
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    fail(path, 'request')
  }
}

function requireStatus(
  path: string,
  response: Response,
  expectedStatus: number,
): void {
  if (response.status !== expectedStatus || response.redirected) {
    fail(path, 'status')
  }
}

function requireMediaType(
  path: string,
  response: Response,
  expectedMediaType: string,
): void {
  const mediaType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (mediaType !== expectedMediaType) {
    fail(path, 'content-type')
  }
}

async function requireHtmlRoute(
  path: string,
  response: Response,
): Promise<string> {
  requireStatus(path, response, 200)
  requireSecurityHeaders(path, response)
  requireMediaType(path, response, 'text/html')
  requireEqual(
    path,
    'cache-control',
    response.headers.get('cache-control'),
    'no-cache',
  )
  const body = await response.text()
  if (!/<[^>]+\sid=["']root["'][^>]*>/iu.test(body)) {
    fail(path, 'app-root')
  }

  return body
}

function discoverHashedAsset(indexHtml: string): string {
  const candidates = indexHtml.match(/\/assets\/[^"'?\s>]+/giu) ?? []
  const assetPath = candidates.find((candidate) =>
    /-[a-z0-9_-]{8,}\.[a-z0-9]+$/iu.test(candidate),
  )
  if (!assetPath) {
    fail('/', 'hashed-asset')
  }

  return assetPath
}

/**
 * Проверяет публичный HTTP-контракт уже запущенного frontend-контейнера.
 *
 * @remarks
 * Verifier не следует redirect, ограничивает каждый request пятью секундами и
 * сам находит hashed asset в `index.html`, поэтому не зависит от Vite hash.
 */
export async function verifyFrontendHttpContract(
  baseUrl: URL,
  expectedIdentity: FrontendRuntimeIdentity,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const healthPath = '/_frontend/health'
  const health = await request(baseUrl, healthPath, fetchImplementation)
  requireStatus(healthPath, health, 200)
  requireSecurityHeaders(healthPath, health)
  requireMediaType(healthPath, health, 'text/plain')
  requireEqual(
    healthPath,
    'cache-control',
    health.headers.get('cache-control'),
    'no-store',
  )
  if ((await health.text()) !== 'ok\n') {
    fail(healthPath, 'health-body')
  }

  const identityPath = '/_frontend/identity'
  const identity = await request(baseUrl, identityPath, fetchImplementation)
  requireStatus(identityPath, identity, 200)
  requireSecurityHeaders(identityPath, identity)
  requireMediaType(identityPath, identity, 'text/plain')
  requireEqual(
    identityPath,
    'cache-control',
    identity.headers.get('cache-control'),
    'no-store',
  )
  requireEqual(
    identityPath,
    'identity-body',
    await identity.text(),
    `${expectedIdentity.source}\n${expectedIdentity.revision}\n`,
  )

  const index = await request(baseUrl, HTML_PATHS[0], fetchImplementation)
  const indexHtml = await requireHtmlRoute(HTML_PATHS[0], index)

  for (const path of HTML_PATHS.slice(1)) {
    const response = await request(baseUrl, path, fetchImplementation)
    await requireHtmlRoute(path, response)
  }

  const assetPath = discoverHashedAsset(indexHtml)
  const asset = await request(baseUrl, assetPath, fetchImplementation)
  requireStatus(assetPath, asset, 200)
  requireSecurityHeaders(assetPath, asset)
  requireEqual(
    assetPath,
    'cache-control',
    asset.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
  )

  const unversionedAsset = await request(
    baseUrl,
    UNVERSIONED_ASSET_PATH,
    fetchImplementation,
  )
  requireStatus(UNVERSIONED_ASSET_PATH, unversionedAsset, 200)
  requireSecurityHeaders(UNVERSIONED_ASSET_PATH, unversionedAsset)
  requireEqual(
    UNVERSIONED_ASSET_PATH,
    'cache-control',
    unversionedAsset.headers.get('cache-control'),
    'no-cache',
  )

  for (const path of BACKEND_PATHS) {
    const response = await request(baseUrl, path, fetchImplementation)
    requireStatus(path, response, 404)
    requireSecurityHeaders(path, response)
    const contentType = response.headers.get('content-type')?.toLowerCase()
    if (contentType?.startsWith('text/html')) {
      fail(path, 'backend-not-html')
    }
  }

  for (const path of FRONTEND_PREFIX_COLLISION_PATHS) {
    const response = await request(baseUrl, path, fetchImplementation)
    await requireHtmlRoute(path, response)
  }
}
