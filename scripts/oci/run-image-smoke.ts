import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ExecFileCommandRunner,
  type CommandPort,
  type CommandResult,
} from '../lib/command-runner.ts'
import {
  isSafeDockerImageSmokeFailure,
  smokeDockerImage,
  type DockerImageSmokeInput,
} from './docker-image-smoke.ts'

const COMMAND_TIMEOUT_MS = 30_000
const BUILD_TIMEOUT_MS = 10 * 60_000
const LOCAL_SOURCE = 'https://github.com/local/react-starter'
const LOCAL_WORKFLOW_RUN_URL =
  'https://github.com/local/react-starter/actions/runs/0/attempts/0'
const DIGEST_IMAGE_PATTERN =
  /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*@sha256:[a-f0-9]{64}$/u
const REVISION_PATTERN = /^[a-f0-9]{40}$/u

/** Режим OCI smoke: локальная сборка либо переданный immutable digest. */
export type OciSmokeOptions =
  | { readonly buildLocal: true }
  | ({ readonly buildLocal: false } & DockerImageSmokeInput)

class OciSmokeCliError extends Error {
  constructor() {
    super('Invalid OCI smoke arguments')
    this.name = 'OciSmokeCliError'
  }
}

class OciSmokeExecutionError extends Error {
  constructor(operation: string) {
    super(`OCI smoke execution failed: ${operation}`)
    this.name = 'OciSmokeExecutionError'
  }
}

function requireSafeHttpsUrl(value: string): string {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new OciSmokeCliError()
    }

    return value
  } catch (error) {
    if (error instanceof OciSmokeCliError) {
      throw error
    }

    throw new OciSmokeCliError()
  }
}

/**
 * Разбирает намеренно узкую CLI-грамматику локального или digest smoke.
 *
 * @remarks
 * Переданный image допускается только как lowercase `ghcr.io/...@sha256:...`.
 * Ошибки не включают значения аргументов, поэтому credential-bearing URL не
 * попадает в diagnostics.
 */
export function parseOciSmokeOptions(
  arguments_: readonly string[],
): OciSmokeOptions {
  if (arguments_.length === 0) {
    return { buildLocal: true }
  }

  const values = new Map<string, string>()
  const allowedFlags = new Set([
    '--image',
    '--revision',
    '--source',
    '--workflow-run-url',
  ])

  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index]
    const value = arguments_[index + 1]
    if (
      flag === undefined ||
      !allowedFlags.has(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(flag)
    ) {
      throw new OciSmokeCliError()
    }
    values.set(flag, value)
  }

  const imageRef = values.get('--image')
  const expectedRevision = values.get('--revision')
  if (
    imageRef === undefined ||
    expectedRevision === undefined ||
    !DIGEST_IMAGE_PATTERN.test(imageRef) ||
    !REVISION_PATTERN.test(expectedRevision)
  ) {
    throw new OciSmokeCliError()
  }

  const expectedSourceValue = values.get('--source')
  const expectedWorkflowRunUrlValue = values.get('--workflow-run-url')
  const expectedSource =
    expectedSourceValue === undefined
      ? undefined
      : requireSafeHttpsUrl(expectedSourceValue)
  const expectedWorkflowRunUrl =
    expectedWorkflowRunUrlValue === undefined
      ? undefined
      : requireSafeHttpsUrl(expectedWorkflowRunUrlValue)

  return {
    buildLocal: false,
    expectedRevision,
    imageRef,
    ...(expectedSource === undefined ? {} : { expectedSource }),
    ...(expectedWorkflowRunUrl === undefined ? {} : { expectedWorkflowRunUrl }),
  }
}

function requireCommand(
  result: CommandResult,
  operation: string,
): CommandResult {
  if (result.exitCode !== 0) {
    throw new OciSmokeExecutionError(operation)
  }

  return result
}

