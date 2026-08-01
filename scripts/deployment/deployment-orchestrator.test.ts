// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  DeploymentExecutionError,
  FrontendDeploymentOrchestrator,
  runDeploymentPreflight,
  type DeploymentOrchestratorDependencies,
} from './deployment-orchestrator.ts'
import type { DeploymentLiveEnvironment } from './live-environment.ts'
import {
  parseDeploymentManifest,
  type FrontendDeploymentManifest,
} from './manifest.ts'
import type {
  DokployApplication,
  DokployDeploymentRecord,
  FrontendDeploymentEvidence,
  HostedSmokeResult,
} from './ports.ts'

const applicationId = 'app_123'
const candidateImage = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const currentImage = 'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64)
const candidateRevision = '1'.repeat(40)
const currentRevision = '2'.repeat(40)
const privateSecrets = [
  'dokploy-private-key',
  'github-private-token',
  'ghcr-private-password',
] as const

const live: DeploymentLiveEnvironment = Object.freeze({
  dokployApiKey: privateSecrets[0],
  dokployApplicationId: applicationId,
  dokployBaseUrl: 'https://dokploy.example.test',
  ghcrPassword: privateSecrets[2],
  ghcrRegistryUrl: 'https://ghcr.io',
  ghcrUsername: 'package-reader',
  githubToken: privateSecrets[1],
})

function manifest(mode: 'bootstrap' | 'promotion'): FrontendDeploymentManifest {
  return parseDeploymentManifest({
    candidate: {
      imageRef: candidateImage,
      revision: candidateRevision,
    },
    environment: 'stage',
    integrationBranch: 'stage',
    expectedCurrent:
      mode === 'bootstrap'
        ? null
        : {
            imageRef: currentImage,
            revision: currentRevision,
          },
    mode,
    publicBaseUrl: 'https://stage.example.test',
    repository: 'example/react-starter',
    schemaVersion: 1,
    smokePaths: ['/approval-requests/example'],
    workflowRunUrl:
      'https://github.com/example/react-starter/actions/runs/123/attempts/1',
  })
}

interface PreflightHarnessOptions {
  readonly application?: DokployApplication
  readonly deployments?: readonly DokployDeploymentRecord[]
}

function preflightHarness(options: PreflightHarnessOptions = {}): {
  readonly calls: string[]
  readonly dependencies: Pick<
    DeploymentOrchestratorDependencies,
    'publication' | 'image' | 'dokploy'
  >
  readonly deploy: ReturnType<typeof vi.fn>
  readonly imageVerify: ReturnType<typeof vi.fn>
  readonly updateImage: ReturnType<typeof vi.fn>
} {
  const calls: string[] = []
  const application = options.application ?? {
    applicationId,
    dockerImage: currentImage,
    sourceType: 'docker',
  }
  const deployments = options.deployments ?? [
    {
      deploymentId: 'deployment_previous',
      status: 'done',
      title: 'previous deployment',
    },
  ]
  const updateImage = vi.fn(async () => undefined)
  const deploy = vi.fn(async () => undefined)
  const imageVerify = vi.fn(async () => {
    calls.push('image')
  })

  return {
    calls,
    deploy,
    imageVerify,
    updateImage,
    dependencies: {
      publication: {
        verify: async (input) => {
          calls.push('publication')
          expect(input).toEqual({
            integrationBranch: 'stage',
            repository: 'example/react-starter',
            revision: candidateRevision,
            signal: undefined,
            token: privateSecrets[1],
            workflowRunUrl:
              'https://github.com/example/react-starter/actions/runs/123/attempts/1',
          })
        },
      },
      image: {
        verify: imageVerify,
      },
      dokploy: {
        deploy,
        getApplication: async (receivedApplicationId) => {
          calls.push('application')
          expect(receivedApplicationId).toBe(applicationId)
          return application
        },
        listDeployments: async (receivedApplicationId) => {
          calls.push('deployments')
          expect(receivedApplicationId).toBe(applicationId)
          return deployments
        },
        updateImage,
      },
    },
  }
}

async function expectExecutionFailure(
  promise: Promise<unknown>,
): Promise<DeploymentExecutionError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentExecutionError)
    const rendered = String(error)
    const serialized = JSON.stringify(error)
    for (const secret of privateSecrets) {
      expect(rendered).not.toContain(secret)
      expect(serialized).not.toContain(secret)
    }
    return error as DeploymentExecutionError
  }

  throw new Error('Expected DeploymentExecutionError')
}

