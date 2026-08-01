import type { DeploymentLiveEnvironment } from './live-environment.ts'
import type {
  DeploymentImageReference,
  DeploymentMode,
  FrontendDeploymentManifest,
} from './manifest.ts'
import type {
  DeploymentOperation,
  DokployApplication,
  DokployDeploymentRecord,
  DokployPort,
  EvidencePort,
  FrontendDeploymentEvidence,
  HostedSmokeResult,
  HostedSmokePort,
  ImageVerificationPort,
  PublicationVerificationPort,
  ClockPort,
} from './ports.ts'

const exactImagePattern =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@sha256:[0-9a-f]{64}$/u
const revisionPattern = /^[0-9a-f]{40}$/u
const knownDeploymentStatuses = new Set([
  'cancelled',
  'done',
  'error',
  'running',
])
const pollIntervalMs = 5_000
const pollDeadlineMs = 600_000

/** Результат read-only проверки одного release manifest против live state. */
export interface DeploymentPreflightResult {
  readonly mode: DeploymentMode
  readonly application: DokployApplication
  readonly previous: DeploymentImageReference | null
  readonly candidate: DeploymentImageReference
  readonly successfulDeploymentCount: number
}

/** Зависимости orchestration core без доступа к process environment. */
export interface DeploymentOrchestratorDependencies {
  readonly publication: PublicationVerificationPort
  readonly image: ImageVerificationPort
  readonly dokploy: DokployPort
  readonly smoke: HostedSmokePort
  readonly clock: ClockPort
  readonly evidence: EvidencePort
}

/** Проверенный ввод одной изменяющей deployment-операции. */
export interface DeploymentOperationInput {
  readonly manifest: FrontendDeploymentManifest
  readonly live: DeploymentLiveEnvironment
  readonly evidenceDirectory: string
  readonly signal?: AbortSignal
}

/**
 * Redacted ошибка orchestration с фиксированными шагом и категорией.
 *
 * @remarks
 * Не сохраняет исходную ошибку, live-ответ, URL, credentials или manifest.
 */
export class DeploymentExecutionError extends Error {
  readonly step: string
  readonly category: string

  constructor(step: string, category: string) {
    super('Frontend deployment operation failed')
    this.name = 'DeploymentExecutionError'
    this.step = step
    this.category = category
  }

  /** Возвращает только безопасные фиксированные поля ошибки. */
  toJSON(): {
    readonly name: string
    readonly message: string
    readonly step: string
    readonly category: string
  } {
    return {
      name: this.name,
      message: this.message,
      step: this.step,
      category: this.category,
    }
  }
}

function fail(step: string, category: string): never {
  throw new DeploymentExecutionError(step, category)
}

function throwIfAborted(signal: AbortSignal | undefined, step: string): void {
  if (signal?.aborted === true) {
    fail(step, 'aborted')
  }
}

async function runReadStep<T>(
  step: string,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  throwIfAborted(signal, step)
  try {
    return await operation()
  } catch (error) {
    if (error instanceof DeploymentExecutionError) {
      throw error
    }
    if (signal?.aborted === true) {
      fail(step, 'aborted')
    }
    fail(step, 'verification_failed')
  }
}

function freezeImage(
  image: DeploymentImageReference,
): DeploymentImageReference {
  return Object.freeze({ ...image })
}

function freezeSmoke(smoke: HostedSmokeResult): HostedSmokeResult {
  return Object.freeze({
    apiProbeStatus: smoke.apiProbeStatus,
    checkedPaths: Object.freeze([...smoke.checkedPaths]),
  })
}

function freezeEvidence(
  evidence: FrontendDeploymentEvidence,
): FrontendDeploymentEvidence {
  return Object.freeze({
    ...evidence,
    previous:
      evidence.previous === null ? null : freezeImage(evidence.previous),
    smoke:
      evidence.smoke === undefined ? undefined : freezeSmoke(evidence.smoke),
    smokePaths: Object.freeze([...evidence.smokePaths]),
    target: freezeImage(evidence.target),
  })
}

