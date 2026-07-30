// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DeploymentInputError,
  parseDeploymentManifest,
  readDeploymentManifest,
} from './manifest.ts'

const candidateImage = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const currentImage = 'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64)

const promotionManifest = {
  schemaVersion: 1,
  mode: 'promotion',
  environment: 'stage',
  repository: 'example/react-starter',
  workflowRunUrl:
    'https://github.com/example/react-starter/actions/runs/123/attempts/1',
  publicBaseUrl: 'https://stage.example.com',
  candidate: {
    imageRef: candidateImage,
    revision: '1'.repeat(40),
  },
  expectedCurrent: {
    imageRef: currentImage,
    revision: '2'.repeat(40),
  },
  smokePaths: [
    '/login',
    '/approval-requests/00000000-0000-4000-8000-000000000000',
  ],
} as const

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

function expectInputError(input: unknown): DeploymentInputError {
  try {
    parseDeploymentManifest(input)
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentInputError)
    return error as DeploymentInputError
  }

  throw new Error('Expected manifest parsing to fail')
}

function promotionFixture(): Record<string, unknown> {
  return structuredClone(promotionManifest) as Record<string, unknown>
}

describe('parseDeploymentManifest', () => {
  it('parses, normalizes URL origins and deeply freezes a valid promotion', () => {
    const input = {
      ...promotionManifest,
      publicBaseUrl: 'https://stage.example.com/',
    }

    const parsed = parseDeploymentManifest(input)

    expect(parsed).toEqual(promotionManifest)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.candidate)).toBe(true)
    expect(Object.isFrozen(parsed.expectedCurrent)).toBe(true)
    expect(Object.isFrozen(parsed.smokePaths)).toBe(true)
  })

  it('preserves repository spelling while comparing GitHub coordinates case-insensitively', () => {
    const parsed = parseDeploymentManifest({
      ...promotionManifest,
      repository: 'Example/React-Starter',
      workflowRunUrl:
        'https://github.com/example/react-starter/actions/runs/123/attempts/1',
    })

    expect(parsed.repository).toBe('Example/React-Starter')
  })

  it('removes only the trailing slash from the public origin', () => {
    const parsed = parseDeploymentManifest({
      ...promotionManifest,
      publicBaseUrl: 'https://STAGE.example.com:8443/',
    })

    expect(parsed.publicBaseUrl).toBe('https://STAGE.example.com:8443')
  })

  it.each([
    ['root token', { token: 'manifest-token-secret' }],
    ['root password', { password: 'manifest-password-secret' }],
    ['root env', { env: 'manifest-env-secret' }],
    ['root headers', { headers: { authorization: 'manifest-header-secret' } }],
  ])('rejects an unknown %s without serializing its value', (_name, extra) => {
    const error = expectInputError({ ...promotionManifest, ...extra })
    const serialized = JSON.stringify(error)

    expect(serialized).toContain('unrecognized_keys')
    expect(serialized).not.toContain(Object.values(extra)[0]?.toString())
  })

  it.each([
    ['uppercase', 'Stage'],
    ['leading dash', '-stage'],
    ['too long', 'a'.repeat(65)],
  ])('rejects an invalid environment: %s', (_name, environment) => {
    const error = expectInputError({ ...promotionManifest, environment })

    expect(error.issues).toContainEqual({
      path: 'environment',
      rule: 'environment_format',
    })
  })

  it.each([
    ['tag reference', 'ghcr.io/example/react-starter:stage'],
    [
      'mixed-case path',
      'ghcr.io/Example/react-starter@sha256:' + 'a'.repeat(64),
    ],
    [
      'non-hex digest',
      'ghcr.io/example/react-starter@sha256:' + 'g'.repeat(64),
    ],
  ])('rejects a candidate %s', (_name, imageRef) => {
    const error = expectInputError({
      ...promotionManifest,
      candidate: { ...promotionManifest.candidate, imageRef },
    })

    expect(error.issues).toContainEqual({
      path: 'candidate.imageRef',
      rule: 'image_ref_format',
    })
  })

  it('binds candidate and current image coordinates to the manifest repository', () => {
    const candidateMismatch = expectInputError({
      ...promotionManifest,
      candidate: {
        ...promotionManifest.candidate,
        imageRef: 'ghcr.io/example/other-starter@sha256:' + 'a'.repeat(64),
      },
    })
    const currentMismatch = expectInputError({
      ...promotionManifest,
      expectedCurrent: {
        ...promotionManifest.expectedCurrent,
        imageRef: 'ghcr.io/example/other-starter@sha256:' + 'b'.repeat(64),
      },
    })

    expect(candidateMismatch.issues).toContainEqual({
      path: 'candidate.imageRef',
      rule: 'repository_match',
    })
    expect(currentMismatch.issues).toContainEqual({
      path: 'expectedCurrent.imageRef',
      rule: 'repository_match',
    })
  })

  it('rejects equal candidate and current image identities', () => {
    const error = expectInputError({
      ...promotionManifest,
      expectedCurrent: {
        ...promotionManifest.expectedCurrent,
        imageRef: candidateImage,
      },
    })

    expect(error.issues).toContainEqual({
      path: 'expectedCurrent.imageRef',
      rule: 'distinct_from_candidate',
    })
  })

  it.each([
    [
      'repository mismatch',
      'https://github.com/example/other/actions/runs/123/attempts/1',
      'repository_match',
    ],
    [
      'missing attempt',
      'https://github.com/example/react-starter/actions/runs/123',
      'workflow_run_url_format',
    ],
  ])('rejects workflow URL with %s', (_name, workflowRunUrl, rule) => {
    const error = expectInputError({ ...promotionManifest, workflowRunUrl })

    expect(error.issues).toContainEqual({ path: 'workflowRunUrl', rule })
  })

  it.each([
    [
      'workflow credentials',
      'workflowRunUrl',
      'https://user:secret@github.com/example/react-starter/actions/runs/123/attempts/1',
    ],
    [
      'workflow query',
      'workflowRunUrl',
      'https://github.com/example/react-starter/actions/runs/123/attempts/1?token=secret',
    ],
    [
      'workflow fragment',
      'workflowRunUrl',
      'https://github.com/example/react-starter/actions/runs/123/attempts/1#secret',
    ],
    [
      'public credentials',
      'publicBaseUrl',
      'https://user:secret@stage.example.com',
    ],
    ['public query', 'publicBaseUrl', 'https://stage.example.com?token=secret'],
    ['public fragment', 'publicBaseUrl', 'https://stage.example.com#secret'],
  ])(
    'rejects %s without serializing rejected URL values',
    (_name, key, value) => {
      const error = expectInputError({ ...promotionManifest, [key]: value })
      const serialized = JSON.stringify(error)

      expect(error.issues.some(({ path }) => path === key)).toBe(true)
      expect(serialized).not.toContain(value)
    },
  )

  it.each([
    ['duplicate path', ['/login', '/login']],
    ['relative path', ['login']],
    ['API root', ['/v1']],
    ['API child', ['/v1/users']],
    ['backend health', ['/health']],
    ['backend health child', ['/health/ready']],
    ['frontend health', ['/_frontend/health']],
  ])('rejects smoke paths with %s', (_name, smokePaths) => {
    const error = expectInputError({ ...promotionManifest, smokePaths })

    expect(
      error.issues.some(
        ({ path, rule }) =>
          path.startsWith('smokePaths') &&
          ['smoke_path_format', 'smoke_path_reserved', 'unique'].includes(rule),
      ),
    ).toBe(true)
  })

  it('requires a null current image for bootstrap', () => {
    const error = expectInputError({
      ...promotionManifest,
      mode: 'bootstrap',
    })

    expect(error.issues).toContainEqual({
      path: 'expectedCurrent',
      rule: 'bootstrap_requires_null',
    })
  })

  it('requires a current image for promotion', () => {
    const error = expectInputError({
      ...promotionManifest,
      expectedCurrent: null,
    })

    expect(error.issues).toContainEqual({
      path: 'expectedCurrent',
      rule: 'promotion_requires_current',
    })
  })

  it('serializes only redacted error metadata', () => {
    const input = promotionFixture()
    input.token = 'top-level-release-secret'
    const error = expectInputError(input)

    expect(error.toJSON()).toEqual({
      name: 'DeploymentInputError',
      message: 'Invalid deployment input',
      issues: [{ path: '', rule: 'unrecognized_keys' }],
    })
    expect(JSON.stringify(error)).not.toContain('top-level-release-secret')
  })
})

describe('readDeploymentManifest', () => {
  it('reads and validates a JSON manifest from disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frontend-manifest-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'release.json')
    await writeFile(path, JSON.stringify(promotionManifest), 'utf8')

    await expect(readDeploymentManifest(path)).resolves.toEqual(
      promotionManifest,
    )
  })

  it('redacts invalid JSON file contents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frontend-manifest-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'release.json')
    await writeFile(path, '{"token":"file-secret"', 'utf8')

    await expect(readDeploymentManifest(path)).rejects.toMatchObject({
      name: 'DeploymentInputError',
      issues: [{ path: '', rule: 'json_format' }],
    })
    await expect(readDeploymentManifest(path)).rejects.not.toThrow(
      /file-secret/u,
    )
  })
})