describe('runDeploymentPreflight', () => {
  it('verifies publication, image and Dokploy state in order without mutation', async () => {
    const harness = preflightHarness()

    const result = await runDeploymentPreflight(
      { live, manifest: manifest('promotion') },
      harness.dependencies,
    )

    expect(harness.calls).toEqual([
      'publication',
      'image',
      'image',
      'application',
      'deployments',
    ])
    expect(harness.imageVerify).toHaveBeenNthCalledWith(1, {
      image: {
        imageRef: candidateImage,
        revision: candidateRevision,
      },
      password: privateSecrets[2],
      registryUrl: 'https://ghcr.io',
      repository: 'example/react-starter',
      signal: undefined,
      username: 'package-reader',
      workflowRunUrl:
        'https://github.com/example/react-starter/actions/runs/123/attempts/1',
    })
    expect(harness.imageVerify).toHaveBeenNthCalledWith(2, {
      image: {
        imageRef: currentImage,
        revision: currentRevision,
      },
      password: privateSecrets[2],
      registryUrl: 'https://ghcr.io',
      repository: 'example/react-starter',
      signal: undefined,
      username: 'package-reader',
    })
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expect(result).toEqual({
      application: {
        applicationId,
        dockerImage: currentImage,
        sourceType: 'docker',
      },
      candidate: {
        imageRef: candidateImage,
        revision: candidateRevision,
      },
      mode: 'promotion',
      previous: {
        imageRef: currentImage,
        revision: currentRevision,
      },
      successfulDeploymentCount: 1,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.application)).toBe(true)
    expect(Object.isFrozen(result.candidate)).toBe(true)
    expect(Object.isFrozen(result.previous)).toBe(true)
  })

  it('accepts bootstrap only for an unused docker application', async () => {
    const harness = preflightHarness({
      application: {
        applicationId,
        dockerImage: null,
        sourceType: 'docker',
      },
      deployments: [
        {
          deploymentId: 'deployment_failed',
          status: 'error',
          title: 'failed setup',
        },
      ],
    })

    await expect(
      runDeploymentPreflight(
        { live, manifest: manifest('bootstrap') },
        harness.dependencies,
      ),
    ).resolves.toMatchObject({
      mode: 'bootstrap',
      previous: null,
      successfulDeploymentCount: 0,
    })
  })

  it.each([
    [
      'non-docker source',
      { applicationId, dockerImage: currentImage, sourceType: 'git' },
      [{ deploymentId: 'previous', status: 'done', title: 'previous' }],
      'source_type',
    ],
    [
      'mutable configured image',
      {
        applicationId,
        dockerImage: 'ghcr.io/example/react-starter:stage',
        sourceType: 'docker',
      },
      [{ deploymentId: 'previous', status: 'done', title: 'previous' }],
      'configured_image',
    ],
    [
      'current image drift',
      {
        applicationId,
        dockerImage: 'ghcr.io/example/react-starter@sha256:' + 'c'.repeat(64),
        sourceType: 'docker',
      },
      [{ deploymentId: 'previous', status: 'done', title: 'previous' }],
      'current_drift',
    ],
    [
      'candidate already configured',
      { applicationId, dockerImage: candidateImage, sourceType: 'docker' },
      [{ deploymentId: 'previous', status: 'done', title: 'previous' }],
      'candidate_configured',
    ],
    [
      'no successful deployment history',
      { applicationId, dockerImage: currentImage, sourceType: 'docker' },
      [{ deploymentId: 'failed', status: 'error', title: 'failed' }],
      'successful_history',
    ],
    [
      'unknown deployment status',
      { applicationId, dockerImage: currentImage, sourceType: 'docker' },
      [{ deploymentId: 'unknown', status: 'queued', title: 'unknown' }],
      'deployment_status',
    ],
    [
      'an active deployment',
      { applicationId, dockerImage: currentImage, sourceType: 'docker' },
      [
        { deploymentId: 'previous', status: 'done', title: 'previous' },
        { deploymentId: 'active', status: 'running', title: 'active' },
      ],
      'deployment_active',
    ],
  ] as const)(
    'rejects promotion with %s',
    async (_name, application, deployments, category) => {
      const harness = preflightHarness({ application, deployments })

      const error = await expectExecutionFailure(
        runDeploymentPreflight(
          { live, manifest: manifest('promotion') },
          harness.dependencies,
        ),
      )

      expect(error).toMatchObject({ category, step: 'preflight' })
      expect(harness.updateImage).not.toHaveBeenCalled()
      expect(harness.deploy).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      'an existing image',
      { applicationId, dockerImage: currentImage, sourceType: 'docker' },
      [],
      'bootstrap_image',
    ],
    [
      'successful deployment history',
      { applicationId, dockerImage: null, sourceType: 'docker' },
      [{ deploymentId: 'previous', status: 'done', title: 'previous' }],
      'bootstrap_history',
    ],
    [
      'an active deployment',
      { applicationId, dockerImage: null, sourceType: 'docker' },
      [{ deploymentId: 'active', status: 'running', title: 'active' }],
      'deployment_active',
    ],
  ] as const)(
    'rejects bootstrap with %s',
    async (_name, application, deployments, category) => {
      const harness = preflightHarness({ application, deployments })

      const error = await expectExecutionFailure(
        runDeploymentPreflight(
          { live, manifest: manifest('bootstrap') },
          harness.dependencies,
        ),
      )

      expect(error).toMatchObject({ category, step: 'preflight' })
      expect(harness.updateImage).not.toHaveBeenCalled()
      expect(harness.deploy).not.toHaveBeenCalled()
    },
  )
})