function requireKnownState(
  manifest: FrontendDeploymentManifest,
  application: DokployApplication,
  deployments: readonly { readonly status: string }[],
): DeploymentPreflightResult {
  if (application.sourceType !== 'docker') {
    fail('preflight', 'source_type')
  }

  if (
    application.dockerImage !== null &&
    !exactImagePattern.test(application.dockerImage)
  ) {
    fail('preflight', 'configured_image')
  }

  if (
    deployments.some(
      (deployment) => !knownDeploymentStatuses.has(deployment.status),
    )
  ) {
    fail('preflight', 'deployment_status')
  }

  const successfulDeploymentCount = deployments.filter(
    (deployment) => deployment.status === 'done',
  ).length

  if (manifest.mode === 'bootstrap') {
    if (application.dockerImage !== null) {
      fail('preflight', 'bootstrap_image')
    }
    if (successfulDeploymentCount !== 0) {
      fail('preflight', 'bootstrap_history')
    }
  } else {
    if (application.dockerImage === manifest.candidate.imageRef) {
      fail('preflight', 'candidate_configured')
    }
    if (
      manifest.expectedCurrent === null ||
      application.dockerImage !== manifest.expectedCurrent.imageRef
    ) {
      fail('preflight', 'current_drift')
    }
    if (successfulDeploymentCount === 0) {
      fail('preflight', 'successful_history')
    }
  }

  return Object.freeze({
    application: Object.freeze({ ...application }),
    candidate: freezeImage(manifest.candidate),
    mode: manifest.mode,
    previous:
      manifest.expectedCurrent === null
        ? null
        : freezeImage(manifest.expectedCurrent),
    successfulDeploymentCount,
  })
}

/**
 * Проверяет публикацию, exact image и текущее Dokploy-состояние без mutation.
 *
 * @throws {@link DeploymentExecutionError} с redacted шагом и категорией.
 */
export async function runDeploymentPreflight(
  input: Omit<DeploymentOperationInput, 'evidenceDirectory'>,
  dependencies: Pick<
    DeploymentOrchestratorDependencies,
    'publication' | 'image' | 'dokploy'
  >,
): Promise<DeploymentPreflightResult> {
  const { live, manifest, signal } = input

  await runReadStep('publication', signal, async () => {
    await dependencies.publication.verify({
      repository: manifest.repository,
      revision: manifest.candidate.revision,
      signal,
      token: live.githubToken,
      workflowRunUrl: manifest.workflowRunUrl,
    })
  })
  await runReadStep('image', signal, async () => {
    await dependencies.image.verify({
      image: manifest.candidate,
      password: live.ghcrPassword,
      registryUrl: live.ghcrRegistryUrl,
      repository: manifest.repository,
      signal,
      username: live.ghcrUsername,
      workflowRunUrl: manifest.workflowRunUrl,
    })
  })
  const application = await runReadStep('application', signal, async () =>
    dependencies.dokploy.getApplication(live.dokployApplicationId, signal),
  )
  const deployments = await runReadStep('deployments', signal, async () =>
    dependencies.dokploy.listDeployments(live.dokployApplicationId, signal),
  )

  throwIfAborted(signal, 'preflight')
  return requireKnownState(manifest, application, deployments)
}

interface PollResult {
  readonly deploymentId: string
  readonly terminalStatus: 'done'
}

interface OperationState {
  deploymentId?: string
  mutationStarted: boolean
  terminalStatus?: string
}

type RollbackSourceEvidence = FrontendDeploymentEvidence & {
  readonly operation: 'promote'
  readonly outcome: 'failed' | 'indeterminate'
  readonly previous: DeploymentImageReference
}

function requireRollbackSource(
  evidence: FrontendDeploymentEvidence,
  live: DeploymentLiveEnvironment,
): asserts evidence is RollbackSourceEvidence {
  const repositoryPrefix = `ghcr.io/${evidence.repository.toLowerCase()}@sha256:`
  if (
    evidence.operation !== 'promote' ||
    (evidence.outcome !== 'failed' && evidence.outcome !== 'indeterminate') ||
    evidence.previous === null ||
    evidence.applicationId !== live.dokployApplicationId ||
    !exactImagePattern.test(evidence.previous.imageRef) ||
    !revisionPattern.test(evidence.previous.revision) ||
    !exactImagePattern.test(evidence.target.imageRef) ||
    !revisionPattern.test(evidence.target.revision) ||
    !evidence.previous.imageRef.startsWith(repositoryPrefix) ||
    !evidence.target.imageRef.startsWith(repositoryPrefix) ||
    evidence.previous.imageRef === evidence.target.imageRef
  ) {
    fail('rollback_source', 'invalid')
  }
}

