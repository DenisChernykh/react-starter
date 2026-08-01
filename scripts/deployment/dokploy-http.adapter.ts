import type {
  DokployApplication,
  DokployDeploymentRecord,
  DokployPort,
} from './ports.ts'

const REQUEST_TIMEOUT_MS = 10_000
const READ_RETRY_DELAYS_MS = [250, 500] as const
const JSON_MEDIA_TYPE_PATTERN = /^application\/json(?:\s*;|$)/iu

type DokployOperation =
  | 'configuration'
  | 'application.one'
  | 'deployment.all'
  | 'application.update'
  | 'application.deploy'

type DokployErrorCategory =
  | 'base_url'
  | 'request_aborted'
  | 'request_timeout'
  | 'transport'
  | 'response_redirect'
  | 'response_status'
  | 'response_json'
  | 'response_shape'
  | 'retry_delay'

/** Зависимости строгого HTTPS-адаптера Dokploy. */
export interface DokployHttpAdapterOptions {
  readonly baseUrl: string
  readonly apiKey: string
  readonly fetchImplementation?: typeof fetch
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}

/**
 * Redacted-ошибка нарушения HTTP-контракта Dokploy.
 *
 * @remarks
 * Сохраняет только фиксированные operation/category и, при наличии,
 * числовой HTTP status. URL, API key, headers и response body не сохраняются.
 */
export class DokployContractError extends Error {
  readonly category: DokployErrorCategory
  readonly operation: DokployOperation
  readonly status?: number

  constructor(
    operation: DokployOperation,
    category: DokployErrorCategory,
    status?: number,
  ) {
    super(`Dokploy request failed: ${operation}/${category}`)
    this.name = 'DokployContractError'
    this.operation = operation
    this.category = category
    if (status !== undefined) {
      this.status = status
    }
  }

  /** Сериализует только фиксированные безопасные поля contract error. */
  toJSON(): {
    readonly name: string
    readonly message: string
    readonly operation: DokployOperation
    readonly category: DokployErrorCategory
    readonly status?: number
  } {
    return {
      category: this.category,
      message: this.message,
      name: this.name,
      operation: this.operation,
      status: this.status,
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireBaseUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new DokployContractError('configuration', 'base_url')
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new DokployContractError('configuration', 'base_url')
  }

  return url
}

function defaultSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function requireApplication(
  body: unknown,
  expectedApplicationId: string,
): DokployApplication {
  if (
    !isRecord(body) ||
    body.applicationId !== expectedApplicationId ||
    typeof body.sourceType !== 'string' ||
    (typeof body.dockerImage !== 'string' && body.dockerImage !== null)
  ) {
    throw new DokployContractError('application.one', 'response_shape')
  }

  return {
    applicationId: body.applicationId,
    dockerImage: body.dockerImage,
    sourceType: body.sourceType,
  }
}

function requireDeployments(body: unknown): readonly DokployDeploymentRecord[] {
  if (!Array.isArray(body)) {
    throw new DokployContractError('deployment.all', 'response_shape')
  }

  const deploymentIds = new Set<string>()
  return body.map((record) => {
    if (
      !isRecord(record) ||
      typeof record.deploymentId !== 'string' ||
      typeof record.status !== 'string' ||
      typeof record.title !== 'string' ||
      deploymentIds.has(record.deploymentId)
    ) {
      throw new DokployContractError('deployment.all', 'response_shape')
    }
    deploymentIds.add(record.deploymentId)

    return {
      deploymentId: record.deploymentId,
      status: record.status,
      title: record.title,
    }
  })
}

function isRetryableReadError(error: DokployContractError): boolean {
  return (
    error.category === 'transport' ||
    error.category === 'request_timeout' ||
    (error.category === 'response_status' &&
      error.status !== undefined &&
      error.status >= 500 &&
      error.status <= 599)
  )
}

/**
 * Узнаёт точный redirect fingerprint встроенного fetch закреплённого Node.
 *
 * @remarks
 * Node 24.18.0 включает Undici 7.28.0: `redirect: "error"` становится
 * `TypeError("fetch failed")` с обычным `Error("unexpected redirect")` в
 * `cause` без собственного или унаследованного `code`. Проверка намеренно
 * узкая: иная форма остаётся transport failure, а исходные error/cause никогда
 * не сохраняются в contract error.
 */
function isPinnedNodeRedirectRejection(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    error.cause instanceof Error &&
    error.cause.constructor === Error &&
    error.cause.message === 'unexpected redirect' &&
    !('code' in error.cause)
  )
}

