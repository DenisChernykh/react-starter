// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { runDeploymentCli, type DeploymentCliDependencies } from './cli.ts'
import type { DeploymentLiveEnvironment } from './live-environment.ts'
import {
  parseDeploymentManifest,
  type FrontendDeploymentManifest,
} from './manifest.ts'
import type { DeploymentOrchestratorDependencies } from './deployment-orchestrator.ts'
import type {
  DokployDeploymentRecord,
  FrontendDeploymentEvidence,
} from './ports.ts'

const applicationId = 'app_123'
const candidateImage = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const currentImage = 'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64)
const candidateRevision = '1'.repeat(40)
const currentRevision = '2'.repeat(40)
const privateValues = [
  'private-dokploy-api-key',
  'private-github-token',
  'private-ghcr-password',
  'private-upstream-body',
  'private-query-value',
] as const

const live: DeploymentLiveEnvironment = Object.freeze({
  dokployApiKey: privateValues[0],
  dokployApplicationId: applicationId,
  dokployBaseUrl: 'https://dokploy.example.test',
  ghcrPassword: privateValues[2],
  ghcrRegistryUrl: 'https://ghcr.io',
  ghcrUsername: 'package-reader',
  githubToken: privateValues[1],
})

function manifest(mode: 'bootstrap' | 'promotion'): FrontendDeploymentManifest {
  return parseDeploymentManifest({
    candidate: { imageRef: candidateImage, revision: candidateRevision },
    environment: 'stage',
    expectedCurrent:
      mode === 'bootstrap'
        ? null
        : { imageRef: currentImage, revision: currentRevision },
    mode,
    publicBaseUrl: 'https://stage.example.test',
    repository: 'example/react-starter',
    schemaVersion: 1,
    smokePaths: ['/approval-requests/example'],
    workflowRunUrl:
      'https://github.com/example/react-starter/actions/runs/123/attempts/1',
  })
}

function failedPromotionEvidence(): FrontendDeploymentEvidence {
  return {
    applicationId,
    deploymentId: 'deployment_failed',
    environment: 'stage',
    failedStep: 'hosted_smoke',
    finishedAt: '2025-01-01T00:00:10.000Z',
    operation: 'promote',
    outcome: 'failed',
    previous: { imageRef: currentImage, revision: currentRevision },
    publicBaseUrl: 'https://stage.example.test',
    repository: 'example/react-starter',
    schemaVersion: 1,
    smokePaths: ['/approval-requests/example'],
    startedAt: '2025-01-01T00:00:00.000Z',
    target: { imageRef: candidateImage, revision: candidateRevision },
    terminalStatus: 'done',
    workflowRunUrl:
      'https://github.com/example/react-starter/actions/runs/123/attempts/1',
  }
}

interface CliHarness {
  readonly createAdapters: ReturnType<typeof vi.fn>
  readonly dependencies: Partial<DeploymentCliDependencies>
  readonly deploy: ReturnType<typeof vi.fn>
  readonly readEvidence: ReturnType<typeof vi.fn>
  readonly readManifest: ReturnType<typeof vi.fn>
  readonly stderr: string[]
  readonly stdout: string[]
  readonly updateImage: ReturnType<typeof vi.fn>
}

function cliHarness(
  command: 'preflight' | 'bootstrap' | 'promote' | 'rollback',
  releaseManifest = manifest(
    command === 'bootstrap' ? 'bootstrap' : 'promotion',
  ),
): CliHarness {
  const stdout: string[] = []
  const stderr: string[] = []
  const updateImage = vi.fn(async () => undefined)
  const deploy = vi.fn(async () => undefined)
  const readManifest = vi.fn(async () => releaseManifest)
  const readEvidence = vi.fn(async () => failedPromotionEvidence())
  let nowMs = Date.UTC(2025, 0, 1)
  let deploymentRead = 0
  const operation = command === 'rollback' ? 'rollback' : command
  const revision = command === 'rollback' ? currentRevision : candidateRevision
  const title = `frontend:${operation}:${revision}:1735689600000`
  const oldDeployment: DokployDeploymentRecord = {
    deploymentId: 'deployment_previous',
    status: 'done',
    title: 'previous',
  }
  const targetDeployment: DokployDeploymentRecord = {
    deploymentId: 'deployment_target',
    status: 'done',
    title,
  }
  const deployments =
    command === 'bootstrap'
      ? [[], [], [targetDeployment]]
      : [[oldDeployment], [oldDeployment], [oldDeployment, targetDeployment]]

  const adapters: DeploymentOrchestratorDependencies = {
    clock: {
      nowMs: () => nowMs,
      sleep: async (milliseconds) => {
        nowMs += milliseconds
      },
    },
    dokploy: {
      deploy,
      getApplication: async () => ({
        applicationId,
        dockerImage:
          command === 'bootstrap'
            ? null
            : command === 'rollback'
              ? candidateImage
              : currentImage,
        sourceType: 'docker',
      }),
      listDeployments: async () => {
        const response = deployments[deploymentRead]
        deploymentRead += 1
        if (response === undefined) {
          throw new Error('Unexpected deployment read')
        }
        return response
      },
      updateImage,
    },
    evidence: {
      write: async () => '/safe/evidence.json',
    },
    image: { verify: async () => undefined },
    publication: { verify: async () => undefined },
    smoke: {
      verify: async () => ({
        apiProbeStatus: 404,
        checkedPaths: ['/', '/login', '/approval-requests/example'],
      }),
    },
  }
  const createAdapters = vi.fn(() => adapters)

  return {
    createAdapters,
    deploy,
    readEvidence,
    readManifest,
    stderr,
    stdout,
    updateImage,
    dependencies: {
      createAdapters,
      parseLiveEnvironment: vi.fn(() => live),
      readEvidence,
      readManifest,
      writeStderr: (line) => stderr.push(line),
      writeStdout: (line) => stdout.push(line),
    },
  }
}

