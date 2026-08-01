import type {
  HostedSmokeExpectation,
  HostedSmokePort,
  HostedSmokeResult,
} from './ports.ts'
import { isCanonicalSmokePath } from './smoke-path.ts'

const API_PROBE_PATH = '/v1/__frontend_deployment_probe__'
const DEFAULT_TIMEOUT_MS = 10_000
const FRONTEND_HEALTH_PATH = '/_frontend/health'
const FRONTEND_IDENTITY_PATH = '/_frontend/identity'
const APP_ROOT_MARKER = '<div id="root">'
const HTML_MEDIA_TYPE_PATTERN = /^text\/html(?:\s*;|$)/iu
const PROBLEM_MEDIA_TYPE_PATTERN = /^application\/problem\+json(?:\s*;|$)/iu
const TEXT_MEDIA_TYPE_PATTERN = /^text\/plain(?:\s*;|$)/iu
const HTTPS_ORIGIN_INPUT_PATTERN = /^https:\/\/[^/?#\\\s]+\/?$/iu

type FrontendHostedSmokeRule =
  | 'api_content_type'
  | 'api_root'
  | 'api_status'
  | 'base_url'
  | 'duplicate_path'
  | 'health_body'
  | 'health_cache_control'
  | 'health_status'
  | 'identity_body'
  | 'identity_cache_control'
  | 'identity_content_type'
  | 'identity_status'
  | 'invalid_path'
  | 'request_aborted'
  | 'request_timeout'
  | 'response_body'
  | 'response_redirect'
  | 'transport'
  | 'ui_content_type'
  | 'ui_root'
  | 'ui_status'

/**
 * Redacted-ошибка нарушения публичного frontend smoke-контракта.
 *
 * @remarks
 * Сохраняет только проверяемый path, фиксированное правило и необязательный
 * HTTP status. URL-origin, response body и исходные transport errors не
 * попадают в сообщение или JSON.
 */
export class FrontendHostedSmokeError extends Error {
  readonly path: string
  readonly rule: FrontendHostedSmokeRule
  readonly status?: number

  constructor(path: string, rule: FrontendHostedSmokeRule, status?: number) {
    super('Frontend hosted smoke failed')
    this.name = 'FrontendHostedSmokeError'
    this.path = path
    this.rule = rule
    if (status !== undefined) {
      this.status = status
    }
  }

  /** Возвращает только фиксированные безопасные поля smoke-ошибки. */
  toJSON(): {
    readonly name: string
    readonly message: string
    readonly path: string
    readonly rule: FrontendHostedSmokeRule
    readonly status?: number
  } {
    return {
      message: this.message,
      name: this.name,
      path: this.path,
      rule: this.rule,
      ...(this.status === undefined ? {} : { status: this.status }),
    }
  }
}

function requireBaseOrigin(value: string): URL {
  if (!HTTPS_ORIGIN_INPUT_PATTERN.test(value)) {
    throw new FrontendHostedSmokeError('publicBaseUrl', 'base_url')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new FrontendHostedSmokeError('publicBaseUrl', 'base_url')
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new FrontendHostedSmokeError('publicBaseUrl', 'base_url')
  }

  return new URL(url.origin)
}

function requireSmokePath(path: string, baseOrigin: URL): void {
  if (!isCanonicalSmokePath(path)) {
    throw new FrontendHostedSmokeError('smokePaths', 'invalid_path')
  }

  const resolved = new URL(path, baseOrigin)
  if (
    resolved.origin !== baseOrigin.origin ||
    resolved.pathname !== path ||
    resolved.search !== '' ||
    resolved.hash !== ''
  ) {
    throw new FrontendHostedSmokeError('smokePaths', 'invalid_path')
  }
}

function preparePaths(
  smokePaths: readonly string[],
  baseOrigin: URL,
): {
  readonly all: readonly string[]
  readonly ui: readonly string[]
} {
  const configured = new Set<string>()
  for (const path of smokePaths) {
    requireSmokePath(path, baseOrigin)
    if (configured.has(path)) {
      throw new FrontendHostedSmokeError(path, 'duplicate_path')
    }
    configured.add(path)
  }

  const ui = [
    ...new Set(
      ['/', '/login', ...smokePaths].filter(
        (path) =>
          path !== FRONTEND_HEALTH_PATH &&
          path !== FRONTEND_IDENTITY_PATH &&
          path !== API_PROBE_PATH,
      ),
    ),
  ]
  return {
    all: [FRONTEND_HEALTH_PATH, FRONTEND_IDENTITY_PATH, ...ui, API_PROBE_PATH],
    ui,
  }
}

function hasNoStore(headers: Headers): boolean {
  return (
    headers
      .get('cache-control')
      ?.split(',')
      .some((directive) => directive.trim().toLowerCase() === 'no-store') ??
    false
  )
}

function isHtml(headers: Headers): boolean {
  const contentType = headers.get('content-type')
  return (
    contentType !== null && HTML_MEDIA_TYPE_PATTERN.test(contentType.trim())
  )
}

function hasMediaType(headers: Headers, pattern: RegExp): boolean {
  const contentType = headers.get('content-type')
  return contentType !== null && pattern.test(contentType.trim())
}

function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined)
}

