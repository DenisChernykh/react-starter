import { pathToFileURL } from 'node:url'
import { parseDeploymentCliOptions } from './cli-options.ts'
import {
  FrontendDeploymentOrchestrator,
  DeploymentExecutionError,
  runDeploymentPreflight,
  type DeploymentOrchestratorDependencies,
} from './deployment-orchestrator.ts'
import { DockerImageVerificationAdapter } from './docker-image-verification.adapter.ts'
import { DokployHttpAdapter } from './dokploy-http.adapter.ts'
import {
  EvidenceFileAdapter,
  EvidenceFileError,
  readDeploymentEvidence,
} from './evidence-file.adapter.ts'
import { FrontendHostedSmokeAdapter } from './frontend-hosted-smoke.adapter.ts'
import { GithubWorkflowAdapter } from './github-workflow.adapter.ts'
import {
  parseDeploymentLiveEnvironment,
  type DeploymentLiveEnvironment,
} from './live-environment.ts'
import { DeploymentInputError, readDeploymentManifest } from './manifest.ts'
import { ExecFileCommandRunner } from '../lib/command-runner.ts'

const evidenceDirectory = '.deployment/evidence'

/** Внедряемые process-boundary функции deployment CLI. */
export interface DeploymentCliDependencies {
  readonly createAdapters: (
    live: DeploymentLiveEnvironment,
  ) => DeploymentOrchestratorDependencies
  readonly parseLiveEnvironment: typeof parseDeploymentLiveEnvironment
  readonly readEvidence: typeof readDeploymentEvidence
  readonly readManifest: typeof readDeploymentManifest
  readonly writeStderr: (line: string) => void
  readonly writeStdout: (line: string) => void
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function createDefaultAdapters(
  live: DeploymentLiveEnvironment,
): DeploymentOrchestratorDependencies {
  return {
    clock: { nowMs: Date.now, sleep },
    dokploy: new DokployHttpAdapter({
      apiKey: live.dokployApiKey,
      baseUrl: live.dokployBaseUrl,
    }),
    evidence: new EvidenceFileAdapter(),
    image: new DockerImageVerificationAdapter({
      commands: new ExecFileCommandRunner(),
    }),
    publication: new GithubWorkflowAdapter(),
    smoke: new FrontendHostedSmokeAdapter(),
  }
}

const defaultDependencies: DeploymentCliDependencies = {
  createAdapters: createDefaultAdapters,
  parseLiveEnvironment: parseDeploymentLiveEnvironment,
  readEvidence: readDeploymentEvidence,
  readManifest: readDeploymentManifest,
  writeStderr: (line) => process.stderr.write(`${line}\n`),
  writeStdout: (line) => process.stdout.write(`${line}\n`),
}

function safeError(error: unknown): Readonly<Record<string, unknown>> {
  if (
    error instanceof DeploymentInputError ||
    error instanceof EvidenceFileError ||
    error instanceof DeploymentExecutionError
  ) {
    return error.toJSON()
  }
  return { category: 'failed', name: 'DeploymentCliError' }
}

function writeSuccess(
  dependencies: DeploymentCliDependencies,
  result: Readonly<Record<string, unknown>>,
): void {
  dependencies.writeStdout(JSON.stringify({ ...result, ok: true }))
}

/**
 * Выполняет одну deployment CLI-команду и возвращает process exit code.
 *
 * @remarks
 * Разбирает аргументы до чтения файлов и создания live-адаптеров. Все ошибки
 * сериализуются как redacted JSON; функция не вызывает `process.exit()`.
 */
export async function runDeploymentCli(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  overrides: Partial<DeploymentCliDependencies> = {},
): Promise<number> {
  const dependencies = { ...defaultDependencies, ...overrides }

  try {
    const options = parseDeploymentCliOptions(arguments_)

    if (options.command === 'rollback') {
      const sourceEvidence = await dependencies.readEvidence(
        options.evidencePath as string,
      )
      const live = dependencies.parseLiveEnvironment(environment)
      const adapters = dependencies.createAdapters(live)
      const evidencePath = await new FrontendDeploymentOrchestrator(
        adapters,
      ).rollback(sourceEvidence, live, evidenceDirectory)
      const revision = sourceEvidence.previous?.revision
      if (revision === undefined) {
        throw new DeploymentExecutionError('rollback_source', 'invalid')
      }
      writeSuccess(dependencies, {
        environment: sourceEvidence.environment,
        evidencePath,
        operation: 'rollback',
        revision: revision.slice(0, 12),
      })
      return 0
    }

    const manifest = await dependencies.readManifest(
      options.manifestPath as string,
    )
    const live = dependencies.parseLiveEnvironment(environment)
    const adapters = dependencies.createAdapters(live)

    if (options.command === 'preflight') {
      await runDeploymentPreflight({ live, manifest }, adapters)
      writeSuccess(dependencies, {
        environment: manifest.environment,
        mode: manifest.mode,
        operation: 'preflight',
        revision: manifest.candidate.revision.slice(0, 12),
      })
      return 0
    }

    const orchestrator = new FrontendDeploymentOrchestrator(adapters)
    const evidencePath = await orchestrator[
      options.command === 'bootstrap' ? 'bootstrap' : 'promote'
    ]({ evidenceDirectory, live, manifest })
    writeSuccess(dependencies, {
      environment: manifest.environment,
      evidencePath,
      operation: options.command,
      revision: manifest.candidate.revision.slice(0, 12),
    })
    return 0
  } catch (error) {
    dependencies.writeStderr(
      JSON.stringify({ error: safeError(error), ok: false }),
    )
    return 1
  }
}

const executablePath = process.argv[1]
if (
  executablePath !== undefined &&
  import.meta.url === pathToFileURL(executablePath).href
) {
  void runDeploymentCli(process.argv.slice(2), process.env).then((exitCode) => {
    process.exitCode = exitCode
  })
}