interface OperationHarness {
  readonly calls: string[]
  readonly dependencies: DeploymentOrchestratorDependencies
  readonly deploy: ReturnType<typeof vi.fn>
  readonly evidenceWrites: FrontendDeploymentEvidence[]
  readonly evidenceAttemptCount: () => number
  readonly leaseAcquire: ReturnType<typeof vi.fn>
  readonly leaseRelease: ReturnType<typeof vi.fn>
  readonly sleeps: number[]
  readonly smoke: ReturnType<typeof vi.fn>
  readonly updateImage: ReturnType<typeof vi.fn>
}

interface OperationHarnessOptions {
  readonly abortAfterSnapshot?: AbortController
  readonly abortDuringSmoke?: AbortController
  readonly abortOnFirstSleep?: AbortController
  readonly evidenceFailure?: string
  readonly pollResponses?: readonly (readonly DokployDeploymentRecord[])[]
  readonly repeatLastDeploymentResponse?: boolean
  readonly smokeFailure?: string
  readonly smokeRevision?: string
  readonly lockedApplication?: DokployApplication
}

function operationHarness(
  mode: 'bootstrap' | 'promotion',
  options: OperationHarnessOptions = {},
): OperationHarness {
  const calls: string[] = []
  const evidenceWrites: FrontendDeploymentEvidence[] = []
  const sleeps: number[] = []
  const oldDeployments: DokployDeploymentRecord[] =
    mode === 'bootstrap'
      ? []
      : [
          {
            deploymentId: 'deployment_previous',
            status: 'done',
            title: 'previous deployment',
          },
        ]
  const title = `frontend:${mode === 'bootstrap' ? 'bootstrap' : 'promote'}:${candidateRevision}:1735689600000`
  const targetRunning: DokployDeploymentRecord = {
    deploymentId: 'deployment_target',
    status: 'running',
    title,
  }
  const targetDone: DokployDeploymentRecord = {
    ...targetRunning,
    status: 'done',
  }
  const defaultPollResponses: (readonly DokployDeploymentRecord[])[] = [
    oldDeployments,
    [...oldDeployments, targetRunning],
    [...oldDeployments, targetDone],
  ]
  const deploymentResponses: (readonly DokployDeploymentRecord[])[] = [
    oldDeployments,
    oldDeployments,
    ...(options.pollResponses ?? defaultPollResponses),
  ]
  let deploymentRead = 0
  let evidenceAttemptCount = 0
  let nowMs = Date.UTC(2025, 0, 1)
  const updateImage = vi.fn(async () => {
    calls.push('update')
  })
  const deploy = vi.fn(async () => {
    calls.push('deploy')
  })
  const lease = Object.freeze({
    ref: 'refs/tags/frontend-deployment-lock/stage-fe0275c5a52b6627',
    repository: 'example/react-starter',
    revision: candidateRevision,
  })
  const leaseAcquire = vi.fn(async () => {
    calls.push('lease_acquire')
    return lease
  })
  const leaseRelease = vi.fn(async () => {
    calls.push('lease_release')
  })
  const smokeResult: HostedSmokeResult = Object.freeze({
    apiProbeStatus: 404,
    checkedPaths: Object.freeze([
      '/_frontend/health',
      '/_frontend/identity',
      '/',
      '/login',
      '/approval-requests/example',
      '/v1/__frontend_deployment_probe__',
    ]),
    frontendRevision: options.smokeRevision ?? candidateRevision,
  })
  const smoke = vi.fn(async () => {
    calls.push('smoke')
    if (options.abortDuringSmoke !== undefined) {
      options.abortDuringSmoke.abort('private-smoke-abort')
      options.abortDuringSmoke.signal.throwIfAborted()
    }
    if (options.smokeFailure !== undefined) {
      throw new Error(options.smokeFailure)
    }
    return smokeResult
  })

  return {
    calls,
    deploy,
    evidenceAttemptCount: () => evidenceAttemptCount,
    evidenceWrites,
    leaseAcquire,
    leaseRelease,
    sleeps,
    smoke,
    updateImage,
    dependencies: {
      publication: {
        verify: async () => {
          calls.push('publication')
        },
      },
      image: {
        verify: async () => {
          calls.push('image')
        },
      },
      lease: {
        acquire: leaseAcquire,
        release: leaseRelease,
      },
      dokploy: {
        deploy,
        getApplication: async () => {
          calls.push('application')
          const defaultApplication = {
            applicationId,
            dockerImage: mode === 'bootstrap' ? null : currentImage,
            sourceType: 'docker',
          }
          return calls.filter((call) => call === 'application').length === 1
            ? defaultApplication
            : (options.lockedApplication ?? defaultApplication)
        },
        listDeployments: async () => {
          calls.push(`deployments:${deploymentRead}`)
          const response = deploymentResponses[deploymentRead]
          deploymentRead += 1
          if (response === undefined) {
            if (options.repeatLastDeploymentResponse === true) {
              return deploymentResponses.at(-1) ?? oldDeployments
            }
            throw new Error('Unexpected deployment read')
          }
          if (
            deploymentRead === 2 &&
            options.abortAfterSnapshot !== undefined
          ) {
            options.abortAfterSnapshot.abort('private-before-update-abort')
          }
          return response
        },
        updateImage,
      },
      smoke: { verify: smoke },
      clock: {
        nowMs: () => nowMs,
        sleep: async (milliseconds, signal) => {
          signal?.throwIfAborted()
          calls.push('sleep')
          sleeps.push(milliseconds)
          nowMs += milliseconds
          if (options.abortOnFirstSleep !== undefined) {
            options.abortOnFirstSleep.abort('private-abort-reason')
            options.abortOnFirstSleep.signal.throwIfAborted()
          }
        },
      },
      evidence: {
        write: async (_directory, evidence) => {
          calls.push('evidence')
          evidenceAttemptCount += 1
          if (options.evidenceFailure !== undefined) {
            throw new Error(options.evidenceFailure)
          }
          evidenceWrites.push(evidence)
          return '/safe/evidence.json'
        },
      },
    },
  }
}