/**
 * Проверяет публичные health, SPA deep links и same-origin API boundary.
 *
 * @remarks
 * Каждый уникальный path получает ровно один credential-free GET без retry,
 * с запретом redirect и отдельным 10-секундным timeout по умолчанию. Timeout
 * покрывает как получение headers, так и чтение body.
 */
export class FrontendHostedSmokeAdapter implements HostedSmokePort {
  private readonly fetchImplementation: typeof fetch
  private readonly timeoutMs: number

  constructor(
    dependencies: {
      readonly fetchImplementation?: typeof fetch
      readonly timeoutMs?: number
    } = {},
  ) {
    this.fetchImplementation = dependencies.fetchImplementation ?? fetch
    this.timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async verify(
    publicBaseUrl: string,
    smokePaths: readonly string[],
    expected: HostedSmokeExpectation,
    signal?: AbortSignal,
  ): Promise<HostedSmokeResult> {
    const baseOrigin = requireBaseOrigin(publicBaseUrl)
    const paths = preparePaths(smokePaths, baseOrigin)

    await this.verifyHealth(baseOrigin, signal)
    await this.verifyIdentity(baseOrigin, expected, signal)
    for (const path of paths.ui) {
      await this.verifyUi(baseOrigin, path, signal)
    }
    const apiProbeStatus = await this.verifyApi(baseOrigin, signal)

    return Object.freeze({
      apiProbeStatus,
      checkedPaths: Object.freeze([...paths.all]),
      frontendRevision: expected.image.revision,
    })
  }

  private async request(
    baseOrigin: URL,
    path: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly response: Response
    readonly timeoutSignal: AbortSignal
  }> {
    if (signal?.aborted) {
      throw new FrontendHostedSmokeError(path, 'request_aborted')
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const requestSignal =
      signal === undefined
        ? timeoutSignal
        : AbortSignal.any([timeoutSignal, signal])

    let response: Response
    try {
      response = await this.fetchImplementation(
        new URL(path, baseOrigin).toString(),
        {
          credentials: 'omit',
          method: 'GET',
          redirect: 'error',
          signal: requestSignal,
        },
      )
    } catch {
      throw this.requestError(path, timeoutSignal, signal, 'transport')
    }

    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    ) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        path,
        'response_redirect',
        response.status,
      )
    }

