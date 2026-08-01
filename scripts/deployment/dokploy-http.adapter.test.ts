// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DokployContractError,
  DokployHttpAdapter,
} from './dokploy-http.adapter.ts'

const applicationId = 'app_123'
const apiKey = 'dokploy-private-api-key'
const baseUrl = 'https://dokploy.example.test'
const deploymentId = 'deployment_123'
const imageRef = 'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64)
const title = 'frontend:promote:' + '2'.repeat(40)

interface RecordedFetch {
  readonly input: string | URL | Request
  readonly init?: RequestInit
}

type FetchHandler = (
  input: string | URL | Request,
  init?: RequestInit,
) => Response | Promise<Response>

function recordingFetch(response: Response | FetchHandler): {
  readonly calls: RecordedFetch[]
  readonly fetch: typeof fetch
} {
  const calls: RecordedFetch[] = []

  return {
    calls,
    fetch: (async (input, init) => {
      calls.push({ input, init })
      return typeof response === 'function'
        ? await response(input, init)
        : response
    }) as typeof fetch,
  }
}

function applicationResponse(
  overrides: Record<string, unknown> = {},
): Response {
  return Response.json({
    applicationId,
    dockerImage: imageRef,
    sourceType: 'docker',
    ...overrides,
  })
}

function deploymentResponse(
  records: readonly Record<string, unknown>[] = [
    {
      deploymentId,
      status: 'done',
      title,
    },
  ],
): Response {
  return Response.json(records)
}

function noDelaySleep(): {
  readonly delays: number[]
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
} {
  const delays: number[] = []

  return {
    delays,
    sleep: async (milliseconds, signal) => {
      signal?.throwIfAborted()
      delays.push(milliseconds)
    },
  }
}

function createAdapter(
  fetchImplementation: typeof fetch,
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>,
): DokployHttpAdapter {
  return new DokployHttpAdapter({
    apiKey,
    baseUrl,
    fetchImplementation,
    sleep,
  })
}

