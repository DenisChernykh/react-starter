// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type {
  CommandOptions,
  CommandPort,
  CommandResult,
} from '../lib/command-runner.ts'
import { smokeDockerImage } from './docker-image-smoke.ts'

const imageRef = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const expectedRevision = '1'.repeat(40)
const expectedSource = 'https://github.com/example/react-starter'
const expectedWorkflowRunUrl =
  'https://github.com/example/react-starter/actions/runs/1/attempts/1'
const assetPath = '/assets/index-a1b2c3d4.js'
const unversionedAssetPath = '/favicon.svg'
const appHtml = `<div id="root"></div><script src="${assetPath}"></script>`

interface RecordedCall {
  readonly executable: string
  readonly arguments_: readonly string[]
  readonly options: CommandOptions
}

function commandResult(stdout = '', exitCode = 0, stderr = ''): CommandResult {
  return { exitCode, stdout, stderr }
}

function imageInspect(
  overrides: {
    readonly user?: string
    readonly exposedPorts?: Record<string, Record<string, never>>
    readonly labels?: Record<string, string>
  } = {},
): string {
  return JSON.stringify([
    {
      Config: {
        User: overrides.user ?? '101',
        ExposedPorts: overrides.exposedPorts ?? { '8080/tcp': {} },
        Labels: overrides.labels ?? {
          'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
          'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
          'org.opencontainers.image.revision': expectedRevision,
          'org.opencontainers.image.source': expectedSource,
        },
      },
    },
  ])
}

class FakeCommandPort implements CommandPort {
  readonly calls: RecordedCall[] = []
  private readonly inspectOutput: string

  constructor(inspectOutput = imageInspect()) {
    this.inspectOutput = inspectOutput
  }

  run(
    executable: string,
    arguments_: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    this.calls.push({ executable, arguments_, options })

    if (arguments_[0] === 'image' && arguments_[1] === 'inspect') {
      return Promise.resolve(commandResult(this.inspectOutput))
    }
    if (arguments_[0] === 'run') {
      return Promise.resolve(commandResult('container-id\n'))
    }
    if (arguments_[0] === 'port') {
      return Promise.resolve(commandResult('127.0.0.1:49152\n'))
    }
    if (arguments_[0] === 'stop') {
      return Promise.resolve(commandResult('container-id\n'))
    }
    if (arguments_[0] === 'inspect') {
      return Promise.resolve(commandResult('0\n'))
    }
    if (arguments_[0] === 'rm') {
      return Promise.resolve(commandResult())
    }

    return Promise.resolve(commandResult('', 99, 'unexpected fake command'))
  }
}

function httpResponse(
  body: string,
  status: number,
  extraHeaders: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: {
      'referrer-policy': 'no-referrer',
      server: 'nginx',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...extraHeaders,
    },
  })
}

function healthyFetch(overrides = new Map<string, Response>()): typeof fetch {
  const responses = new Map<string, Response>([
    [
      '/_frontend/health',
      httpResponse('ok\n', 200, {
        'cache-control': 'no-store',
        'content-type': 'text/plain',
      }),
    ],
    [
      '/_frontend/identity',
      httpResponse(`${expectedSource}\n${expectedRevision}\n`, 200, {
        'cache-control': 'no-store',
        'content-type': 'text/plain',
      }),
    ],
    [
      '/',
      httpResponse(appHtml, 200, {
        'cache-control': 'no-cache',
        'content-type': 'text/html',
      }),
    ],
    [
      '/login',
      httpResponse(appHtml, 200, {
        'cache-control': 'no-cache',
        'content-type': 'text/html',
      }),
    ],
    [
      '/approval-requests/00000000-0000-4000-8000-000000000001',
      httpResponse(appHtml, 200, {
        'cache-control': 'no-cache',
        'content-type': 'text/html',
      }),
    ],
    ...['/v10', '/v1-admin', '/healthcheck'].map(
      (path) =>
        [
          path,
          httpResponse(appHtml, 200, {
            'cache-control': 'no-cache',
            'content-type': 'text/html',
          }),
        ] as const,
    ),
    [
      assetPath,
      httpResponse('asset', 200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'text/javascript',
      }),
    ],
    [
      unversionedAssetPath,
      httpResponse('<svg/>', 200, {
        'cache-control': 'no-cache',
        'content-type': 'image/svg+xml',
      }),
    ],
    ['/v1', httpResponse('Not Found', 404, { 'content-type': 'text/plain' })],
    [
      '/v1/__frontend_deployment_probe__',
      httpResponse('Not Found', 404, { 'content-type': 'text/plain' }),
    ],
    [
      '/health',
      httpResponse('Not Found', 404, { 'content-type': 'text/plain' }),
    ],
    [
      '/health/unknown',
      httpResponse('Not Found', 404, { 'content-type': 'text/plain' }),
    ],
  ])
  for (const [path, value] of overrides) {
    responses.set(path, value)
  }

  return (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const found = responses.get(url.pathname)
    if (!found) {
      throw new Error(`Unexpected test path: ${url.pathname}`)
    }

    return found.clone()
  }) as typeof fetch
}

