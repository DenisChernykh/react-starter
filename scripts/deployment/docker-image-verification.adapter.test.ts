// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type {
  CommandOptions,
  CommandPort,
  CommandResult,
} from '../lib/command-runner.ts'
import {
  DockerImageVerificationAdapter,
  DockerImageVerificationError,
} from './docker-image-verification.adapter.ts'

const repository = 'example/react-starter'
const revision = '1'.repeat(40)
const digest = 'a'.repeat(64)
const imageRef = `ghcr.io/${repository}@sha256:${digest}`
const workflowRunUrl =
  'https://github.com/example/react-starter/actions/runs/123/attempts/2'
const registryUrl = 'https://ghcr.io'
const username = 'example-user'
const password = 'registry-private-password'
const source = `https://github.com/${repository}`

interface RecordedCommand {
  readonly executable: string
  readonly arguments_: readonly string[]
  readonly options: CommandOptions
}

function commandResult(stdout = '', exitCode = 0, stderr = ''): CommandResult {
  return { exitCode, stderr, stdout }
}

function imageLabels(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    'io.github.actions.workflow-run-url': workflowRunUrl,
    'org.opencontainers.image.revision': revision,
    'org.opencontainers.image.source': source,
    ...overrides,
  })
}

class FakeCommandPort implements CommandPort {
  readonly calls: RecordedCommand[] = []
  private readonly runImplementation: (
    call: RecordedCommand,
    index: number,
  ) => Promise<CommandResult>

  constructor(
    runImplementation: (
      call: RecordedCommand,
      index: number,
    ) => Promise<CommandResult> = async (call) => {
      if (call.arguments_[0] === 'image' && call.arguments_[1] === 'inspect') {
        return commandResult(imageLabels())
      }
      return commandResult()
    },
  ) {
    this.runImplementation = runImplementation
  }

  run(
    executable: string,
    arguments_: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    const call = { arguments_, executable, options }
    this.calls.push(call)
    return this.runImplementation(call, this.calls.length - 1)
  }
}

class FakeTemporaryDockerConfig {
  readonly mkdtempPrefixes: string[] = []
  readonly chmodCalls: {
    readonly path: string
    readonly mode: number
  }[] = []
  readonly rmCalls: {
    readonly path: string
    readonly options: {
      readonly force?: boolean
      readonly recursive?: boolean
    }
  }[] = []
  private nextDirectory = 0

  readonly functions = {
    chmod: async (path: string, mode: number): Promise<void> => {
      this.chmodCalls.push({ mode, path })
    },
    mkdtemp: async (prefix: string): Promise<string> => {
      this.mkdtempPrefixes.push(prefix)
      this.nextDirectory += 1
      return `/private/tmp/fake-docker-config-${this.nextDirectory}`
    },
    rm: async (
      path: string,
      options: { readonly force?: boolean; readonly recursive?: boolean },
    ): Promise<void> => {
      this.rmCalls.push({ options, path })
    },
    tmpdir: (): string => '/private/tmp',
  }
}

function verifyInput(
  overrides: Partial<{
    readonly image: { readonly imageRef: string; readonly revision: string }
    readonly repository: string
    readonly workflowRunUrl: string | undefined
    readonly registryUrl: string
    readonly username: string
    readonly password: string
    readonly signal: AbortSignal
  }> = {},
) {
  return {
    image: { imageRef, revision },
    password,
    registryUrl,
    repository,
    username,
    workflowRunUrl,
    ...overrides,
  }
}

function createAdapter(
  commands: CommandPort,
  temporary = new FakeTemporaryDockerConfig(),
): {
  readonly adapter: DockerImageVerificationAdapter
  readonly temporary: FakeTemporaryDockerConfig
} {
  return {
    adapter: new DockerImageVerificationAdapter({
      commands,
      temporaryDockerConfig: temporary.functions,
    }),
    temporary,
  }
}

async function expectSafeVerificationFailure(
  promise: Promise<unknown>,
  forbiddenValues: readonly string[] = [],
): Promise<DockerImageVerificationError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(DockerImageVerificationError)
    const rendered = String(error)
    const serialized = JSON.stringify(error)
    for (const forbidden of [password, ...forbiddenValues]) {
      expect(rendered).not.toContain(forbidden)
      expect(serialized).not.toContain(forbidden)
    }
    return error as DockerImageVerificationError
  }

  throw new Error('Expected DockerImageVerificationError')
}