/**
 * Обращается к разрешённым application/deployment endpoints Dokploy.
 *
 * @remarks
 * Использует только credential-free HTTPS origin, запрещает redirects и
 * ограничивает каждый запрос десятью секундами. GET повторяется не более двух
 * раз только после transport/timeout/5xx; mutation-запросы не повторяются.
 */
export class DokployHttpAdapter implements DokployPort {
  private readonly apiKey: string
  private readonly baseUrl: URL
  private readonly fetchImplementation: typeof fetch
  private readonly sleep: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>

  constructor(options: DokployHttpAdapterOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = requireBaseUrl(options.baseUrl)
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.sleep = options.sleep ?? defaultSleep
  }

  async getApplication(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<DokployApplication> {
    return await this.read(
      'application.one',
      applicationId,
      (body) => requireApplication(body, applicationId),
      signal,
    )
  }

  async listDeployments(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<readonly DokployDeploymentRecord[]> {
    return await this.read(
      'deployment.all',
      applicationId,
      requireDeployments,
      signal,
    )
  }

  async updateImage(
    applicationId: string,
    imageRef: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.mutate(
      'application.update',
      {
        applicationId,
        dockerImage: imageRef,
      },
      signal,
    )
  }

  async deploy(input: Parameters<DokployPort['deploy']>[0]): Promise<void> {
    await this.mutate(
      'application.deploy',
      {
        applicationId: input.applicationId,
        title: input.title,
        description: input.description,
      },
      input.signal,
    )
  }

  private async read<T>(
    operation: 'application.one' | 'deployment.all',
    applicationId: string,
    project: (body: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    for (
      let attempt = 0;
      attempt <= READ_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      try {
        const body = await this.requestJson(
          operation,
          'GET',
          applicationId,
          undefined,
          signal,
        )
        return project(body)
      } catch (error) {
        const contractError =
          error instanceof DokployContractError
            ? error
            : new DokployContractError(operation, 'response_shape')
        const retryDelay = READ_RETRY_DELAYS_MS[attempt]
        if (retryDelay === undefined || !isRetryableReadError(contractError)) {
          throw contractError
        }

        try {
          await this.sleep(retryDelay, signal)
          if (signal?.aborted) {
            throw signal.reason
          }
        } catch {
          throw new DokployContractError(
            operation,
            signal?.aborted ? 'request_aborted' : 'retry_delay',
          )
        }
      }
    }

    throw new DokployContractError(operation, 'transport')
  }

  private async mutate(
    operation: 'application.update' | 'application.deploy',
    body: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<void> {
    const responseBody = await this.requestJson(
      operation,
      'POST',
      undefined,
      body,
      signal,
    )
    if (!isRecord(responseBody) || Object.keys(responseBody).length !== 0) {
      throw new DokployContractError(operation, 'response_shape')
    }
  }

  private async requestJson(
    operation: Exclude<DokployOperation, 'configuration'>,
    method: 'GET' | 'POST',
    applicationId: string | undefined,
    body: Readonly<Record<string, string>> | undefined,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(`/api/${operation}`, this.baseUrl)
    if (applicationId !== undefined) {
      url.searchParams.set('applicationId', applicationId)
    }
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const requestSignal = signal
      ? AbortSignal.any([timeoutSignal, signal])
      : timeoutSignal
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-api-key': this.apiKey,
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }

    let response: Response
    try {
      response = await this.fetchImplementation(url, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
        method,
        redirect: 'error',
        signal: requestSignal,
      })
    } catch (error) {
      if (signal?.aborted) {
        throw new DokployContractError(operation, 'request_aborted')
      }
      if (timeoutSignal.aborted) {
        throw new DokployContractError(operation, 'request_timeout')
      }
      if (isPinnedNodeRedirectRejection(error)) {
        throw new DokployContractError(operation, 'response_redirect')
      }
      throw new DokployContractError(operation, 'transport')
    }

    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined)
      throw new DokployContractError(
        operation,
        response.status >= 300 && response.status <= 399
          ? 'response_redirect'
          : 'response_status',
        response.status,
      )
    }

    const contentType = response.headers.get('content-type')
    if (
      contentType === null ||
      !JSON_MEDIA_TYPE_PATTERN.test(contentType.trim())
    ) {
      void response.body?.cancel().catch(() => undefined)
      throw new DokployContractError(operation, 'response_json')
    }

    try {
      return (await response.json()) as unknown
    } catch {
      if (signal?.aborted) {
        throw new DokployContractError(operation, 'request_aborted')
      }
      if (timeoutSignal.aborted) {
        throw new DokployContractError(operation, 'request_timeout')
      }
      throw new DokployContractError(operation, 'response_json')
    }
  }
}