    return { response, timeoutSignal }
  }

  private async readBody(
    response: Response,
    path: string,
    timeoutSignal: AbortSignal,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      return await response.text()
    } catch {
      throw this.requestError(path, timeoutSignal, signal, 'response_body')
    }
  }

  private requestError(
    path: string,
    timeoutSignal: AbortSignal,
    signal: AbortSignal | undefined,
    fallback: 'response_body' | 'transport',
  ): FrontendHostedSmokeError {
    if (signal?.aborted) {
      return new FrontendHostedSmokeError(path, 'request_aborted')
    }
    if (timeoutSignal.aborted) {
      return new FrontendHostedSmokeError(path, 'request_timeout')
    }
    return new FrontendHostedSmokeError(path, fallback)
  }

  private async verifyHealth(
    baseOrigin: URL,
    signal?: AbortSignal,
  ): Promise<void> {
    const { response, timeoutSignal } = await this.request(
      baseOrigin,
      FRONTEND_HEALTH_PATH,
      signal,
    )
    if (response.status !== 200) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        FRONTEND_HEALTH_PATH,
        'health_status',
        response.status,
      )
    }
    if (!hasNoStore(response.headers)) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        FRONTEND_HEALTH_PATH,
        'health_cache_control',
      )
    }

    const body = await this.readBody(
      response,
      FRONTEND_HEALTH_PATH,
      timeoutSignal,
      signal,
    )
    if (body !== 'ok\n') {
      throw new FrontendHostedSmokeError(FRONTEND_HEALTH_PATH, 'health_body')
    }
  }

  private async verifyUi(
    baseOrigin: URL,
    path: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const { response, timeoutSignal } = await this.request(
      baseOrigin,
      path,
      signal,
    )
    if (response.status !== 200) {
      discardBody(response)
      throw new FrontendHostedSmokeError(path, 'ui_status', response.status)
    }
    if (!isHtml(response.headers)) {
      discardBody(response)
      throw new FrontendHostedSmokeError(path, 'ui_content_type')
    }
    const body = await this.readBody(response, path, timeoutSignal, signal)
    if (!body.includes(APP_ROOT_MARKER)) {
      throw new FrontendHostedSmokeError(path, 'ui_root')
    }
  }

  private async verifyIdentity(
    baseOrigin: URL,
    expected: HostedSmokeExpectation,
    signal?: AbortSignal,
  ): Promise<void> {
    const { response, timeoutSignal } = await this.request(
      baseOrigin,
      FRONTEND_IDENTITY_PATH,
      signal,
    )
    if (response.status !== 200) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        FRONTEND_IDENTITY_PATH,
        'identity_status',
        response.status,
      )
    }
    if (!hasNoStore(response.headers)) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        FRONTEND_IDENTITY_PATH,
        'identity_cache_control',
      )
    }
    if (!hasMediaType(response.headers, TEXT_MEDIA_TYPE_PATTERN)) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        FRONTEND_IDENTITY_PATH,
        'identity_content_type',
      )
    }

    const body = await this.readBody(
      response,
      FRONTEND_IDENTITY_PATH,
      timeoutSignal,
      signal,
    )
    const expectedBody = `https://github.com/${expected.repository.toLowerCase()}\n${expected.image.revision}\n`
    if (body.toLowerCase() !== expectedBody) {
      throw new FrontendHostedSmokeError(
        FRONTEND_IDENTITY_PATH,
        'identity_body',
      )
    }
  }

  private async verifyApi(
    baseOrigin: URL,
    signal?: AbortSignal,
  ): Promise<number> {
    const { response, timeoutSignal } = await this.request(
      baseOrigin,
      API_PROBE_PATH,
      signal,
    )
    if (response.status < 400 || response.status > 499) {
      discardBody(response)
      throw new FrontendHostedSmokeError(
        API_PROBE_PATH,
        'api_status',
        response.status,
      )
    }
    if (!hasMediaType(response.headers, PROBLEM_MEDIA_TYPE_PATTERN)) {
      discardBody(response)
      throw new FrontendHostedSmokeError(API_PROBE_PATH, 'api_content_type')
    }
    const body = await this.readBody(
      response,
      API_PROBE_PATH,
      timeoutSignal,
      signal,
    )
    if (body.includes(APP_ROOT_MARKER)) {
      throw new FrontendHostedSmokeError(API_PROBE_PATH, 'api_root')
    }

    return response.status
  }
}
