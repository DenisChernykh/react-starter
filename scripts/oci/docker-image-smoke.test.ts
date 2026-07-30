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
    ['/', httpResponse(appHtml, 200, { 'content-type': 'text/html' })],
    ['/login', httpResponse(appHtml, 200, { 'content-type': 'text/html' })],
    [
      '/approval-requests/00000000-0000-4000-8000-000000000001',
      httpResponse(appHtml, 200, { 'content-type': 'text/html' }),
    ],
    [
      assetPath,
      httpResponse('asset', 200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'text/javascript',
      }),
    ],
    [
      '/v1/__frontend_deployment_probe__',
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
})
