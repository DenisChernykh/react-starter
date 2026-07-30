import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  ExecFileCommandRunner,
  type CommandPort,
  type CommandResult,
} from '../lib/command-runner.ts'
import { verifyFrontendHttpContract } from './frontend-http-contract.ts'

const COMMAND_TIMEOUT_MS = 30_000
const READINESS_TIMEOUT_MS = 20_000
const REQUEST_TIMEOUT_MS = 5_000
const REVISION_PATTERN = /^[a-f0-9]{40}$/u
const RFC3339_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

/** Ожидания для smoke-проверки одного Docker image. */
export interface DockerImageSmokeInput {
  readonly imageRef: string
  readonly expectedRevision: string
  readonly expectedSource?: string
  readonly expectedWorkflowRunUrl?: string
}

class DockerImageSmokeError extends Error {
  constructor(operation: string) {
    super(`Docker image smoke failed: ${operation}`)
    this.name = 'DockerImageSmokeError'
  }
}

/**
 * Проверяет, что ошибка содержит только фиксированные категории image smoke.
 *
 * @remarks
 * Предикат распознаёт экземпляры закрытого класса этого модуля и созданную
 * здесь составную ошибку из двух таких экземпляров. Произвольные ошибки
 * вызывающего кода не считаются безопасными для вывода.
 */
export function isSafeDockerImageSmokeFailure(error: unknown): error is Error {
  if (error instanceof DockerImageSmokeError) {
    return true
  }

  return (
    error instanceof AggregateError &&
    error.message ===
      'Docker image smoke failed: primary operation and container cleanup' &&
    error.errors.length === 2 &&
    error.errors.every((failure) => failure instanceof DockerImageSmokeError)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Проверяет синтаксис RFC3339, календарную дату, timezone и существующий instant. */
function isRfc3339Instant(value: string): boolean {
  const match = RFC3339_INSTANT_PATTERN.exec(value)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const timezone = match[7]
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1]
  if (
    daysInMonth === undefined ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false
  }

  if (timezone !== 'Z') {
    const timezoneHour = Number(timezone.slice(1, 3))
    const timezoneMinute = Number(timezone.slice(4, 6))
    if (timezoneHour > 23 || timezoneMinute > 59) {
      return false
    }
  }

  return !Number.isNaN(Date.parse(value))
}

function requireSuccessfulCommand(
  result: CommandResult,
  operation: string,
): CommandResult {
  if (result.exitCode !== 0) {
    throw new DockerImageSmokeError(operation)
  }

  return result
}

function parseImageConfig(stdout: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 1 ||
      !isRecord(parsed[0]) ||
      !isRecord(parsed[0].Config)
    ) {
      throw new DockerImageSmokeError('image metadata')
    }

    return parsed[0].Config
  } catch (error) {
    if (error instanceof DockerImageSmokeError) {
      throw error
    }

    throw new DockerImageSmokeError('image metadata')
  }
}

function requireImageMetadata(
  config: Record<string, unknown>,
  input: DockerImageSmokeInput,
): void {
  if (config.User !== '101') {
    throw new DockerImageSmokeError('runtime user')
  }

  if (
    !isRecord(config.ExposedPorts) ||
    !Object.hasOwn(config.ExposedPorts, '8080/tcp')
  ) {
    throw new DockerImageSmokeError('exposed port')
  }

  if (!isRecord(config.Labels)) {
    throw new DockerImageSmokeError('OCI labels')
  }

  const labels = config.Labels
  const revision = labels['org.opencontainers.image.revision']
  const created = labels['org.opencontainers.image.created']
  const source = labels['org.opencontainers.image.source']
  const workflowRunUrl = labels['io.github.actions.workflow-run-url']
  if (
    typeof revision !== 'string' ||
    !REVISION_PATTERN.test(revision) ||
    revision !== input.expectedRevision ||
    typeof created !== 'string' ||
    !isRfc3339Instant(created) ||
    typeof source !== 'string' ||
    !isSafeHttpsUrl(source) ||
    typeof workflowRunUrl !== 'string' ||
    !isSafeHttpsUrl(workflowRunUrl)
  ) {
    throw new DockerImageSmokeError('OCI labels')
  }
  if (input.expectedSource !== undefined && source !== input.expectedSource) {
    throw new DockerImageSmokeError('OCI labels')
  }
  if (
    input.expectedWorkflowRunUrl !== undefined &&
    workflowRunUrl !== input.expectedWorkflowRunUrl
  ) {
    throw new DockerImageSmokeError('OCI labels')
  }
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}

function parsePublishedPort(stdout: string): number {
  const match = /^127\.0\.0\.1:(\d+)\s*$/u.exec(stdout)
  const port = match?.[1] ? Number(match[1]) : Number.NaN
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DockerImageSmokeError('published port')
  }

  return port
}

/**
 * Отличает ожидаемую недоступность ещё не готового HTTP listener от ошибок кода.
 */
