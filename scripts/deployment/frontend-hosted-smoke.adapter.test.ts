// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FrontendHostedSmokeAdapter,
  FrontendHostedSmokeError,
} from './frontend-hosted-smoke.adapter.ts'

const apiProbePath = '/v1/__frontend_deployment_probe__'
const baseUrl = 'https://stage.example.test'
const frontendHealthPath = '/_frontend/health'
const frontendIdentityPath = '/_frontend/identity'
const expectedRuntime = Object.freeze({
  image: Object.freeze({
    imageRef: 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64),
    revision: '1'.repeat(40),
  }),
  repository: 'example/react-starter',
})

interface RecordedFetch {
  readonly input: string | URL | Request
  readonly init?: RequestInit
}

type FetchHandler = (
  input: string | URL | Request,
  init?: RequestInit,
) => Response | Promise<Response>

function recordingFetch(handler: FetchHandler): {
  readonly calls: RecordedFetch[]
  readonly fetch: typeof fetch
} {
  const calls: RecordedFetch[] = []

  return {
    calls,
    fetch: (async (input, init) => {
      calls.push({ input, init })
      return await handler(input, init)
    }) as typeof fetch,
  }
}

function healthResponse(body = 'ok\n', init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'private, no-store')
  }
  return new Response(body, { ...init, headers, status: init.status ?? 200 })
}

function htmlResponse(
  body = '<!doctype html><div id="root"></div>',
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/html; charset=utf-8')
  }
  return new Response(body, { ...init, headers, status: init.status ?? 200 })
}

function identityResponse(
  body = `https://github.com/example/react-starter\n${'1'.repeat(40)}\n`,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'private, no-store')
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/plain; charset=utf-8')
  }
  return new Response(body, { ...init, headers, status: init.status ?? 200 })
}

function apiProbeResponse(
  body = '{"type":"about:blank"}',
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/problem+json')
  }
  return new Response(body, { ...init, headers, status: init.status ?? 404 })
}

function successfulRoutes(
  overrides: Readonly<Record<string, FetchHandler>> = {},
): ReturnType<typeof recordingFetch> {
  return recordingFetch(async (input, init) => {
    const path = new URL(input.toString()).pathname
    const override = overrides[path]
    if (override !== undefined) {
      return await override(input, init)
    }
    if (path === frontendHealthPath) {
      return healthResponse()
    }
    if (path === frontendIdentityPath) {
      return identityResponse()
    }
    if (path === apiProbePath) {
      return apiProbeResponse()
    }
    return htmlResponse()
  })
}

