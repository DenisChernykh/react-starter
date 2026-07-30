import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ExecFileCommandRunner,
  type CommandOptions,
  type CommandPort,
  type CommandResult,
} from '../lib/command-runner.ts'
import type { ImageVerificationPort } from './ports.ts'

const COMMAND_TIMEOUT_MS = 30_000
const TEMPORARY_CONFIG_PREFIX = 'react-starter-docker-auth-'
const GHCR_REGISTRY_HOST = 'ghcr.io'
const GHCR_REGISTRY_URL = 'https://ghcr.io'
const GHCR_DIGEST_IMAGE_PATTERN =
  /^ghcr\.io\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)@sha256:[0-9a-f]{64}$/u

interface TemporaryDockerConfigFunctions {
  readonly chmod: (path: string, mode: number) => Promise<void>
  readonly mkdtemp: (prefix: string) => Promise<string>
  readonly rm: (
    path: string,
    options: { readonly force: boolean; readonly recursive: boolean },
  ) => Promise<void>
  readonly tmpdir: () => string
}

const defaultTemporaryDockerConfig: TemporaryDockerConfigFunctions = {
  chmod,
  mkdtemp,
  rm,
  tmpdir,
}

/** Redacted-ошибка проверки опубликованного OCI image. */
export class DockerImageVerificationError extends Error {
  /** Фиксированные безопасные категории primary и cleanup failures. */
  readonly categories: readonly string[]

  constructor(category: string | readonly string[]) {
    const categories = typeof category === 'string' ? [category] : [...category]
    super(`Docker image verification failed: ${categories.join('; ')}`)
    this.name = 'DockerImageVerificationError'
    this.categories = Object.freeze(categories)
  }

  /** Сериализует только фиксированные безопасные категории проверки. */
  toJSON(): {
    readonly name: string
    readonly message: string
    readonly categories: readonly string[]
  } {
    return {
      categories: this.categories,
      message: this.message,
      name: this.name,
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseLabels(stdout: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout) as unknown
  } catch {
    throw new DockerImageVerificationError('image metadata')
  }

  if (!isRecord(parsed)) {
    throw new DockerImageVerificationError('OCI labels')
  }

  return parsed
}

function requireSuccessfulCommand(
  result: CommandResult,
  category: string,
): void {
  if (result.exitCode !== 0) {
    throw new DockerImageVerificationError(category)
  }
}

function requireLabels(
  labels: Record<string, unknown>,
  input: Parameters<ImageVerificationPort['verify']>[0],
): void {
  if (
    labels['org.opencontainers.image.source'] !==
      `https://github.com/${input.repository}` ||
    labels['org.opencontainers.image.revision'] !== input.image.revision ||
    (input.workflowRunUrl !== undefined &&
      labels['io.github.actions.workflow-run-url'] !== input.workflowRunUrl)
  ) {
    throw new DockerImageVerificationError('OCI labels')
  }
}

function requireValidImageInput(
  input: Parameters<ImageVerificationPort['verify']>[0],
): void {
  const imageMatch = GHCR_DIGEST_IMAGE_PATTERN.exec(input.image.imageRef)
  if (
    input.registryUrl !== GHCR_REGISTRY_URL ||
    imageMatch?.[1] !== input.repository.toLowerCase()
  ) {
    throw new DockerImageVerificationError('image input')
  }
}

/**
 * Проверяет доступность exact digest и его OCI provenance через временную auth.
 *
 * @remarks
 * Для каждого вызова создаёт отдельный `0700` `DOCKER_CONFIG`, передаёт
 * registry password только через stdin и удаляет config в `finally`. Pulled
 * image остаётся в локальном Docker cache: адаптер никогда не удаляет image,
 * который мог существовать до проверки.
 */
export class DockerImageVerificationAdapter implements ImageVerificationPort {
  private readonly commands: CommandPort
  private readonly temporaryDockerConfig: TemporaryDockerConfigFunctions

  constructor(
    dependencies: {
      readonly commands?: CommandPort
      readonly temporaryDockerConfig?: TemporaryDockerConfigFunctions
    } = {},
  ) {
    this.commands = dependencies.commands ?? new ExecFileCommandRunner()
    this.temporaryDockerConfig =
      dependencies.temporaryDockerConfig ?? defaultTemporaryDockerConfig
  }

  async verify(
    input: Parameters<ImageVerificationPort['verify']>[0],
  ): Promise<void> {
    requireValidImageInput(input)

    let temporaryConfig: string | undefined
    let primaryError: DockerImageVerificationError | undefined

    try {
      input.signal?.throwIfAborted()
      temporaryConfig = await this.temporaryDockerConfig.mkdtemp(
        join(this.temporaryDockerConfig.tmpdir(), TEMPORARY_CONFIG_PREFIX),
      )
      await this.temporaryDockerConfig.chmod(temporaryConfig, 0o700)

      const options: CommandOptions = {
        env: { ...process.env, DOCKER_CONFIG: temporaryConfig },
        signal: input.signal,
        timeoutMs: COMMAND_TIMEOUT_MS,
      }
      await this.runCommand(
        [
          'login',
          GHCR_REGISTRY_HOST,
          '--username',
          input.username,
          '--password-stdin',
        ],
        { ...options, stdin: input.password },
        'registry login',
        input.signal,
      )
      await this.runCommand(
        ['pull', input.image.imageRef],
        options,
        'image pull',
        input.signal,
      )
      const inspect = await this.runCommand(
        [
          'image',
          'inspect',
          input.image.imageRef,
          '--format',
          '{{json .Config.Labels}}',
        ],
        options,
        'image inspect',
        input.signal,
      )
      requireLabels(parseLabels(inspect.stdout), input)
    } catch (error) {
      primaryError =
        error instanceof DockerImageVerificationError
          ? error
          : new DockerImageVerificationError(
              input.signal?.aborted ? 'aborted' : 'temporary auth',
            )
    } finally {
      if (temporaryConfig !== undefined) {
        try {
          await this.temporaryDockerConfig.rm(temporaryConfig, {
            force: true,
            recursive: true,
          })
        } catch {
          primaryError = new DockerImageVerificationError([
            ...(primaryError?.categories ?? []),
            'temporary auth cleanup',
          ])
        }
      }
    }

    if (primaryError !== undefined) {
      throw primaryError
    }
  }

  private async runCommand(
    arguments_: readonly string[],
    options: CommandOptions,
    category: string,
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    signal?.throwIfAborted()

    let result: CommandResult
    try {
      result = await this.commands.run('docker', arguments_, options)
    } catch {
      throw new DockerImageVerificationError(
        signal?.aborted ? 'aborted' : category,
      )
    }

    if (signal?.aborted) {
      throw new DockerImageVerificationError('aborted')
    }
    requireSuccessfulCommand(result, category)
    return result
  }
}