const input = {
  expectedRevision,
  expectedSource,
  expectedWorkflowRunUrl,
  imageRef,
} as const

describe('smokeDockerImage', () => {
  it('inspects metadata and runs the exact owned container lifecycle', async () => {
    const commands = new FakeCommandPort()

    await expect(
      smokeDockerImage(input, {
        commands,
        fetchImplementation: healthyFetch(),
      }),
    ).resolves.toBeUndefined()

    expect(
      commands.calls.map(({ executable, arguments_ }) => [
        executable,
        arguments_[0],
        arguments_[1],
      ]),
    ).toEqual([
      ['docker', 'image', 'inspect'],
      ['docker', 'run', '--detach'],
      ['docker', 'port', expect.stringMatching(/^react-starter-oci-smoke-/u)],
      ['docker', 'stop', '--time'],
      ['docker', 'inspect', '--format'],
      ['docker', 'rm', '--force'],
    ])

    const runArguments = commands.calls[1]?.arguments_ ?? []
    const containerName = runArguments[runArguments.indexOf('--name') + 1]
    expect(containerName).toMatch(/^react-starter-oci-smoke-/u)
    expect(runArguments).toEqual([
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
      imageRef,
    ])
    expect(commands.calls[2]?.arguments_).toEqual([
      'port',
      containerName,
      '8080/tcp',
    ])
    expect(commands.calls[3]?.arguments_).toEqual([
      'stop',
      '--time',
      '10',
      containerName,
    ])
    expect(commands.calls[4]?.arguments_).toEqual([
      'inspect',
      '--format',
      '{{.State.ExitCode}}',
      containerName,
    ])
    expect(commands.calls[5]?.arguments_).toEqual([
      'rm',
      '--force',
      containerName,
    ])
    expect(
      commands.calls.some(({ arguments_ }) =>
        arguments_.join(' ').startsWith('image rm'),
      ),
    ).toBe(false)
  })

  it.each([
    {
      name: 'runtime user',
      inspect: imageInspect({ user: '0' }),
    },
    {
      name: 'exposed port',
      inspect: imageInspect({ exposedPorts: { '3000/tcp': {} } }),
    },
    {
      name: 'revision label',
      inspect: imageInspect({
        labels: {
          'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
          'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
          'org.opencontainers.image.revision': '2'.repeat(40),
          'org.opencontainers.image.source': expectedSource,
        },
      }),
    },
  ])('rejects a mismatched $name before docker run', async ({ inspect }) => {
    const commands = new FakeCommandPort(inspect)

    await expect(
      smokeDockerImage(input, {
        commands,
        fetchImplementation: healthyFetch(),
      }),
    ).rejects.toMatchObject({ name: 'DockerImageSmokeError' })

    expect(commands.calls).toHaveLength(1)
    expect(commands.calls[0]?.arguments_.slice(0, 2)).toEqual([
      'image',
      'inspect',
    ])
  })

  it.each([
    {
      name: 'missing source label without a caller expectation',
      labels: {
        'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
        'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
        'org.opencontainers.image.revision': expectedRevision,
      },
    },
    {
      name: 'missing workflow label without a caller expectation',
      labels: {
        'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
        'org.opencontainers.image.revision': expectedRevision,
        'org.opencontainers.image.source': expectedSource,
      },
    },
    {
      name: 'an invalid source label without a caller expectation',
      labels: {
        'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
        'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
        'org.opencontainers.image.revision': expectedRevision,
        'org.opencontainers.image.source': 'not-a-url',
      },
    },
  ])('rejects $name before docker run', async ({ labels }) => {
    const commands = new FakeCommandPort(
      imageInspect({ labels: labels as Record<string, string> }),
    )

    await expect(
      smokeDockerImage(
        { expectedRevision, imageRef },
        {
          commands,
          fetchImplementation: healthyFetch(),
        },
      ),
    ).rejects.toMatchObject({ name: 'DockerImageSmokeError' })

    expect(commands.calls).toHaveLength(1)
    expect(commands.calls[0]?.arguments_.slice(0, 2)).toEqual([
      'image',
      'inspect',
    ])
  })

  it('accepts the required provenance quartet with inherited base labels', async () => {
    const commands = new FakeCommandPort(
      imageInspect({
        labels: {
          'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
          maintainer: 'NGINX Docker Maintainers',
          'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
          'org.opencontainers.image.description': 'Unprivileged NGINX image',
          'org.opencontainers.image.licenses': 'BSD-2-Clause',
          'org.opencontainers.image.revision': expectedRevision,
          'org.opencontainers.image.source': expectedSource,
          'org.opencontainers.image.title': 'NGINX Unprivileged',
          'org.opencontainers.image.url':
            'https://github.com/nginx/docker-nginx-unprivileged',
          'org.opencontainers.image.version': '1.29.5',
        },
      }),
    )

    await expect(
      smokeDockerImage(
        { expectedRevision, imageRef },
        {
          commands,
          fetchImplementation: healthyFetch(),
        },
      ),
    ).resolves.toBeUndefined()

    expect(commands.calls.map(({ arguments_ }) => arguments_[0])).toEqual([
      'image',
      'run',
      'port',
      'stop',
      'inspect',
      'rm',
    ])
  })

  it.each([
    {
      name: 'an invalid created label',
      expectedRevision,
      labels: {
        'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
        'org.opencontainers.image.created': 'not-a-date',
        'org.opencontainers.image.revision': expectedRevision,
        'org.opencontainers.image.source': expectedSource,
      },
    },
    ...[
      '2026-07-30',
      '2026-07-30 12:00:00Z',
      '2026-07-30T12:00:00',
      '2026-02-30T12:00:00Z',
      '2026-07-30T12:00:00+24:00',
    ].map((created) => ({
      name: `a non-RFC3339 created label: ${created}`,
      expectedRevision,
      labels: {
        'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
        'org.opencontainers.image.created': created,
        'org.opencontainers.image.revision': expectedRevision,
        'org.opencontainers.image.source': expectedSource,
      },
    })),
    {
      name: 'an invalid workflow label',
      expectedRevision,
      labels: {
        'io.github.actions.workflow-run-url': 'not-a-url',
        'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
        'org.opencontainers.image.revision': expectedRevision,
        'org.opencontainers.image.source': expectedSource,
      },
    },
    {
      name: 'an invalid revision label',
      expectedRevision: 'not-a-revision',
      labels: {
        'io.github.actions.workflow-run-url': expectedWorkflowRunUrl,
        'org.opencontainers.image.created': '2026-07-30T12:00:00Z',
        'org.opencontainers.image.revision': 'not-a-revision',
        'org.opencontainers.image.source': expectedSource,
      },
    },
  ])(
    'rejects $name before docker run',
    async ({ expectedRevision: expectedRevision_, labels }) => {
      const commands = new FakeCommandPort(imageInspect({ labels }))

      await expect(
        smokeDockerImage(
          { expectedRevision: expectedRevision_, imageRef },
          {
            commands,
            fetchImplementation: healthyFetch(),
          },
        ),
      ).rejects.toMatchObject({ name: 'DockerImageSmokeError' })

      expect(commands.calls).toHaveLength(1)
    },
  )

  it('removes its container when the HTTP contract fails without removing the image', async () => {
    const commands = new FakeCommandPort()
    const invalidHealth = new Map([
      [
        '/_frontend/health',
        httpResponse('wrong\n', 200, {
          'cache-control': 'no-store',
          'content-type': 'text/plain',
        }),
      ],
    ])

    await expect(
      smokeDockerImage(input, {
        commands,
        fetchImplementation: healthyFetch(invalidHealth),
      }),
    ).rejects.toMatchObject({ name: 'FrontendHttpContractError' })

    expect(commands.calls.at(-1)?.arguments_.slice(0, 2)).toEqual([
      'rm',
      '--force',
    ])
    expect(
      commands.calls.some(({ arguments_ }) =>
        arguments_.join(' ').startsWith('image rm'),
      ),
    ).toBe(false)
  })

  it('retains fixed primary and cleanup categories when both fail', async () => {
    const privateValue = 'docker-private-output'
    const delegate = new FakeCommandPort()
    const commands: CommandPort = {
      async run(executable, arguments_, options) {
        const result = await delegate.run(executable, arguments_, options)
        if (arguments_[0] === 'port') {
          return commandResult('', 17, privateValue)
        }
        if (arguments_[0] === 'rm') {
          return commandResult('', 18, privateValue)
        }

        return result
      },
    }
    let thrown: unknown

    try {
      await smokeDockerImage(input, {
        commands,
        fetchImplementation: healthyFetch(),
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect(thrown).toMatchObject({
      message:
        'Docker image smoke failed: primary operation and container cleanup',
      name: 'AggregateError',
    })
    expect((thrown as AggregateError).errors).toEqual([
      expect.objectContaining({
        message: 'Docker image smoke failed: container port',
      }),
      expect.objectContaining({
        message: 'Docker image smoke failed: container cleanup',
      }),
    ])
    expect(
      (thrown as AggregateError).errors.map(String).join('\n'),
    ).not.toContain(privateValue)
  })

  it('does not retry an injected programming error during readiness', async () => {
    const commands = new FakeCommandPort()
    const programmingError = new Error('injected programming failure')
    let fetchCalls = 0
    const fetchImplementation = (async () => {
      fetchCalls += 1
      if (fetchCalls === 1) {
        throw programmingError
      }

      return httpResponse('ok\n', 200, {
        'cache-control': 'no-store',
        'content-type': 'text/plain',
      })
    }) as typeof fetch

    await expect(
      smokeDockerImage(input, { commands, fetchImplementation }),
    ).rejects.toBe(programmingError)

    expect(fetchCalls).toBe(1)
    expect(commands.calls.at(-1)?.arguments_.slice(0, 2)).toEqual([
      'rm',
      '--force',
    ])
  })

  it('treats a manual redirect as reachable and leaves rejection to the full verifier', async () => {
    const commands = new FakeCommandPort()
    const redirectModes: Array<RequestInit['redirect']> = []
    const fetchImplementation = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      redirectModes.push(init?.redirect)
      return httpResponse('', 302, { location: '/login' })
    }) as typeof fetch

    await expect(
      smokeDockerImage(input, { commands, fetchImplementation }),
    ).rejects.toMatchObject({ name: 'FrontendHttpContractError' })

    expect(redirectModes).toEqual(['manual', 'error'])
  })

  it.each([
    {
      name: 'connection refusal',
      error: new TypeError('fetch failed', {
        cause: Object.assign(new Error('connection refused'), {
          code: 'ECONNREFUSED',
        }),
      }),
    },
    {
      name: 'request timeout',
      error: new DOMException('request timed out', 'TimeoutError'),
    },
  ])('retries a recognized $name during readiness', async ({ error }) => {
    const commands = new FakeCommandPort()
    const delegate = healthyFetch()
    let fetchCalls = 0
    const fetchImplementation = (async (
      input_: string | URL | Request,
      init?: RequestInit,
    ) => {
      fetchCalls += 1
      if (fetchCalls === 1) {
        throw error
      }

      return delegate(input_, init)
    }) as typeof fetch

    await expect(
      smokeDockerImage(input, { commands, fetchImplementation }),
    ).resolves.toBeUndefined()

    expect(fetchCalls).toBe(16)
  })
})