async function expectSafeSmokeFailure(
  promise: Promise<unknown>,
  forbiddenValues: readonly string[] = [],
): Promise<FrontendHostedSmokeError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(FrontendHostedSmokeError)
    const rendered = String(error)
    const serialized = JSON.stringify(error)
    for (const forbidden of forbiddenValues) {
      expect(rendered).not.toContain(forbidden)
      expect(serialized).not.toContain(forbidden)
    }
    return error as FrontendHostedSmokeError
  }

  throw new Error('Expected FrontendHostedSmokeError')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FrontendHostedSmokeAdapter', () => {
  it('checks each mandatory and configured public route once without credentials', async () => {
    const fake = successfulRoutes()
    const timeout = vi.spyOn(AbortSignal, 'timeout')

    const result = await new FrontendHostedSmokeAdapter({
      fetchImplementation: fake.fetch,
    }).verify(
      `${baseUrl}/`,
      [
        '/login',
        '/dashboard',
        '/',
        frontendHealthPath,
        frontendIdentityPath,
        apiProbePath,
      ],
      expectedRuntime,
    )

    expect(result).toEqual({
      apiProbeStatus: 404,
      checkedPaths: [
        frontendHealthPath,
        frontendIdentityPath,
        '/',
        '/login',
        '/dashboard',
        apiProbePath,
      ],
      frontendRevision: '1'.repeat(40),
    })
    expect(
      fake.calls.map(({ input }) => new URL(input.toString()).pathname),
    ).toEqual(result.checkedPaths)
    expect(timeout.mock.calls).toEqual([
      [10_000],
      [10_000],
      [10_000],
      [10_000],
      [10_000],
      [10_000],
    ])
    for (const call of fake.calls) {
      const headers = new Headers(call.init?.headers)
      expect(call.init).toMatchObject({
        credentials: 'omit',
        method: 'GET',
        redirect: 'error',
      })
      expect(call.init?.body).toBeUndefined()
      expect(call.init?.signal).toBeInstanceOf(AbortSignal)
      expect(headers.has('authorization')).toBe(false)
      expect(headers.has('cookie')).toBe(false)
    }
  })

  it.each([
    ['plain HTTP', 'http://stage.example.test'],
    [
      'embedded credentials',
      'https://private-user:private-password@stage.example.test',
    ],
    ['path', 'https://stage.example.test/app'],
    ['literal dot segments', 'https://stage.example.test/release/..'],
    ['encoded dot segments', 'https://stage.example.test/release/%2e%2e'],
    ['query', 'https://stage.example.test?token=private-query'],
    ['fragment', 'https://stage.example.test#private-fragment'],
  ])('rejects a base URL with %s before fetch', async (_name, invalidUrl) => {
    const fake = successfulRoutes()

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(invalidUrl, ['/dashboard'], expectedRuntime),
      [
        invalidUrl,
        'private-user',
        'private-password',
        'private-query',
        'private-fragment',
      ],
    )

    expect(error).toMatchObject({
      path: 'publicBaseUrl',
      rule: 'base_url',
    })
    expect(error.status).toBeUndefined()
    expect(fake.calls).toHaveLength(0)
  })

  it('rejects a duplicate configured path before fetch', async () => {
    const fake = successfulRoutes()

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard', '/dashboard'], expectedRuntime),
    )

    expect(error).toMatchObject({
      path: '/dashboard',
      rule: 'duplicate_path',
    })
    expect(fake.calls).toHaveLength(0)
  })

  it.each(['/dashboard?private=query', '//other.example.test/path', 'login'])(
    'rejects unsafe configured path %s before fetch',
    async (path) => {
      const fake = successfulRoutes()

      const error = await expectSafeSmokeFailure(
        new FrontendHostedSmokeAdapter({
          fetchImplementation: fake.fetch,
        }).verify(baseUrl, [path], expectedRuntime),
        [path],
      )

      expect(error).toMatchObject({
        path: 'smokePaths',
        rule: 'invalid_path',
      })
      expect(fake.calls).toHaveLength(0)
    },
  )

  it.each([
    [
      'status',
      () => healthResponse('private-health-body', { status: 503 }),
      'health_status',
      503,
    ],
    [
      'body',
      () => healthResponse('private-health-body'),
      'health_body',
      undefined,
    ],
    [
      'cache policy',
      () =>
        healthResponse('ok\n', {
          headers: { 'cache-control': 'public, max-age=60' },
        }),
      'health_cache_control',
      undefined,
    ],
  ] as const)(
    'rejects invalid frontend health %s without exposing its body',
    async (_name, response, rule, status) => {
      const privateBody = 'private-health-body'
      const fake = successfulRoutes({
        [frontendHealthPath]: () => response(),
      })

      const error = await expectSafeSmokeFailure(
        new FrontendHostedSmokeAdapter({
          fetchImplementation: fake.fetch,
        }).verify(baseUrl, ['/dashboard'], expectedRuntime),
        [privateBody],
      )

      expect(error).toMatchObject({
        path: frontendHealthPath,
        rule,
        ...(status === undefined ? {} : { status }),
      })
      expect(fake.calls).toHaveLength(1)
    },
  )

  it.each([
    [
      'status',
      () => identityResponse('private-identity-body', { status: 404 }),
      'identity_status',
      404,
    ],
    [
      'cache policy',
      () =>
        identityResponse(undefined, {
          headers: { 'cache-control': 'public, max-age=60' },
        }),
      'identity_cache_control',
      undefined,
    ],
    [
      'content type',
      () =>
        identityResponse(undefined, {
          headers: { 'content-type': 'application/json' },
        }),
      'identity_content_type',
      undefined,
    ],
    [
      'revision',
      () =>
        identityResponse(
          `https://github.com/example/react-starter\n${'2'.repeat(40)}\n`,
        ),
      'identity_body',
      undefined,
    ],
  ] as const)(
    'rejects invalid frontend identity %s without exposing its body',
    async (_name, response, rule, status) => {
      const fake = successfulRoutes({
        [frontendIdentityPath]: () => response(),
      })

      const error = await expectSafeSmokeFailure(
        new FrontendHostedSmokeAdapter({
          fetchImplementation: fake.fetch,
        }).verify(baseUrl, ['/dashboard'], expectedRuntime),
        ['private-identity-body'],
      )

      expect(error).toMatchObject({
        path: frontendIdentityPath,
        rule,
        ...(status === undefined ? {} : { status }),
      })
      expect(fake.calls).toHaveLength(2)
    },
  )

  it.each([
    [
      'status',
      () => htmlResponse('private-ui-body', { status: 404 }),
      'ui_status',
      404,
    ],
    [
      'content type',
      () =>
        htmlResponse('<div id="root"></div>', {
          headers: { 'content-type': 'application/json' },
        }),
      'ui_content_type',
      undefined,
    ],
    ['app root', () => htmlResponse('private-ui-body'), 'ui_root', undefined],
  ] as const)(
    'rejects an invalid UI %s without exposing its body',
    async (_name, response, rule, status) => {
      const privateBody = 'private-ui-body'
      const fake = successfulRoutes({
        '/': () => response(),
      })

      const error = await expectSafeSmokeFailure(
        new FrontendHostedSmokeAdapter({
          fetchImplementation: fake.fetch,
        }).verify(baseUrl, ['/dashboard'], expectedRuntime),
        [privateBody],
      )

      expect(error).toMatchObject({
        path: '/',
        rule,
        ...(status === undefined ? {} : { status }),
      })
      expect(fake.calls).toHaveLength(3)
    },
  )

  it.each([
    [
      'non-4xx status',
      () => apiProbeResponse('private-api-body', { status: 500 }),
      'api_status',
      500,
    ],
    [
      'HTML content type',
      () =>
        apiProbeResponse('private-api-body', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      'api_content_type',
      undefined,
    ],
    [
      'frontend plain-text fallback',
      () =>
        apiProbeResponse('Not Found\n', {
          headers: { 'content-type': 'text/plain' },
        }),
      'api_content_type',
      undefined,
    ],
    [
      'frontend app root',
      () => apiProbeResponse('<div id="root">private-api-body</div>'),
      'api_root',
      undefined,
    ],
  ] as const)(
    'rejects an API probe with %s without exposing its body',
    async (_name, response, rule, status) => {
      const privateBody = 'private-api-body'
      const fake = successfulRoutes({
        [apiProbePath]: () => response(),
      })

      const error = await expectSafeSmokeFailure(
        new FrontendHostedSmokeAdapter({
          fetchImplementation: fake.fetch,
        }).verify(baseUrl, ['/dashboard'], expectedRuntime),
        [privateBody],
      )

      expect(error).toMatchObject({
        path: apiProbePath,
        rule,
        ...(status === undefined ? {} : { status }),
      })
      expect(fake.calls).toHaveLength(6)
    },
  )

  it('rejects a redirect response without following it', async () => {
    const fake = successfulRoutes({
      '/': () =>
        new Response('private-redirect-body', {
          headers: { location: 'https://other.example.test/private' },
          status: 302,
        }),
    })

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime),
      ['private-redirect-body', 'other.example.test'],
    )

    expect(error).toMatchObject({
      path: '/',
      rule: 'response_redirect',
      status: 302,
    })
    expect(fake.calls).toHaveLength(3)
    expect(fake.calls[2]?.init?.redirect).toBe('error')
  })

  it('redacts a TLS or transport failure and does not retry it', async () => {
    const privateTransportReason = 'private-tls-transport-reason'
    const fake = recordingFetch(() => {
      throw new TypeError(privateTransportReason)
    })

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime),
      [privateTransportReason],
    )

    expect(error).toMatchObject({
      path: frontendHealthPath,
      rule: 'transport',
    })
    expect(fake.calls).toHaveLength(1)
  })

  it('times out one request including its body read without retrying', async () => {
    const privateTimeoutReason = 'private-body-timeout-reason'
    const fake = successfulRoutes({
      [frontendHealthPath]: (_input, init) => {
        const response = healthResponse()
        vi.spyOn(response, 'text').mockImplementation(
          async () =>
            await new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new Error(privateTimeoutReason)),
                { once: true },
              )
            }),
        )
        return response
      },
    })

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
        timeoutMs: 1,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime),
      [privateTimeoutReason],
    )

    expect(error).toMatchObject({
      path: frontendHealthPath,
      rule: 'request_timeout',
    })
    expect(fake.calls).toHaveLength(1)
  })

  it('distinguishes an external abort during body read from timeout', async () => {
    const controller = new AbortController()
    const privateAbortReason = 'private-external-abort-reason'
    const fake = successfulRoutes({
      [frontendHealthPath]: (_input, init) => {
        const response = healthResponse()
        vi.spyOn(response, 'text').mockImplementation(async () => {
          if (init?.signal?.aborted) {
            throw init.signal.reason
          }
          return await new Promise<string>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(init.signal?.reason),
              { once: true },
            )
          })
        })
        queueMicrotask(() => controller.abort(new Error(privateAbortReason)))
        return response
      },
    })

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime, controller.signal),
      [privateAbortReason],
    )

    expect(error).toMatchObject({
      path: frontendHealthPath,
      rule: 'request_aborted',
    })
    expect(fake.calls).toHaveLength(1)
  })

  it('rejects an already aborted operation before fetch', async () => {
    const controller = new AbortController()
    controller.abort(new Error('private-pre-abort-reason'))
    const fake = successfulRoutes()

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime, controller.signal),
      ['private-pre-abort-reason'],
    )

    expect(error).toMatchObject({
      path: frontendHealthPath,
      rule: 'request_aborted',
    })
    expect(fake.calls).toHaveLength(0)
  })

  it('redacts a non-abort body stream failure', async () => {
    const privateBodyFailure = 'private-body-stream-failure'
    const fake = successfulRoutes({
      [frontendHealthPath]: () => {
        const response = healthResponse()
        vi.spyOn(response, 'text').mockRejectedValue(
          new Error(privateBodyFailure),
        )
        return response
      },
    })

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime),
      [privateBodyFailure],
    )

    expect(error).toMatchObject({
      path: frontendHealthPath,
      rule: 'response_body',
    })
  })

  it('serializes only fixed redacted diagnostics', async () => {
    const fake = successfulRoutes({
      [frontendHealthPath]: () =>
        healthResponse('private-health-body', { status: 503 }),
    })

    const error = await expectSafeSmokeFailure(
      new FrontendHostedSmokeAdapter({
        fetchImplementation: fake.fetch,
      }).verify(baseUrl, ['/dashboard'], expectedRuntime),
      ['private-health-body'],
    )

    expect(error.toJSON()).toEqual({
      message: 'Frontend hosted smoke failed',
      name: 'FrontendHostedSmokeError',
      path: frontendHealthPath,
      rule: 'health_status',
      status: 503,
    })
  })
})
