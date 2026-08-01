// @vitest-environment node

import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EvidenceFileAdapter,
  EvidenceFileError,
  parseDeploymentEvidence,
  readDeploymentEvidence,
} from './evidence-file.adapter.ts'
import type { FrontendDeploymentEvidence } from './ports.ts'

const candidateImage = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const currentImage = 'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64)
const candidateRevision = '1'.repeat(40)
const currentRevision = '2'.repeat(40)
const temporaryDirectories: string[] = []

function failedPromotionEvidence(): FrontendDeploymentEvidence {
  return {
    applicationId: 'app_123',
    deploymentId: 'deployment_123',
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

function succeededPromotionEvidence(): FrontendDeploymentEvidence {
  const evidence = failedPromotionEvidence()
  const { failedStep, ...withoutFailure } = evidence
  void failedStep
  return {
    ...withoutFailure,
    outcome: 'succeeded',
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
  }
}

function expectEvidenceInputFailure(input: unknown): Error {
  try {
    parseDeploymentEvidence(input)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    return error as Error
  }
  throw new Error('Expected deployment evidence parsing to fail')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe('parseDeploymentEvidence', () => {
  it('parses and deeply freezes strict failed promotion evidence', () => {
    const parsed = parseDeploymentEvidence(failedPromotionEvidence())

    expect(parsed).toEqual(failedPromotionEvidence())
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.previous)).toBe(true)
    expect(Object.isFrozen(parsed.target)).toBe(true)
    expect(Object.isFrozen(parsed.smokePaths)).toBe(true)
  })

  it.each([
    ['unknown credential field', { token: 'private-token-value' }],
    [
      'credential-bearing public URL',
      {
        publicBaseUrl:
          'https://private-user:private-password@stage.example.test',
      },
    ],
    [
      'query-bearing public URL',
      { publicBaseUrl: 'https://stage.example.test?token=private-query-value' },
    ],
    [
      'malformed target digest',
      {
        target: {
          imageRef: 'ghcr.io/example/react-starter:stage',
          revision: candidateRevision,
        },
      },
    ],
    ['promotion without previous', { previous: null }],
    [
      'bootstrap with previous',
      {
        operation: 'bootstrap',
        previous: {
          imageRef: currentImage,
          revision: currentRevision,
        },
      },
    ],
    ['failed result without failed step', { failedStep: undefined }],
    ['successful result with failed step', { outcome: 'succeeded' }],
    [
      'duplicate smoke paths',
      {
        smokePaths: [
          '/approval-requests/example',
          '/approval-requests/example',
        ],
      },
    ],
    ['reserved smoke path', { smokePaths: ['/v1/private'] }],
  ])('rejects %s without exposing input values', (_name, change) => {
    const privateValue = JSON.stringify(change)
    const error = expectEvidenceInputFailure({
      ...failedPromotionEvidence(),
      ...change,
    })

    expect(JSON.stringify(error)).not.toContain('private-token-value')
    expect(String(error)).not.toContain(privateValue)
  })
})

describe('EvidenceFileAdapter', () => {
  it('writes one synced-style atomic evidence file below a protected directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'react-starter-evidence-test-'))
    temporaryDirectories.push(root)
    const directory = join(root, 'nested', 'evidence')

    const path = await new EvidenceFileAdapter().write(
      directory,
      succeededPromotionEvidence(),
    )

    expect(path).toBe(
      join(directory, 'stage-promote-111111111111-20250101T000010000Z.json'),
    )
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const contents = await readFile(path, 'utf8')
    expect(contents.endsWith('\n')).toBe(true)
    expect(JSON.parse(contents)).toEqual(succeededPromotionEvidence())
    expect(await readdir(directory)).toEqual([
      'stage-promote-111111111111-20250101T000010000Z.json',
    ])
  })

  it('does not overwrite an existing destination and removes its temporary file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'react-starter-evidence-test-'))
    temporaryDirectories.push(root)
    const directory = join(root, 'evidence')
    const adapter = new EvidenceFileAdapter()
    const evidence = succeededPromotionEvidence()
    const path = await adapter.write(directory, evidence)
    const original = await readFile(path, 'utf8')

    await expect(adapter.write(directory, evidence)).rejects.toMatchObject({
      category: 'destination_exists',
      name: 'EvidenceFileError',
    })

    expect(await readFile(path, 'utf8')).toBe(original)
    expect(await readdir(directory)).toEqual([
      'stage-promote-111111111111-20250101T000010000Z.json',
    ])
  })

  it('reads valid evidence and redacts file and JSON failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'react-starter-evidence-test-'))
    temporaryDirectories.push(root)
    const validPath = join(root, 'valid.json')
    const invalidPath = join(root, 'private-file-name.json')
    await writeFile(validPath, JSON.stringify(failedPromotionEvidence()))
    await writeFile(invalidPath, '{private-json-body')

    await expect(readDeploymentEvidence(validPath)).resolves.toEqual(
      failedPromotionEvidence(),
    )
    for (const path of [invalidPath, join(root, 'private-missing.json')]) {
      try {
        await readDeploymentEvidence(path)
      } catch (error) {
        expect(error).toBeInstanceOf(EvidenceFileError)
        expect(String(error)).not.toContain(path)
        expect(JSON.stringify(error)).not.toContain('private-json-body')
      }
    }
  })
})