function expectNoPrivateOutput(harness: CliHarness): void {
  const output = JSON.stringify([harness.stdout, harness.stderr])
  for (const privateValue of privateValues) {
    expect(output).not.toContain(privateValue)
  }
}

describe('runDeploymentCli', () => {
  it('runs read-only preflight through parsed manifest and environment', async () => {
    const harness = cliHarness('preflight')

    const exitCode = await runDeploymentCli(
      ['preflight', '--manifest', '/safe/manifest.json'],
      {},
      harness.dependencies,
    )

    expect(exitCode).toBe(0)
    expect(harness.readManifest).toHaveBeenCalledWith('/safe/manifest.json')
    expect(harness.createAdapters).toHaveBeenCalledWith(live)
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expect(harness.stderr).toEqual([])
    expect(harness.stdout.map((line) => JSON.parse(line))).toEqual([
      {
        environment: 'stage',
        mode: 'promotion',
        ok: true,
        operation: 'preflight',
        revision: '111111111111',
      },
    ])
    expectNoPrivateOutput(harness)
  })

  it.each([
    ['bootstrap', 'promotion'],
    ['promote', 'bootstrap'],
  ] as const)(
    'refuses %s with a %s manifest before mutation',
    async (command, mode) => {
      const harness = cliHarness(command, manifest(mode))

      const exitCode = await runDeploymentCli(
        [command, '--manifest', '/safe/manifest.json', '--apply'],
        {},
        harness.dependencies,
      )

      expect(exitCode).toBe(1)
      expect(harness.updateImage).not.toHaveBeenCalled()
      expect(harness.deploy).not.toHaveBeenCalled()
      expect(harness.stdout).toEqual([])
      expect(harness.stderr).toHaveLength(1)
      expectNoPrivateOutput(harness)
    },
  )

  it('rejects missing apply before reading inputs or composing adapters', async () => {
    const harness = cliHarness('promote')

    const exitCode = await runDeploymentCli(
      ['promote', '--manifest', '/safe/manifest.json'],
      {},
      harness.dependencies,
    )

    expect(exitCode).toBe(1)
    expect(harness.readManifest).not.toHaveBeenCalled()
    expect(harness.readEvidence).not.toHaveBeenCalled()
    expect(harness.createAdapters).not.toHaveBeenCalled()
    expect(harness.updateImage).not.toHaveBeenCalled()
    expect(harness.deploy).not.toHaveBeenCalled()
    expectNoPrivateOutput(harness)
  })

  it.each(['bootstrap', 'promote'] as const)(
    'prints only the safe %s apply result',
    async (command) => {
      const harness = cliHarness(command)

      const exitCode = await runDeploymentCli(
        [command, '--manifest', '/safe/manifest.json', '--apply'],
        {},
        harness.dependencies,
      )

      expect(exitCode).toBe(0)
      expect(harness.updateImage).toHaveBeenCalledOnce()
      expect(harness.deploy).toHaveBeenCalledOnce()
      expect(harness.stderr).toEqual([])
      expect(harness.stdout.map((line) => JSON.parse(line))).toEqual([
        {
          environment: 'stage',
          evidencePath: '/safe/evidence.json',
          ok: true,
          operation: command,
          revision: '111111111111',
        },
      ])
      expectNoPrivateOutput(harness)
    },
  )

  it('reads rollback evidence before adapter composition and prints safe result', async () => {
    const harness = cliHarness('rollback')
    const order: string[] = []
    const createAdapters = harness.dependencies.createAdapters
    if (createAdapters === undefined) {
      throw new Error('Expected adapter factory')
    }
    const adapters = createAdapters(live)
    harness.createAdapters.mockClear()
    harness.readEvidence.mockImplementation(async () => {
      order.push('evidence')
      return failedPromotionEvidence()
    })
    harness.createAdapters.mockImplementation(() => {
      order.push('adapters')
      return adapters
    })

    const exitCode = await runDeploymentCli(
      ['rollback', '--evidence', '/safe/failed.json', '--apply'],
      {},
      harness.dependencies,
    )

    expect(exitCode).toBe(0)
    expect(order).toEqual(['evidence', 'adapters'])
    expect(harness.readManifest).not.toHaveBeenCalled()
    expect(harness.stdout.map((line) => JSON.parse(line))).toEqual([
      {
        environment: 'stage',
        evidencePath: '/safe/evidence.json',
        ok: true,
        operation: 'rollback',
        revision: '222222222222',
      },
    ])
    expectNoPrivateOutput(harness)
  })

  it('redacts arbitrary adapter errors and every protected value', async () => {
    const harness = cliHarness('preflight')
    harness.createAdapters.mockImplementation(() => {
      throw new Error(
        `${privateValues.join(' ')} https://dokploy.example.test?key=${privateValues[4]}`,
      )
    })

    const exitCode = await runDeploymentCli(
      ['preflight', '--manifest', '/safe/manifest.json'],
      {},
      harness.dependencies,
    )

    expect(exitCode).toBe(1)
    expect(harness.stdout).toEqual([])
    expect(harness.stderr.map((line) => JSON.parse(line))).toEqual([
      {
        error: { category: 'failed', name: 'DeploymentCliError' },
        ok: false,
      },
    ])
    expectNoPrivateOutput(harness)
  })
})