function isRetryableReadinessError(
  error: unknown,
  timeoutSignal: AbortSignal,
): boolean {
  if (
    timeoutSignal.aborted ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  ) {
    return true
  }

  const pending: unknown[] = [error]
  const visited = new Set<unknown>()
  while (pending.length > 0) {
    const candidate = pending.pop()
    if (candidate === undefined || visited.has(candidate)) {
      continue
    }
    visited.add(candidate)

    if (isRecord(candidate)) {
      if (
        typeof candidate.code === 'string' &&
        RETRYABLE_NETWORK_ERROR_CODES.has(candidate.code)
      ) {
        return true
      }
      if (candidate.cause !== undefined) {
        pending.push(candidate.cause)
      }
    }
    if (candidate instanceof AggregateError) {
      pending.push(...candidate.errors)
    }
  }

  return false
}

async function waitForHttpReadiness(
  baseUrl: URL,
  fetchImplementation: typeof fetch,
): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now()
    const timeoutSignal = AbortSignal.timeout(
      Math.min(REQUEST_TIMEOUT_MS, remainingMs),
    )
    try {
      const response = await fetchImplementation(
        new URL('/_frontend/health', baseUrl),
        {
          redirect: 'manual',
          signal: timeoutSignal,
        },
      )
      void response.arrayBuffer().catch(() => undefined)
      return
    } catch (error) {
      if (!isRetryableReadinessError(error, timeoutSignal)) {
        throw error
      }

      const delayMs = Math.min(200, deadline - Date.now())
      if (delayMs > 0) {
        await delay(delayMs)
      }
    }
  }

  throw new DockerImageSmokeError('HTTP readiness')
}

/**
 * Проверяет metadata, HTTP-контракт и корректное завершение Docker image.
 *
 * @remarks
 * Функция создаёт уникальный контейнер на loopback ephemeral port, использует
 * read-only root filesystem и удаляет в `finally` только созданный контейнер.
 * Переданный вызывающим кодом image никогда не удаляется.
 */
export async function smokeDockerImage(
  input: DockerImageSmokeInput,
  dependencies: {
    readonly commands?: CommandPort
    readonly fetchImplementation?: typeof fetch
  } = {},
): Promise<void> {
  const commands = dependencies.commands ?? new ExecFileCommandRunner()
  const fetchImplementation = dependencies.fetchImplementation ?? fetch
  const inspect = requireSuccessfulCommand(
    await commands.run('docker', ['image', 'inspect', input.imageRef], {
      timeoutMs: COMMAND_TIMEOUT_MS,
    }),
    'image inspect',
  )
  requireImageMetadata(parseImageConfig(inspect.stdout), input)

  const containerName = `react-starter-oci-smoke-${process.pid}-${randomUUID()}`
  let containerMayExist = false
  let primaryError: unknown
  let cleanupError: unknown

  try {
    containerMayExist = true
    requireSuccessfulCommand(
      await commands.run(
        'docker',
        [
          'run',
          '--detach',
          '--name',
          containerName,
          '--platform',
          'linux/amd64',
          '--read-only',
          '--tmpfs',
          '/tmp:rw,noexec,nosuid,size=16m',
          '--publish',
          '127.0.0.1::8080',
          input.imageRef,
        ],
        { timeoutMs: COMMAND_TIMEOUT_MS },
      ),
      'container run',
    )

    const portResult = requireSuccessfulCommand(
      await commands.run('docker', ['port', containerName, '8080/tcp'], {
        timeoutMs: COMMAND_TIMEOUT_MS,
      }),
      'container port',
    )
    const baseUrl = new URL(
      `http://127.0.0.1:${parsePublishedPort(portResult.stdout)}`,
    )

    await waitForHttpReadiness(baseUrl, fetchImplementation)
    await verifyFrontendHttpContract(baseUrl, fetchImplementation)

    requireSuccessfulCommand(
      await commands.run('docker', ['stop', '--time', '10', containerName], {
        timeoutMs: COMMAND_TIMEOUT_MS,
      }),
      'container stop',
    )
    const exitCode = requireSuccessfulCommand(
      await commands.run(
        'docker',
        ['inspect', '--format', '{{.State.ExitCode}}', containerName],
        { timeoutMs: COMMAND_TIMEOUT_MS },
      ),
      'container exit inspect',
    )
    if (exitCode.stdout.trim() !== '0') {
      throw new DockerImageSmokeError('container exit code')
    }
  } catch (error) {
    primaryError = error
  } finally {
    if (containerMayExist) {
      try {
        const cleanup = await commands.run(
          'docker',
          ['rm', '--force', containerName],
          { timeoutMs: COMMAND_TIMEOUT_MS },
        )
        if (cleanup.exitCode !== 0) {
          cleanupError = new DockerImageSmokeError('container cleanup')
        }
      } catch {
        cleanupError = new DockerImageSmokeError('container cleanup')
      }
    }
  }

  if (primaryError !== undefined && cleanupError !== undefined) {
    const primaryFailure =
      primaryError instanceof DockerImageSmokeError
        ? primaryError
        : new DockerImageSmokeError('primary operation')
    throw new AggregateError(
      [primaryFailure, cleanupError],
      'Docker image smoke failed: primary operation and container cleanup',
    )
  }
  if (primaryError !== undefined) {
    throw primaryError
  }
  if (cleanupError !== undefined) {
    throw cleanupError
  }
}