describe('FrontendDeploymentOrchestrator successful apply', () => {
  it.each(['bootstrap', 'promotion'] as const)(
    'runs fresh %s preflight, locks one deployment and records success',
    async (mode) => {
      const harness = operationHarness(mode)
      const releaseManifest = manifest(mode)
      const orchestrator = new FrontendDeploymentOrchestrator(
        harness.dependencies,
      )

      const evidencePath = await orchestrator[
        mode === 'bootstrap' ? 'bootstrap' : 'promote'
      ]({
        evidenceDirectory: '/safe',
        live,
        manifest: releaseManifest,
      })

      expect(evidencePath).toBe('/safe/evidence.json')
      expect(harness.calls).toEqual([
        'publication',
        'image',
        ...(mode === 'promotion' ? ['image'] : []),
        'application',
        'deployments:0',
        'lease_acquire',
        'application',
        'deployments:1',
        'update',
        'deploy',
        'deployments:2',
        'sleep',
        'deployments:3',
        'sleep',
        'deployments:4',
        'smoke',
        'evidence',
        'lease_release',
      ])
      expect(harness.sleeps).toEqual([5_000, 5_000])
      expect(harness.updateImage).toHaveBeenCalledOnce()
      expect(harness.updateImage).toHaveBeenCalledWith(
        applicationId,
        candidateImage,
        undefined,
      )
      expect(harness.deploy).toHaveBeenCalledOnce()
      expect(harness.deploy).toHaveBeenCalledWith({
        applicationId,
        description: `Frontend ${mode === 'bootstrap' ? 'bootstrap' : 'promote'} for revision ${candidateRevision}`,
        signal: undefined,
        title: `frontend:${mode === 'bootstrap' ? 'bootstrap' : 'promote'}:${candidateRevision}:1735689600000`,
      })
      expect(harness.smoke).toHaveBeenCalledWith(
        releaseManifest.publicBaseUrl,
        releaseManifest.smokePaths,
        {
          image: releaseManifest.candidate,
          repository: releaseManifest.repository,
        },
        undefined,
      )
      expect(harness.leaseAcquire).toHaveBeenCalledWith({
        applicationId,
        environment: 'stage',
        repository: 'example/react-starter',
        revision: candidateRevision,
        signal: undefined,
        token: privateSecrets[1],
      })
      expect(harness.leaseRelease).toHaveBeenCalledWith({
        lease: expect.objectContaining({ revision: candidateRevision }),
        token: privateSecrets[1],
      })
      expect(harness.evidenceWrites).toEqual([
        {
          applicationId,
          deploymentId: 'deployment_target',
          environment: 'stage',
          finishedAt: '2025-01-01T00:00:10.000Z',
          operation: mode === 'bootstrap' ? 'bootstrap' : 'promote',
          outcome: 'succeeded',
          previous:
            mode === 'bootstrap'
              ? null
              : {
                  imageRef: currentImage,
                  revision: currentRevision,
                },
          publicBaseUrl: releaseManifest.publicBaseUrl,
          repository: releaseManifest.repository,
          schemaVersion: 1,
          smoke: {
            apiProbeStatus: 404,
            checkedPaths: [
              '/_frontend/health',
              '/_frontend/identity',
              '/',
              '/login',
              '/approval-requests/example',
              '/v1/__frontend_deployment_probe__',
            ],
            frontendRevision: candidateRevision,
          },
          smokePaths: releaseManifest.smokePaths,
          startedAt: '2025-01-01T00:00:00.000Z',
          target: {
            imageRef: candidateImage,
            revision: candidateRevision,
          },
          terminalStatus: 'done',
          workflowRunUrl: releaseManifest.workflowRunUrl,
        },
      ])
    },
  )
})