function normalizeGitHubSource(remote: string): string | undefined {
  const trimmed = remote.trim()
  const scpMatch =
    /^git@github\.com:([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?$/iu.exec(
      trimmed,
    )
  if (scpMatch?.[1] && scpMatch[2]) {
    return `https://github.com/${scpMatch[1]}/${scpMatch[2]}`
  }

  try {
    const url = new URL(trimmed)
    if (
      !['https:', 'ssh:'].includes(url.protocol) ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.password !== '' ||
      (url.protocol === 'https:' && url.username !== '') ||
      (url.protocol === 'ssh:' && !['', 'git'].includes(url.username)) ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return undefined
    }

    const pathMatch = /^\/([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/iu.exec(
      url.pathname,
    )
    if (!pathMatch?.[1] || !pathMatch[2]) {
      return undefined
    }

    return `https://github.com/${pathMatch[1]}/${pathMatch[2]}`
  } catch {
    return undefined
  }
}

async function readLocalBuildMetadata(commands: CommandPort): Promise<{
  readonly created: string
  readonly revision: string
  readonly source: string
}> {
  const revision = requireCommand(
    await commands.run('git', ['rev-parse', 'HEAD'], {
      timeoutMs: COMMAND_TIMEOUT_MS,
    }),
    'git revision',
  ).stdout.trim()
  if (!REVISION_PATTERN.test(revision)) {
    throw new OciSmokeExecutionError('git revision')
  }

  const created = requireCommand(
    await commands.run('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      timeoutMs: COMMAND_TIMEOUT_MS,
    }),
    'git commit time',
  ).stdout.trim()
  if (created === '' || Number.isNaN(Date.parse(created))) {
    throw new OciSmokeExecutionError('git commit time')
  }

  const remote = await commands.run(
    'git',
    ['config', '--get', 'remote.origin.url'],
    { timeoutMs: COMMAND_TIMEOUT_MS },
  )
  const source =
    remote.exitCode === 0
      ? (normalizeGitHubSource(remote.stdout) ?? LOCAL_SOURCE)
      : LOCAL_SOURCE

  return { created, revision, source }
}

/**
 * Собирает и проверяет локальный image, затем удаляет только созданный tag.
 *
 * @remarks
 * Порт команд передаётся явно для локальной сертификации orchestration без
 * доступа тестов к Docker daemon.
 */
export async function runLocalImageSmoke(commands: CommandPort): Promise<void> {
  const metadata = await readLocalBuildMetadata(commands)
  const imageRef = `react-starter-oci-smoke:${process.pid}-${randomUUID()}`
  let buildAttempted = false
  let primaryError: unknown
  let cleanupError: unknown

  try {
    buildAttempted = true
    requireCommand(
      await commands.run(
        'docker',
        [
          'build',
          '--platform',
          'linux/amd64',
          '--tag',
          imageRef,
          '--build-arg',
          `BUILD_SOURCE=${metadata.source}`,
          '--build-arg',
          `BUILD_REVISION=${metadata.revision}`,
          '--build-arg',
          `BUILD_CREATED=${metadata.created}`,
          '--build-arg',
          `BUILD_WORKFLOW_RUN_URL=${LOCAL_WORKFLOW_RUN_URL}`,
          '.',
        ],
        { timeoutMs: BUILD_TIMEOUT_MS },
      ),
      'docker build',
    )

    await smokeDockerImage(
      {
        expectedRevision: metadata.revision,
        expectedSource: metadata.source,
        expectedWorkflowRunUrl: LOCAL_WORKFLOW_RUN_URL,
        imageRef,
      },
      { commands },
    )
  } catch (error) {
    primaryError = error
  } finally {
    if (buildAttempted) {
      try {
        const cleanup = await commands.run(
          'docker',
          ['image', 'rm', imageRef],
          { timeoutMs: COMMAND_TIMEOUT_MS },
        )
        if (cleanup.exitCode !== 0) {
          cleanupError = new OciSmokeExecutionError('local image cleanup')
        }
      } catch {
        cleanupError = new OciSmokeExecutionError('local image cleanup')
      }
    }
  }

  if (primaryError !== undefined && cleanupError !== undefined) {
    const primaryFailure =
      primaryError instanceof OciSmokeExecutionError
        ? primaryError
        : isSafeDockerImageSmokeFailure(primaryError)
          ? primaryError
          : new OciSmokeExecutionError('primary operation')
    throw new AggregateError(
      [primaryFailure, cleanupError],
      'OCI smoke execution failed: primary operation and local image cleanup',
    )
  }
  if (primaryError !== undefined) {
    throw primaryError
  }
  if (cleanupError !== undefined) {
    throw cleanupError
  }
}

async function main(): Promise<void> {
  const options = parseOciSmokeOptions(process.argv.slice(2))
  if (options.buildLocal) {
    await runLocalImageSmoke(new ExecFileCommandRunner())
    return
  }

  await smokeDockerImage(options)
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectExecution) {
  try {
    await main()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'OCI smoke execution failed'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