describe('DockerImageVerificationAdapter', () => {
  it.each([
    [
      'mutable image tag',
      {
        image: {
          imageRef: `ghcr.io/${repository}:stage`,
          revision,
        },
      },
    ],
    [
      'non-GHCR registry URL',
      {
        registryUrl: 'https://registry.example.com',
      },
    ],
    [
      'normalized but non-exact GHCR registry URL',
      {
        registryUrl: 'https://ghcr.io/',
      },
    ],
    [
      'non-GHCR image registry',
      {
        image: {
          imageRef: `registry.example.com/${repository}@sha256:${digest}`,
          revision,
        },
      },
    ],
    [
      'mixed-case digest',
      {
        image: {
          imageRef: `ghcr.io/${repository}@sha256:${'A'.repeat(64)}`,
          revision,
        },
      },
    ],
    [
      'malformed digest',
      {
        image: {
          imageRef: `ghcr.io/${repository}@sha256:${'a'.repeat(63)}`,
          revision,
        },
      },
    ],
    [
      'mismatched repository',
      {
        image: {
          imageRef: `ghcr.io/example/other-starter@sha256:${digest}`,
          revision,
        },
      },
    ],
  ] as const)(
    'rejects %s before creating auth or invoking Docker',
    async (_caseName, overrides) => {
      const commands = new FakeCommandPort()
      const { adapter, temporary } = createAdapter(commands)
      const rejectedValues = [
        'registryUrl' in overrides ? overrides.registryUrl : undefined,
        'image' in overrides ? overrides.image.imageRef : undefined,
      ].filter((value) => value !== undefined)

      const error = await expectSafeVerificationFailure(
        adapter.verify(verifyInput(overrides)),
        rejectedValues,
      )

      expect(error.message).toBe(
        'Docker image verification failed: image input',
      )
      expect(commands.calls).toEqual([])
      expect(temporary.mkdtempPrefixes).toEqual([])
      expect(temporary.chmodCalls).toEqual([])
      expect(temporary.rmCalls).toEqual([])
    },
  )

  it('logs in through stdin, pulls and inspects the exact digest with isolated auth', async () => {
    const commands = new FakeCommandPort()
    const { adapter, temporary } = createAdapter(commands)

    await expect(adapter.verify(verifyInput())).resolves.toBeUndefined()

    expect(
      commands.calls.map(({ executable, arguments_ }) => ({
        arguments_,
        executable,
      })),
    ).toEqual([
      {
        arguments_: [
          'login',
          'ghcr.io',
          '--username',
          username,
          '--password-stdin',
        ],
        executable: 'docker',
      },
      { arguments_: ['pull', imageRef], executable: 'docker' },
      {
        arguments_: [
          'image',
          'inspect',
          imageRef,
          '--format',
          '{{json .Config.Labels}}',
        ],
        executable: 'docker',
      },
    ])

    const dockerConfig = '/private/tmp/fake-docker-config-1'
    expect(temporary.mkdtempPrefixes).toEqual([
      '/private/tmp/react-starter-docker-auth-',
    ])
    expect(temporary.chmodCalls).toEqual([{ mode: 0o700, path: dockerConfig }])
    expect(temporary.rmCalls).toEqual([
      {
        options: { force: true, recursive: true },
        path: dockerConfig,
      },
    ])
    for (const call of commands.calls) {
      expect(call.options.env?.DOCKER_CONFIG).toBe(dockerConfig)
      expect(call.options.signal).toBeUndefined()
      expect(call.options.timeoutMs).toBeGreaterThan(0)
      expect(call.arguments_).not.toContain(password)
      expect(JSON.stringify(call.options.env)).not.toContain(password)
    }
    expect(commands.calls[0]?.options.stdin).toBe(password)
    expect(commands.calls[1]?.options.stdin).toBeUndefined()
    expect(commands.calls[2]?.options.stdin).toBeUndefined()
    expect(
      commands.calls.some(
        ({ arguments_ }) => arguments_[0] === 'image' && arguments_[1] === 'rm',
      ),
    ).toBe(false)
  })

  it('uses a unique owned credential directory for each verification', async () => {
    const commands = new FakeCommandPort()
    const temporary = new FakeTemporaryDockerConfig()
    const { adapter } = createAdapter(commands, temporary)

    await adapter.verify(verifyInput())
    await adapter.verify(verifyInput())

    expect(
      commands.calls.map((call) => call.options.env?.DOCKER_CONFIG),
    ).toEqual([
      '/private/tmp/fake-docker-config-1',
      '/private/tmp/fake-docker-config-1',
      '/private/tmp/fake-docker-config-1',
      '/private/tmp/fake-docker-config-2',
      '/private/tmp/fake-docker-config-2',
      '/private/tmp/fake-docker-config-2',
    ])
    expect(temporary.rmCalls.map(({ path }) => path)).toEqual([
      '/private/tmp/fake-docker-config-1',
      '/private/tmp/fake-docker-config-2',
    ])
  })

  it.each([
    ['registry login', 0],
    ['image pull', 1],
    ['image inspect', 2],
  ] as const)(
    'rejects failed %s without exposing command output and still removes auth',
    async (category, failingIndex) => {
      const privateOutput = `private-${category}-output`
      const commands = new FakeCommandPort(async (call, index) => {
        if (index === failingIndex) {
          return commandResult(privateOutput, 7, privateOutput)
        }
        if (
          call.arguments_[0] === 'image' &&
          call.arguments_[1] === 'inspect'
        ) {
          return commandResult(imageLabels())
        }
        return commandResult()
      })
      const { adapter, temporary } = createAdapter(commands)

      const error = await expectSafeVerificationFailure(
        adapter.verify(verifyInput()),
        [privateOutput],
      )

      expect(error.message).toBe(
        `Docker image verification failed: ${category}`,
      )
      expect(commands.calls).toHaveLength(failingIndex + 1)
      expect(temporary.rmCalls).toHaveLength(1)
    },
  )

  it('rejects invalid inspect JSON without exposing it', async () => {
    const privateOutput = '{private-invalid-json'
    const commands = new FakeCommandPort(async (call) =>
      call.arguments_[0] === 'image'
        ? commandResult(privateOutput)
        : commandResult(),
    )
    const { adapter, temporary } = createAdapter(commands)

    const error = await expectSafeVerificationFailure(
      adapter.verify(verifyInput()),
      [privateOutput],
    )

    expect(error.message).toBe(
      'Docker image verification failed: image metadata',
    )
    expect(temporary.rmCalls).toHaveLength(1)
  })

  it.each([
    ['null labels', 'null'],
    ['array labels', '[]'],
    ['missing labels', '{}'],
    [
      'revision mismatch',
      imageLabels({ 'org.opencontainers.image.revision': '2'.repeat(40) }),
    ],
    [
      'source mismatch',
      imageLabels({
        'org.opencontainers.image.source':
          'https://github.com/other/react-starter',
      }),
    ],
    [
      'workflow mismatch',
      imageLabels({
        'io.github.actions.workflow-run-url':
          'https://github.com/example/react-starter/actions/runs/999/attempts/1',
      }),
    ],
  ] as const)('rejects %s', async (_caseName, inspectOutput) => {
    const commands = new FakeCommandPort(async (call) =>
      call.arguments_[0] === 'image'
        ? commandResult(inspectOutput)
        : commandResult(),
    )
    const { adapter, temporary } = createAdapter(commands)

    const error = await expectSafeVerificationFailure(
      adapter.verify(verifyInput()),
    )

    expect(error.message).toBe('Docker image verification failed: OCI labels')
    expect(temporary.rmCalls).toHaveLength(1)
  })

  it('does not require a workflow label when no workflow URL is supplied', async () => {
    const labelsWithoutWorkflow = JSON.stringify({
      'org.opencontainers.image.revision': revision,
      'org.opencontainers.image.source': source,
    })
    const commands = new FakeCommandPort(async (call) =>
      call.arguments_[0] === 'image'
        ? commandResult(labelsWithoutWorkflow)
        : commandResult(),
    )
    const { adapter } = createAdapter(commands)

    await expect(
      adapter.verify(verifyInput({ workflowRunUrl: undefined })),
    ).resolves.toBeUndefined()
  })

  it('stops after abort and removes the temporary auth directory', async () => {
    const controller = new AbortController()
    const privateReason = 'private-abort-reason'
    const commands = new FakeCommandPort(async () => {
      controller.abort(privateReason)
      return commandResult()
    })
    const { adapter, temporary } = createAdapter(commands)

    const error = await expectSafeVerificationFailure(
      adapter.verify(verifyInput({ signal: controller.signal })),
      [privateReason],
    )

    expect(error.message).toBe('Docker image verification failed: aborted')
    expect(commands.calls).toHaveLength(1)
    expect(commands.calls[0]?.options.signal).toBe(controller.signal)
    expect(temporary.rmCalls).toHaveLength(1)
  })
})