const previousDeployment: DokployDeploymentRecord = {
  deploymentId: 'deployment_previous',
  status: 'done',
  title: 'previous deployment',
}
const promotionTitle = `frontend:promote:${candidateRevision}:1735689600000`

function targetDeployment(
  status: string,
  deploymentId = 'deployment_target',
): DokployDeploymentRecord {
  return { deploymentId, status, title: promotionTitle }
}

async function runPromotion(
  harness: OperationHarness,
  signal?: AbortSignal,
): Promise<string> {
  return new FrontendDeploymentOrchestrator(harness.dependencies).promote({
    evidenceDirectory: '/safe',
    live,
    manifest: manifest('promotion'),
    signal,
  })
}

function expectFailedEvidence(
  harness: OperationHarness,
  expected: {
    readonly deploymentId?: string
    readonly failedStep: string
    readonly outcome: 'failed' | 'indeterminate'
    readonly terminalStatus?: string
  },
): void {
  expect(harness.evidenceWrites).toHaveLength(1)
  expect(harness.evidenceWrites[0]).toMatchObject({
    applicationId,
    environment: 'stage',
    operation: 'promote',
    previous: {
      imageRef: currentImage,
      revision: currentRevision,
    },
    repository: 'example/react-starter',
    target: {
      imageRef: candidateImage,
      revision: candidateRevision,
    },
    workflowRunUrl:
      'https://github.com/example/react-starter/actions/runs/123/attempts/1',
    ...expected,
  })
  expect(harness.updateImage.mock.calls).toHaveLength(1)
  expect(harness.updateImage.mock.calls[0]?.[1]).toBe(candidateImage)
  expect(
    harness.updateImage.mock.calls.some((call) => call[1] === currentImage),
  ).toBe(false)
}

