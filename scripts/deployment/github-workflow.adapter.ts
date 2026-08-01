import type { PublicationVerificationPort } from './ports.ts'

const DEFAULT_TIMEOUT_MS = 10_000
const EXPECTED_WORKFLOW_PATH = '.github/workflows/stage-image.yml'
const ATTEMPT_PATH_PATTERN =
  /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/actions\/runs\/([1-9][0-9]*)\/attempts\/([1-9][0-9]*)$/u

/** Redacted-ошибка нарушения контракта GitHub workflow run attempt. */
export class GithubWorkflowContractError extends Error {
  constructor(category: string) {
    super(`GitHub workflow verification failed: ${category}`)
    this.name = 'GithubWorkflowContractError'
  }

  /** Сериализует только фиксированные имя и сообщение без входов и HTTP-данных. */
  toJSON(): { readonly name: string; readonly message: string } {
    return { message: this.message, name: this.name }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireAttemptShape(input: unknown): Record<string, string> {
  if (!isRecord(input)) {
    throw new GithubWorkflowContractError('response shape')
  }

  const fields = [
    'event',
    'status',
    'conclusion',
    'head_branch',
    'head_sha',
    'path',
  ] as const
  if (fields.some((field) => typeof input[field] !== 'string')) {
    throw new GithubWorkflowContractError('response shape')
  }

  return input as Record<string, string>
}

function buildAttemptApiUrl(
  workflowRunUrl: string,
  repository: string,
): string {
  let url: URL
  try {
    url = new URL(workflowRunUrl)
  } catch {
    throw new GithubWorkflowContractError('attempt URL')
  }

  const match = ATTEMPT_PATH_PATTERN.exec(url.pathname)
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'github.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    match === null ||
    `${match[1]}/${match[2]}`.toLowerCase() !== repository.toLowerCase()
  ) {
    throw new GithubWorkflowContractError('attempt URL')
  }

  return `https://api.github.com/repos/${match[1]}/${match[2]}/actions/runs/${match[3]}/attempts/${match[4]}`
}

/**
 * Проверяет один exact GitHub Actions run attempt опубликованной ревизии.
 *
 * @remarks
 * Выполняет ровно один GET без retry, запрещает redirects и использует
 * 10-секундный тайм-аут по умолчанию. Ошибки не сохраняют token, URL или body.
 */
export class GithubWorkflowAdapter implements PublicationVerificationPort {
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
    input: Parameters<PublicationVerificationPort['verify']>[0],
  ): Promise<void> {
    const apiUrl = buildAttemptApiUrl(input.workflowRunUrl, input.repository)
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const requestSignal = input.signal
      ? AbortSignal.any([timeoutSignal, input.signal])
      : timeoutSignal

    let response: Response
    try {
      response = await this.fetchImplementation(apiUrl, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${input.token}`,
          'x-github-api-version': '2022-11-28',
        },
        method: 'GET',
        redirect: 'error',
        signal: requestSignal,
      })
    } catch {
      if (input.signal?.aborted) {
        throw new GithubWorkflowContractError('request aborted')
      }
      if (timeoutSignal.aborted) {
        throw new GithubWorkflowContractError('request timeout')
      }
      throw new GithubWorkflowContractError('request')
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      throw new GithubWorkflowContractError('response status')
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new GithubWorkflowContractError('response JSON')
    }

    const attempt = requireAttemptShape(body)
    if (
      attempt.event !== 'push' ||
      attempt.status !== 'completed' ||
      attempt.conclusion !== 'success' ||
      attempt.head_branch !== input.integrationBranch ||
      attempt.head_sha !== input.revision ||
      attempt.path !== EXPECTED_WORKFLOW_PATH
    ) {
      throw new GithubWorkflowContractError('contract mismatch')
    }
  }
}