/**
 * Координирует explicit bootstrap и promotion поверх проверенных портов.
 *
 * @remarks
 * Каждая mutation повторяет полный preflight, никогда не выполняет
 * автоматический rollback и возвращает путь записанного redacted evidence.
 */
export class FrontendDeploymentOrchestrator {
  readonly #dependencies: DeploymentOrchestratorDependencies

  constructor(dependencies: DeploymentOrchestratorDependencies) {
    this.#dependencies = dependencies
  }

  /** Выполняет первое развёртывание только для bootstrap manifest. */
  async bootstrap(input: DeploymentOperationInput): Promise<string> {
    if (input.manifest.mode !== 'bootstrap') {
      fail('command', 'mode')
    }
    return this.#apply('bootstrap', input)
  }

  /** Продвигает новый exact digest только для promotion manifest. */
  async promote(input: DeploymentOperationInput): Promise<string> {
    if (input.manifest.mode !== 'promotion') {
      fail('command', 'mode')
    }
    return this.#apply('promote', input)
  }

  /** Явно возвращает failed promotion на сохранённый previous exact digest. */
  async rollback(
    sourceEvidence: FrontendDeploymentEvidence,
    live: DeploymentLiveEnvironment,
    evidenceDirectory: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const startedAtMs = this.#dependencies.clock.nowMs()
    const state: OperationState = { mutationStarted: false }
    let sourceValidated = false
    let rollbackTarget: DeploymentImageReference | null = null

    try {
      requireRollbackSource(sourceEvidence, live)
      sourceValidated = true
      rollbackTarget = sourceEvidence.previous

      await runReadStep('image', signal, async () => {
        await this.#dependencies.image.verify({
          image: sourceEvidence.previous,
          password: live.ghcrPassword,
          registryUrl: live.ghcrRegistryUrl,
          repository: sourceEvidence.repository,
          signal,
          username: live.ghcrUsername,
        })
      })
      const application = await runReadStep('application', signal, async () =>
        this.#dependencies.dokploy.getApplication(
          live.dokployApplicationId,
          signal,
        ),
      )
      if (application.sourceType !== 'docker') {
        fail('rollback', 'source_type')
      }
      if (application.dockerImage !== sourceEvidence.target.imageRef) {
        fail('rollback', 'current_drift')
      }

      const snapshot = await runReadStep(
        'deployment_snapshot',
        signal,
        async () =>
          this.#dependencies.dokploy.listDeployments(
            live.dokployApplicationId,
            signal,
          ),
      )
      const snapshotIds = new Set(
        snapshot.map(({ deploymentId }) => deploymentId),
      )
      const title = `frontend:rollback:${sourceEvidence.previous.revision}:${this.#dependencies.clock.nowMs()}`

      await this.#runMutation('update_image', signal, async () => {
        state.mutationStarted = true
        await this.#dependencies.dokploy.updateImage(
          live.dokployApplicationId,
          sourceEvidence.previous.imageRef,
          signal,
        )
      })
      await this.#runMutation('deploy', signal, async () => {
        await this.#dependencies.dokploy.deploy({
          applicationId: live.dokployApplicationId,
          description: `Frontend rollback for revision ${sourceEvidence.previous.revision}`,
          signal,
          title,
        })
      })

      const poll = await this.#pollDeployment(
        live.dokployApplicationId,
        snapshotIds,
        title,
        signal,
        state,
      )
      const smoke = await this.#runMutation('hosted_smoke', signal, async () =>
        this.#dependencies.smoke.verify(
          sourceEvidence.publicBaseUrl,
          sourceEvidence.smokePaths,
          signal,
        ),
      )
      const evidence = freezeEvidence({
        applicationId: live.dokployApplicationId,
        deploymentId: poll.deploymentId,
        environment: sourceEvidence.environment,
        finishedAt: new Date(this.#dependencies.clock.nowMs()).toISOString(),
        operation: 'rollback',
        outcome: 'succeeded',
        previous: sourceEvidence.target,
        publicBaseUrl: sourceEvidence.publicBaseUrl,
        repository: sourceEvidence.repository,
        schemaVersion: 1,
        smoke,
        smokePaths: sourceEvidence.smokePaths,
        startedAt: new Date(startedAtMs).toISOString(),
        target: sourceEvidence.previous,
        terminalStatus: poll.terminalStatus,
        workflowRunUrl: null,
      })

      return await this.#runMutation('evidence', signal, async () =>
        this.#dependencies.evidence.write(evidenceDirectory, evidence),
      )
    } catch (error) {
      const failure =
        error instanceof DeploymentExecutionError
          ? error
          : new DeploymentExecutionError('operation', 'failed')
      if (
        failure.step === 'evidence' ||
        !sourceValidated ||
        rollbackTarget === null
      ) {
        throw failure
      }

      const evidence = freezeEvidence({
        applicationId: live.dokployApplicationId,
        ...(state.deploymentId === undefined
          ? {}
          : { deploymentId: state.deploymentId }),
        environment: sourceEvidence.environment,
        failedStep: failure.step,
        finishedAt: new Date(this.#dependencies.clock.nowMs()).toISOString(),
        operation: 'rollback',
        outcome: this.#failureOutcome(failure, state),
        previous: sourceEvidence.target,
        publicBaseUrl: sourceEvidence.publicBaseUrl,
        repository: sourceEvidence.repository,
        schemaVersion: 1,
        smokePaths: sourceEvidence.smokePaths,
        startedAt: new Date(startedAtMs).toISOString(),
        target: rollbackTarget,
        ...(state.terminalStatus === undefined
          ? {}
          : { terminalStatus: state.terminalStatus }),
        workflowRunUrl: null,
      })

      try {
        await this.#dependencies.evidence.write(evidenceDirectory, evidence)
      } catch {
        fail('evidence', 'failed')
      }
      throw failure
    }
  }

  async #apply(
    operation: Exclude<DeploymentOperation, 'rollback'>,
    input: DeploymentOperationInput,
  ): Promise<string> {
    const startedAtMs = this.#dependencies.clock.nowMs()
    const state: OperationState = { mutationStarted: false }
    let previous = input.manifest.expectedCurrent

    try {
      const preflight = await runDeploymentPreflight(input, this.#dependencies)
      previous = preflight.previous
      const snapshot = await runReadStep(
        'deployment_snapshot',
        input.signal,
        async () =>
          this.#dependencies.dokploy.listDeployments(
            input.live.dokployApplicationId,
            input.signal,
          ),
      )
      const snapshotIds = new Set(
        snapshot.map(({ deploymentId }) => deploymentId),
      )
      const title = `frontend:${operation}:${input.manifest.candidate.revision}:${this.#dependencies.clock.nowMs()}`

      await this.#runMutation('update_image', input.signal, async () => {
        state.mutationStarted = true
        await this.#dependencies.dokploy.updateImage(
          input.live.dokployApplicationId,
          input.manifest.candidate.imageRef,
          input.signal,
        )
      })
      await this.#runMutation('deploy', input.signal, async () => {
        await this.#dependencies.dokploy.deploy({
          applicationId: input.live.dokployApplicationId,
          description: `Frontend ${operation} for revision ${input.manifest.candidate.revision}`,
          signal: input.signal,
          title,
        })
      })

      const poll = await this.#pollDeployment(
        input.live.dokployApplicationId,
        snapshotIds,
        title,
        input.signal,
        state,
      )
      const smoke = await this.#runMutation(
        'hosted_smoke',
        input.signal,
        async () =>
          this.#dependencies.smoke.verify(
            input.manifest.publicBaseUrl,
            input.manifest.smokePaths,
            input.signal,
          ),
      )
      const evidence = freezeEvidence({
        applicationId: input.live.dokployApplicationId,
        deploymentId: poll.deploymentId,
        environment: input.manifest.environment,
        finishedAt: new Date(this.#dependencies.clock.nowMs()).toISOString(),
        operation,
        outcome: 'succeeded',
        previous,
        publicBaseUrl: input.manifest.publicBaseUrl,
        repository: input.manifest.repository,
        schemaVersion: 1,
        smoke,
        smokePaths: input.manifest.smokePaths,
        startedAt: new Date(startedAtMs).toISOString(),
        target: input.manifest.candidate,
        terminalStatus: poll.terminalStatus,
        workflowRunUrl: input.manifest.workflowRunUrl,
      })

      return await this.#runMutation('evidence', input.signal, async () =>
        this.#dependencies.evidence.write(input.evidenceDirectory, evidence),
      )
    } catch (error) {
      const failure =
        error instanceof DeploymentExecutionError
          ? error
          : new DeploymentExecutionError('operation', 'failed')
      if (failure.step === 'evidence') {
        throw failure
      }

      const evidence = freezeEvidence({
        applicationId: input.live.dokployApplicationId,
        ...(state.deploymentId === undefined
          ? {}
          : { deploymentId: state.deploymentId }),
        environment: input.manifest.environment,
        failedStep: failure.step,
        finishedAt: new Date(this.#dependencies.clock.nowMs()).toISOString(),
        operation,
        outcome: this.#failureOutcome(failure, state),
        previous,
        publicBaseUrl: input.manifest.publicBaseUrl,
        repository: input.manifest.repository,
        schemaVersion: 1,
        smokePaths: input.manifest.smokePaths,
        startedAt: new Date(startedAtMs).toISOString(),
        target: input.manifest.candidate,
        ...(state.terminalStatus === undefined
          ? {}
          : { terminalStatus: state.terminalStatus }),
        workflowRunUrl: input.manifest.workflowRunUrl,
      })

      try {
        await this.#dependencies.evidence.write(
          input.evidenceDirectory,
          evidence,
        )
      } catch {
        fail('evidence', 'failed')
      }
      throw failure
    }
  }

  #failureOutcome(
    failure: DeploymentExecutionError,
    state: OperationState,
  ): 'failed' | 'indeterminate' {
    if (!state.mutationStarted) {
      return 'failed'
    }
    if (failure.category === 'aborted') {
      return 'indeterminate'
    }
    if (failure.step === 'hosted_smoke') {
      return 'failed'
    }
    if (
      state.terminalStatus === 'error' ||
      state.terminalStatus === 'cancelled'
    ) {
      return 'failed'
    }
    return 'indeterminate'
  }

  async #runMutation<T>(
    step: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    throwIfAborted(signal, step)
    try {
      return await operation()
    } catch (error) {
      if (error instanceof DeploymentExecutionError) {
        throw error
      }
      if (signal?.aborted === true) {
        fail(step, 'aborted')
      }
      fail(step, 'failed')
    }
  }

  async #pollDeployment(
    applicationId: string,
    snapshotIds: ReadonlySet<string>,
    title: string,
    signal: AbortSignal | undefined,
    state: OperationState,
  ): Promise<PollResult> {
    const deadlineMs = this.#dependencies.clock.nowMs() + pollDeadlineMs
    let deploymentId: string | undefined

    while (true) {
      const deployments = await runReadStep(
        'deployment_poll',
        signal,
        async () =>
          this.#dependencies.dokploy.listDeployments(applicationId, signal),
      )
      let record: DokployDeploymentRecord | undefined

      if (deploymentId === undefined) {
        const candidates = deployments.filter(
          (deployment) =>
            !snapshotIds.has(deployment.deploymentId) &&
            deployment.title === title,
        )
        if (candidates.length > 1) {
          fail('deployment_identification', 'ambiguous')
        }
        record = candidates[0]
        deploymentId = record?.deploymentId
        state.deploymentId = deploymentId
      } else {
        const locked = deployments.filter(
          (deployment) => deployment.deploymentId === deploymentId,
        )
        if (locked.length !== 1) {
          fail('deployment_poll', 'locked_record')
        }
        record = locked[0]
      }

      if (record !== undefined) {
        if (record.status === 'done') {
          state.terminalStatus = 'done'
          return { deploymentId: record.deploymentId, terminalStatus: 'done' }
        }
        if (record.status !== 'running') {
          state.terminalStatus = record.status
          fail('deployment_poll', 'terminal_status')
        }
      }

      if (this.#dependencies.clock.nowMs() + pollIntervalMs > deadlineMs) {
        fail('deployment_identification', 'timeout')
      }
      await this.#runMutation('deployment_poll', signal, async () =>
        this.#dependencies.clock.sleep(pollIntervalMs, signal),
      )
    }
  }
}