describe('FrontendDeploymentOrchestrator failure evidence', () => {
  it('rechecks the configured image under the lease before mutation', async () => {
    const harness = operationHarness('promotion', {
      lockedApplication: {
        applicationId,
        dockerImage: 'ghcr.io/example/react-starter@sha256:' + 'c'.repeat(64),
        sourceType: 'docker',
      },
    })

    const error = await expectExecutionFailure(runPromotion(harness))

    expect(error).toMatchObject({
      category: 'current_drift',
      step: 'preflight',
    })
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expect(harness.leaseRelease).toHaveBeenCalledOnce()
    expect(harness.calls.indexOf('lease_acquire')).toBeLessThan(
      harness.calls.lastIndexOf('application'),
    )
    expect(harness.calls.at(-1)).toBe('lease_release')
  })

  it('records abort after snapshot but before update as failed without mutation', async () => {
    const controller = new AbortController()
    const harness = operationHarness('promotion', {
      abortAfterSnapshot: controller,
    })

    const error = await expectExecutionFailure(
      runPromotion(harness, controller.signal),
    )

    expect(error).toMatchObject({ category: 'aborted', step: 'update_image' })
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expect(harness.evidenceWrites).toHaveLength(1)
    expect(harness.evidenceWrites[0]).toMatchObject({
      failedStep: 'update_image',
      outcome: 'failed',
      previous: {
        imageRef: currentImage,
        revision: currentRevision,
      },
      target: {
        imageRef: candidateImage,
        revision: candidateRevision,
      },
    })
  })

  it('records ambiguous new deployments as indeterminate without rollback', async () => {
    const harness = operationHarness('promotion', {
      pollResponses: [
        [
          previousDeployment,
          targetDeployment('running', 'deployment_one'),
          targetDeployment('running', 'deployment_two'),
        ],
      ],
    })

    const error = await expectExecutionFailure(runPromotion(harness))

    expect(error).toMatchObject({
      category: 'ambiguous',
      step: 'deployment_identification',
    })
    expectFailedEvidence(harness, {
      failedStep: 'deployment_identification',
      outcome: 'indeterminate',
    })
  })

  it('records a ten-minute identification timeout as indeterminate', async () => {
    const harness = operationHarness('promotion', {
      pollResponses: [[previousDeployment]],
      repeatLastDeploymentResponse: true,
    })

    const error = await expectExecutionFailure(runPromotion(harness))

    expect(error).toMatchObject({
      category: 'timeout',
      step: 'deployment_identification',
    })
    expect(harness.sleeps).toHaveLength(120)
    expect(harness.sleeps.every((delay) => delay === 5_000)).toBe(true)
    expectFailedEvidence(harness, {
      failedStep: 'deployment_identification',
      outcome: 'indeterminate',
    })
  })

  it.each([
    ['missing', [previousDeployment]],
    [
      'duplicated',
      [
        previousDeployment,
        targetDeployment('running'),
        targetDeployment('running'),
      ],
    ],
  ] as const)(
    'records a %s locked deployment as indeterminate',
    async (_name, laterResponse) => {
      const harness = operationHarness('promotion', {
        pollResponses: [
          [previousDeployment, targetDeployment('running')],
          laterResponse,
        ],
      })

      const error = await expectExecutionFailure(runPromotion(harness))

      expect(error).toMatchObject({
        category: 'locked_record',
        step: 'deployment_poll',
      })
      expectFailedEvidence(harness, {
        deploymentId: 'deployment_target',
        failedStep: 'deployment_poll',
        outcome: 'indeterminate',
      })
    },
  )

  it.each(['error', 'cancelled'] as const)(
    'records terminal %s as a known failed deployment',
    async (status) => {
      const harness = operationHarness('promotion', {
        pollResponses: [[previousDeployment, targetDeployment(status)]],
      })

      const error = await expectExecutionFailure(runPromotion(harness))

      expect(error).toMatchObject({
        category: 'terminal_status',
        step: 'deployment_poll',
      })
      expectFailedEvidence(harness, {
        deploymentId: 'deployment_target',
        failedStep: 'deployment_poll',
        outcome: 'failed',
        terminalStatus: status,
      })
    },
  )

  it('records an unknown deployment status as indeterminate', async () => {
    const harness = operationHarness('promotion', {
      pollResponses: [[previousDeployment, targetDeployment('queued')]],
    })

    const error = await expectExecutionFailure(runPromotion(harness))

    expect(error).toMatchObject({
      category: 'terminal_status',
      step: 'deployment_poll',
    })
    expectFailedEvidence(harness, {
      deploymentId: 'deployment_target',
      failedStep: 'deployment_poll',
      outcome: 'indeterminate',
      terminalStatus: 'queued',
    })
  })

  it('records hosted smoke failure after a done deployment as failed', async () => {
    const privateSmokeFailure = 'private-smoke-response-body'
    const harness = operationHarness('promotion', {
      pollResponses: [[previousDeployment, targetDeployment('done')]],
      smokeFailure: privateSmokeFailure,
    })

    const error = await expectExecutionFailure(runPromotion(harness))

    expect(String(error)).not.toContain(privateSmokeFailure)
    expect(JSON.stringify(error)).not.toContain(privateSmokeFailure)
    expect(error).toMatchObject({ category: 'failed', step: 'hosted_smoke' })
    expectFailedEvidence(harness, {
      deploymentId: 'deployment_target',
      failedStep: 'hosted_smoke',
      outcome: 'failed',
      terminalStatus: 'done',
    })
  })

  it('records abort during hosted smoke as indeterminate', async () => {
    const controller = new AbortController()
    const harness = operationHarness('promotion', {
      abortDuringSmoke: controller,
      pollResponses: [[previousDeployment, targetDeployment('done')]],
    })

    const error = await expectExecutionFailure(
      runPromotion(harness, controller.signal),
    )

    expect(error).toMatchObject({
      category: 'aborted',
      step: 'hosted_smoke',
    })
    expectFailedEvidence(harness, {
      deploymentId: 'deployment_target',
      failedStep: 'hosted_smoke',
      outcome: 'indeterminate',
      terminalStatus: 'done',
    })
  })

  it('returns a redacted evidence failure without recursive writes', async () => {
    const privateEvidenceFailure = 'private-evidence-filesystem-error'
    const harness = operationHarness('promotion', {
      evidenceFailure: privateEvidenceFailure,
      pollResponses: [[previousDeployment, targetDeployment('done')]],
    })

    const error = await expectExecutionFailure(runPromotion(harness))

    expect(error).toMatchObject({ category: 'failed', step: 'evidence' })
    expect(String(error)).not.toContain(privateEvidenceFailure)
    expect(JSON.stringify(error)).not.toContain(privateEvidenceFailure)
    expect(harness.evidenceAttemptCount()).toBe(1)
    expect(harness.evidenceWrites).toHaveLength(0)
    expect(harness.updateImage).toHaveBeenCalledOnce()
  })

  it('records an abort after mutation as indeterminate', async () => {
    const controller = new AbortController()
    const harness = operationHarness('promotion', {
      abortOnFirstSleep: controller,
      pollResponses: [[previousDeployment]],
    })

    const error = await expectExecutionFailure(
      runPromotion(harness, controller.signal),
    )

    expect(error).toMatchObject({
      category: 'aborted',
      step: 'deployment_poll',
    })
    expectFailedEvidence(harness, {
      failedStep: 'deployment_poll',
      outcome: 'indeterminate',
    })
  })
})