async function expectSafeContractFailure(
  promise: Promise<unknown>,
  forbiddenValues: readonly string[] = [],
): Promise<DokployContractError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(DokployContractError)
    const rendered = String(error)
    const serialized = JSON.stringify(error)
    for (const forbidden of [
      apiKey,
      baseUrl,
      'x-api-key',
      ...forbiddenValues,
    ]) {
      expect(rendered).not.toContain(forbidden)
      expect(serialized).not.toContain(forbidden)
    }
    return error as DokployContractError
  }

  throw new Error('Expected DokployContractError')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DokployHttpAdapter', () => {
  it('reads and projects one application through the strict HTTPS request contract', async () => {
    const fake = recordingFetch(
      Response.json({
        applicationId,
        dockerImage: imageRef,
        privateUpstreamField: 'must-not-escape',
        sourceType: 'docker',
      }),
    )

    const application = await new DokployHttpAdapter({
      apiKey,
      baseUrl,
      fetchImplementation: fake.fetch,
    }).getApplication(applicationId)

    expect(application).toEqual({
      applicationId,
      dockerImage: imageRef,
      sourceType: 'docker',
    })
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.input.toString()).toBe(
      `${baseUrl}/api/application.one?applicationId=app_123`,
    )
    expect(fake.calls[0]?.init).toMatchObject({
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
      },
      method: 'GET',
      redirect: 'error',
    })
    expect(fake.calls[0]?.init?.body).toBeUndefined()
    expect(fake.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('accepts a null current image for a bootstrap application', async () => {
    const fake = recordingFetch(applicationResponse({ dockerImage: null }))

    await expect(
      createAdapter(fake.fetch).getApplication(applicationId),
    ).resolves.toEqual({
      applicationId,
      dockerImage: null,
      sourceType: 'docker',
    })
  })

  it('reads deployment records and returns only the safe projection', async () => {
    const fake = recordingFetch(
      deploymentResponse([
        {
          deploymentId,
          privateUpstreamField: 'must-not-escape',
          status: 'done',
          title,
        },
      ]),
    )

    const deployments = await createAdapter(fake.fetch).listDeployments(
      applicationId,
    )

    expect(deployments).toEqual([
      {
        deploymentId,
        status: 'done',
        title,
      },
    ])
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.input.toString()).toBe(
      `${baseUrl}/api/deployment.all?applicationId=app_123`,
    )
    expect(fake.calls[0]?.init).toMatchObject({
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
      },
      method: 'GET',
      redirect: 'error',
    })
  })

  it('retries transient GET transport failures after 250ms and 500ms only', async () => {
    let attempt = 0
    const privateTransportReason = 'private-transport-reason'
    const fake = recordingFetch(() => {
      attempt += 1
      if (attempt < 3) {
        throw new TypeError(privateTransportReason)
      }
      return applicationResponse()
    })
    const sleeper = noDelaySleep()

    await expect(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
    ).resolves.toEqual({
      applicationId,
      dockerImage: imageRef,
      sourceType: 'docker',
    })

    expect(fake.calls).toHaveLength(3)
    expect(sleeper.delays).toEqual([250, 500])
  })

  it('retries transient GET 5xx responses and keeps the final status redacted', async () => {
    const privateBody = 'private-upstream-5xx'
    const fake = recordingFetch(
      () => new Response(privateBody, { status: 503 }),
    )
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).listDeployments(applicationId),
      [privateBody],
    )

    expect(error).toMatchObject({
      category: 'response_status',
      operation: 'deployment.all',
      status: 503,
    })
    expect(fake.calls).toHaveLength(3)
    expect(sleeper.delays).toEqual([250, 500])
  })

  it('does not retry a GET 4xx response', async () => {
    const fake = recordingFetch(
      new Response('private-client-error', { status: 401 }),
    )
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
      ['private-client-error'],
    )

    expect(error).toMatchObject({
      category: 'response_status',
      operation: 'application.one',
      status: 401,
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it('retries each timed out GET with a fresh 10-second request timeout', async () => {
    const timeoutSignal = AbortSignal.abort(
      new DOMException('private-timeout-reason', 'TimeoutError'),
    )
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutSignal)
    const fake = recordingFetch((_input, init) => {
      throw init?.signal?.reason
    })
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
      ['private-timeout-reason'],
    )

    expect(error).toMatchObject({
      category: 'request_timeout',
      operation: 'application.one',
    })
    expect(error.status).toBeUndefined()
    expect(timeout).toHaveBeenCalledTimes(3)
    expect(timeout).toHaveBeenNthCalledWith(1, 10_000)
    expect(timeout).toHaveBeenNthCalledWith(2, 10_000)
    expect(timeout).toHaveBeenNthCalledWith(3, 10_000)
    expect(fake.calls).toHaveLength(3)
    expect(sleeper.delays).toEqual([250, 500])
  })

  it('retries a GET timeout that happens while reading the JSON body', async () => {
    const privateTimeoutReason = 'private-body-timeout-reason'
    const timeoutSignal = AbortSignal.abort(
      new DOMException(privateTimeoutReason, 'TimeoutError'),
    )
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal)
    const fake = recordingFetch(() => {
      const response = applicationResponse()
      vi.spyOn(response, 'json').mockRejectedValue(timeoutSignal.reason)
      return response
    })
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
      [privateTimeoutReason],
    )

    expect(error).toMatchObject({
      category: 'request_timeout',
      operation: 'application.one',
    })
    expect(fake.calls).toHaveLength(3)
    expect(sleeper.delays).toEqual([250, 500])
  })

  it('does not retry an externally aborted GET', async () => {
    const controller = new AbortController()
    controller.abort('private-external-abort')
    const fake = recordingFetch((_input, init) => {
      throw init?.signal?.reason
    })
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(
        applicationId,
        controller.signal,
      ),
      ['private-external-abort'],
    )

    expect(error).toMatchObject({
      category: 'request_aborted',
      operation: 'application.one',
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it('does not retry an external abort while reading the JSON body', async () => {
    const controller = new AbortController()
    const privateAbortReason = 'private-body-abort-reason'
    const fake = recordingFetch(() => {
      const response = applicationResponse()
      vi.spyOn(response, 'json').mockImplementation(async () => {
        controller.abort(privateAbortReason)
        throw controller.signal.reason
      })
      return response
    })
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(
        applicationId,
        controller.signal,
      ),
      [privateAbortReason],
    )

    expect(error).toMatchObject({
      category: 'request_aborted',
      operation: 'application.one',
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it('stops a GET retry when the external signal aborts during the delay', async () => {
    const controller = new AbortController()
    const privateTransportReason = 'private-transport-during-abort'
    const fake = recordingFetch(() => {
      throw new TypeError(privateTransportReason)
    })
    const delays: number[] = []
    const sleep = async (
      milliseconds: number,
      signal?: AbortSignal,
    ): Promise<void> => {
      delays.push(milliseconds)
      controller.abort('private-sleep-abort')
      signal?.throwIfAborted()
    }

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleep).getApplication(
        applicationId,
        controller.signal,
      ),
      [privateTransportReason, 'private-sleep-abort'],
    )

    expect(error).toMatchObject({
      category: 'request_aborted',
      operation: 'application.one',
    })
    expect(fake.calls).toHaveLength(1)
    expect(delays).toEqual([250])
  })

  it.each([
    ['missing applicationId', { dockerImage: imageRef, sourceType: 'docker' }],
    [
      'mismatched applicationId',
      {
        applicationId: 'app_other',
        dockerImage: imageRef,
        sourceType: 'docker',
      },
    ],
    [
      'wrong sourceType',
      { applicationId, dockerImage: imageRef, sourceType: 1 },
    ],
    [
      'wrong dockerImage',
      { applicationId, dockerImage: { private: true }, sourceType: 'docker' },
    ],
  ])('rejects an application with %s without retrying', async (_name, body) => {
    const fake = recordingFetch(Response.json(body))
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
    )

    expect(error).toMatchObject({
      category: 'response_shape',
      operation: 'application.one',
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it.each([
    ['a non-array body', { deploymentId, status: 'done', title }],
    ['a non-object record', [null]],
    [
      'a missing field',
      [{ deploymentId, status: 'done', privateTitle: title }],
    ],
    ['a wrong field type', [{ deploymentId, status: 1, title }]],
    [
      'duplicate deployment IDs',
      [
        { deploymentId, status: 'done', title },
        {
          deploymentId,
          status: 'running',
          title: 'frontend:promote:' + '3'.repeat(40),
        },
      ],
    ],
  ])('rejects deployment.all with %s without retrying', async (_name, body) => {
    const fake = recordingFetch(Response.json(body))
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).listDeployments(applicationId),
    )

    expect(error).toMatchObject({
      category: 'response_shape',
      operation: 'deployment.all',
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it.each([
    [
      'invalid JSON',
      new Response('{private-invalid-json', {
        headers: { 'content-type': 'application/json' },
      }),
    ],
    [
      'a non-JSON media type',
      new Response(
        JSON.stringify({
          applicationId,
          dockerImage: imageRef,
          sourceType: 'docker',
        }),
        {
          headers: { 'content-type': 'text/plain' },
        },
      ),
    ],
  ])('rejects %s without retrying', async (_name, response) => {
    const fake = recordingFetch(response)
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
      ['private-invalid-json'],
    )

    expect(error).toMatchObject({
      category: 'response_json',
      operation: 'application.one',
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it('rejects redirects without retrying', async () => {
    const fake = recordingFetch(
      new Response(null, {
        headers: { location: 'https://private-redirect.example.test' },
        status: 302,
      }),
    )
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
      ['private-redirect.example.test'],
    )

    expect(error).toMatchObject({
      category: 'response_redirect',
      operation: 'application.one',
      status: 302,
    })
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it('does not retry the pinned Node 24 native redirect rejection', async () => {
    const nativeRedirectRejection = new TypeError('fetch failed', {
      cause: new Error('unexpected redirect'),
    })
    const fake = recordingFetch(() => {
      throw nativeRedirectRejection
    })
    const sleeper = noDelaySleep()

    const error = await expectSafeContractFailure(
      createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
      ['fetch failed', 'unexpected redirect'],
    )

    expect(error).toMatchObject({
      category: 'response_redirect',
      operation: 'application.one',
    })
    expect(error.status).toBeUndefined()
    expect(fake.calls).toHaveLength(1)
    expect(sleeper.delays).toEqual([])
  })

  it.each([
    [
      'own',
      () =>
        Object.assign(new Error('unexpected redirect'), {
          code: 'ECONNRESET',
        }),
    ],
    [
      'inherited',
      () => {
        const cause = new Error('unexpected redirect')
        const codedPrototype = Object.create(Error.prototype, {
          code: {
            value: 'ECONNRESET',
          },
        }) as Error
        Object.setPrototypeOf(cause, codedPrototype)
        return cause
      },
    ],
  ])(
    'keeps a matching rejection with an %s cause code retryable as transport',
    async (_codeLocation, createCause) => {
      const codedTransportRejection = new TypeError('fetch failed', {
        cause: createCause(),
      })
      const fake = recordingFetch(() => {
        throw codedTransportRejection
      })
      const sleeper = noDelaySleep()

      const error = await expectSafeContractFailure(
        createAdapter(fake.fetch, sleeper.sleep).getApplication(applicationId),
        ['fetch failed', 'unexpected redirect', 'ECONNRESET'],
      )

      expect(error).toMatchObject({
        category: 'transport',
        operation: 'application.one',
      })
      expect(error.status).toBeUndefined()
      expect(fake.calls).toHaveLength(3)
      expect(sleeper.delays).toEqual([250, 500])
    },
  )

  it.each([
    'http://dokploy.example.test',
    'https://private-user:private-password@dokploy.example.test',
  ])('rejects an unsafe base URL before fetch: %s', async (unsafeBaseUrl) => {
    const fake = recordingFetch(applicationResponse())
    const adapter = () =>
      new DokployHttpAdapter({
        apiKey,
        baseUrl: unsafeBaseUrl,
        fetchImplementation: fake.fetch,
      })

    expect(adapter).toThrow(DokployContractError)
    try {
      adapter()
    } catch (error) {
      expect(error).toMatchObject({
        category: 'base_url',
        operation: 'configuration',
      })
      expect(String(error)).not.toContain(unsafeBaseUrl)
      expect(JSON.stringify(error)).not.toContain(unsafeBaseUrl)
    }
    expect(fake.calls).toHaveLength(0)
  })

  it('updates only the exact application image with one POST', async () => {
    const fake = recordingFetch(Response.json({}))

    await expect(
      createAdapter(fake.fetch).updateImage(applicationId, imageRef),
    ).resolves.toBeUndefined()

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.input.toString()).toBe(
      `${baseUrl}/api/application.update`,
    )
    expect(fake.calls[0]?.init).toMatchObject({
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      method: 'POST',
      redirect: 'error',
    })
    expect(fake.calls[0]?.init?.body).toBe(
      JSON.stringify({
        applicationId,
        dockerImage: imageRef,
      }),
    )
    expect(fake.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('deploys with only application ID, title and description in one POST', async () => {
    const fake = recordingFetch(Response.json({}))
    const description = 'Promote an approved immutable frontend digest'

    await expect(
      createAdapter(fake.fetch).deploy({
        applicationId,
        description,
        title,
      }),
    ).resolves.toBeUndefined()

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.input.toString()).toBe(
      `${baseUrl}/api/application.deploy`,
    )
    expect(fake.calls[0]?.init).toMatchObject({
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      method: 'POST',
      redirect: 'error',
    })
    expect(fake.calls[0]?.init?.body).toBe(
      JSON.stringify({
        applicationId,
        title,
        description,
      }),
    )
    expect(fake.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each(['updateImage', 'deploy'] as const)(
    'does not retry %s after a 500 response',
    async (mutation) => {
      const privateBody = 'private-mutation-500'
      const fake = recordingFetch(new Response(privateBody, { status: 500 }))
      const sleeper = noDelaySleep()
      const adapter = createAdapter(fake.fetch, sleeper.sleep)
      const promise =
        mutation === 'updateImage'
          ? adapter.updateImage(applicationId, imageRef)
          : adapter.deploy({
              applicationId,
              description: 'Promote approved digest',
              title,
            })

      const error = await expectSafeContractFailure(promise, [privateBody])

      expect(error).toMatchObject({
        category: 'response_status',
        operation:
          mutation === 'updateImage'
            ? 'application.update'
            : 'application.deploy',
        status: 500,
      })
      expect(fake.calls).toHaveLength(1)
      expect(sleeper.delays).toEqual([])
    },
  )

  it.each(['updateImage', 'deploy'] as const)(
    'does not retry %s after its single 10-second request timeout',
    async (mutation) => {
      const timeoutSignal = AbortSignal.abort(
        new DOMException('private-mutation-timeout', 'TimeoutError'),
      )
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(timeoutSignal)
      const fake = recordingFetch((_input, init) => {
        throw init?.signal?.reason
      })
      const sleeper = noDelaySleep()
      const adapter = createAdapter(fake.fetch, sleeper.sleep)
      const promise =
        mutation === 'updateImage'
          ? adapter.updateImage(applicationId, imageRef)
          : adapter.deploy({
              applicationId,
              description: 'Promote approved digest',
              title,
            })

      const error = await expectSafeContractFailure(promise, [
        'private-mutation-timeout',
      ])

      expect(error).toMatchObject({
        category: 'request_timeout',
        operation:
          mutation === 'updateImage'
            ? 'application.update'
            : 'application.deploy',
      })
      expect(timeout).toHaveBeenCalledOnce()
      expect(timeout).toHaveBeenCalledWith(10_000)
      expect(fake.calls).toHaveLength(1)
      expect(sleeper.delays).toEqual([])
    },
  )

  it.each(['updateImage', 'deploy'] as const)(
    'does not retry %s when success is not a plain empty object',
    async (mutation) => {
      const privateBodyField = 'private-mutation-response'
      const fake = recordingFetch(Response.json({ privateBodyField }))
      const sleeper = noDelaySleep()
      const adapter = createAdapter(fake.fetch, sleeper.sleep)
      const promise =
        mutation === 'updateImage'
          ? adapter.updateImage(applicationId, imageRef)
          : adapter.deploy({
              applicationId,
              description: 'Promote approved digest',
              title,
            })

      const error = await expectSafeContractFailure(promise, [privateBodyField])

      expect(error).toMatchObject({
        category: 'response_shape',
        operation:
          mutation === 'updateImage'
            ? 'application.update'
            : 'application.deploy',
      })
      expect(fake.calls).toHaveLength(1)
      expect(sleeper.delays).toEqual([])
    },
  )
})