describe('FrontendDeploymentOrchestrator rollback boundary', () => {
  function sourceEvidence(): FrontendDeploymentEvidence {
    return {
      applicationId,
      deploymentId: 'deployment_failed',
      environment: 'stage',
      failedStep: 'hosted_smoke',
      finishedAt: '2025-01-01T00:00:10.000Z',
      operation: 'promote',
      outcome: 'failed',
      previous: {
        imageRef: currentImage,
        revision: currentRevision,
      },
      publicBaseUrl: 'https://stage.example.test',
      repository: 'example/react-starter',
      schemaVersion: 1,
      smokePaths: ['/approval-requests/example'],
      startedAt: '2025-01-01T00:00:00.000Z',
      target: {
        imageRef: candidateImage,
        revision: candidateRevision,
      },
      terminalStatus: 'done',
      workflowRunUrl:
        'https://github.com/example/react-starter/actions/runs/123/attempts/1',
    }
  }

  function rollbackHarness(current = candidateImage): OperationHarness {
    const harness = operationHarness('promotion', {
      pollResponses: [
        [previousDeployment, targetDeployment('running')],
        [previousDeployment, targetDeployment('done')],
      ],
      smokeRevision: currentRevision,
    })
    const original = harness.dependencies
    const rollbackTitle = `frontend:rollback:${currentRevision}:1735689600000`
    let deploymentRead = 0
    const rollbackRunning: DokployDeploymentRecord = {
      deploymentId: 'deployment_rollback',
      status: 'running',
      title: rollbackTitle,
    }
    const rollbackDone: DokployDeploymentRecord = {
      ...rollbackRunning,
      status: 'done',
    }
    const responses = [
      [previousDeployment],
      [previousDeployment, rollbackRunning],
      [previousDeployment, rollbackDone],
    ] as const

    return {
      ...harness,
      dependencies: {
        ...original,
        publication: {
          verify: async () => {
            throw new Error('Rollback must not verify a workflow run')
          },
        },
        image: {
          verify: async (input) => {
            harness.calls.push('image')
            expect(input).toEqual({
              image: {
                imageRef: currentImage,
                revision: currentRevision,
              },
              password: privateSecrets[2],
              registryUrl: 'https://ghcr.io',
              repository: 'example/react-starter',
              signal: undefined,
              username: 'package-reader',
            })
          },
        },
        dokploy: {
          ...original.dokploy,
          getApplication: async (receivedApplicationId) => {
            harness.calls.push('application')
            expect(receivedApplicationId).toBe(applicationId)
            return {
              applicationId,
              dockerImage: current,
              sourceType: 'docker',
            }
          },
          listDeployments: async () => {
            harness.calls.push(`deployments:${deploymentRead}`)
            const response = responses[deploymentRead]
            deploymentRead += 1
            if (response === undefined) {
              throw new Error('Unexpected rollback deployment read')
            }
            return response
          },
        },
      },
    }
  }

  it('verifies and explicitly rolls back the failed candidate once', async () => {
    const harness = rollbackHarness()

    const evidencePath = await new FrontendDeploymentOrchestrator(
      harness.dependencies,
    ).rollback(sourceEvidence(), live, '/safe')

    expect(evidencePath).toBe('/safe/evidence.json')
    expect(harness.calls).toEqual([
      'image',
      'lease_acquire',
      'application',
      'deployments:0',
      'update',
      'deploy',
      'deployments:1',
      'sleep',
      'deployments:2',
      'smoke',
      'evidence',
      'lease_release',
    ])
    expect(harness.updateImage).toHaveBeenCalledOnce()
    expect(harness.updateImage).toHaveBeenCalledWith(
      applicationId,
      currentImage,
      undefined,
    )
    expect(harness.deploy).toHaveBeenCalledOnce()
    expect(harness.deploy).toHaveBeenCalledWith({
      applicationId,
      description: `Frontend rollback for revision ${currentRevision}`,
      signal: undefined,
      title: `frontend:rollback:${currentRevision}:1735689600000`,
    })
    expect(harness.smoke).toHaveBeenCalledWith(
      'https://stage.example.test',
      ['/approval-requests/example'],
      {
        image: sourceEvidence().previous,
        repository: 'example/react-starter',
      },
      undefined,
    )
    expect(harness.evidenceWrites).toEqual([
      {
        applicationId,
        deploymentId: 'deployment_rollback',
        environment: 'stage',
        finishedAt: '2025-01-01T00:00:05.000Z',
        operation: 'rollback',
        outcome: 'succeeded',
        previous: {
          imageRef: candidateImage,
          revision: candidateRevision,
        },
        publicBaseUrl: 'https://stage.example.test',
        repository: 'example/react-starter',
        schemaVersion: 1,
        smoke: {
          apiProbeStatus: 404,
          checkedPaths: [
            '/_frontend/health',
            '/_frontend/identity',
            '/',
            '/login',
            '/approval-requests/example',
            '/v1/__frontend_deployment_probe__',
          ],
          frontendRevision: currentRevision,
        },
        smokePaths: ['/approval-requests/example'],
        startedAt: '2025-01-01T00:00:00.000Z',
        target: {
          imageRef: currentImage,
          revision: currentRevision,
        },
        terminalStatus: 'done',
        workflowRunUrl: null,
      },
    ])
  })

  it.each([
    ['bootstrap evidence', { operation: 'bootstrap', previous: null }],
    ['rollback evidence', { operation: 'rollback', workflowRunUrl: null }],
    ['successful evidence', { outcome: 'succeeded', failedStep: undefined }],
    [
      'invalid previous image',
      {
        previous: {
          imageRef: 'ghcr.io/example/react-starter:stage',
          revision: currentRevision,
        },
      },
    ],
    ['another application', { applicationId: 'app_other' }],
  ] as const)(
    'rejects %s before touching a live port',
    async (_name, change) => {
      const harness = rollbackHarness()
      const evidence = {
        ...sourceEvidence(),
        ...change,
      } as FrontendDeploymentEvidence

      const error = await expectExecutionFailure(
        new FrontendDeploymentOrchestrator(harness.dependencies).rollback(
          evidence,
          live,
          '/safe',
        ),
      )

      expect(error).toMatchObject({ step: 'rollback_source' })
      expect(harness.calls).toEqual([])
      expect(harness.updateImage).not.toHaveBeenCalled()
      expect(harness.deploy).not.toHaveBeenCalled()
      expect(harness.evidenceWrites).toHaveLength(0)
    },
  )

  it('rejects current image drift before mutation', async () => {
    const harness = rollbackHarness(
      'ghcr.io/example/react-starter@sha256:' + 'c'.repeat(64),
    )

    const error = await expectExecutionFailure(
      new FrontendDeploymentOrchestrator(harness.dependencies).rollback(
        sourceEvidence(),
        live,
        '/safe',
      ),
    )

    expect(error).toMatchObject({ category: 'current_drift', step: 'rollback' })
    expect(harness.calls).toEqual([
      'image',
      'lease_acquire',
      'application',
      'evidence',
      'lease_release',
    ])
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expect(harness.evidenceWrites[0]).toMatchObject({
      failedStep: 'rollback',
      operation: 'rollback',
      outcome: 'failed',
      previous: sourceEvidence().target,
      target: sourceEvidence().previous,
      workflowRunUrl: null,
    })
  })

  it('rejects an active deployment under the rollback lease', async () => {
    const harness = rollbackHarness()
    const dependencies: DeploymentOrchestratorDependencies = {
      ...harness.dependencies,
      dokploy: {
        ...harness.dependencies.dokploy,
        listDeployments: async () => {
          harness.calls.push('deployments:active')
          return [
            previousDeployment,
            {
              deploymentId: 'deployment_active',
              status: 'running',
              title: 'another operator',
            },
          ]
        },
      },
    }

    const error = await expectExecutionFailure(
      new FrontendDeploymentOrchestrator(dependencies).rollback(
        sourceEvidence(),
        live,
        '/safe',
      ),
    )

    expect(error).toMatchObject({
      category: 'deployment_active',
      step: 'rollback',
    })
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expect(harness.leaseRelease).toHaveBeenCalledOnce()
  })
})
