// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { verifyFrontendHttpContract } from './frontend-http-contract.ts'

const approvalRequestPath =
  '/approval-requests/00000000-0000-4000-8000-000000000001'
const assetPath = '/assets/index-a1b2c3d4.js'
const unversionedAssetPath = '/favicon.svg'
const html = `<html><body><div id="root"></div><script src="${assetPath}"></script></body></html>`

function response(
  body: string,
  init: ResponseInit,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    ...init,
    headers: {
      'referrer-policy': 'no-referrer',
      server: 'nginx',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...extraHeaders,
    },
  })
}

function successfulResponses(): Map<string, Response> {
  return new Map([
    [
      '/_frontend/health',
      response(
        'ok\n',
        { status: 200 },
        {
          'cache-control': 'no-store',
          'content-type': 'text/plain',
        },
      ),
    ],
    [
      '/',
      response(
        html,
        { status: 200 },
        { 'cache-control': 'no-cache', 'content-type': 'text/html' },
      ),
    ],
    [
      '/login',
      response(
        html,
        { status: 200 },
        { 'cache-control': 'no-cache', 'content-type': 'text/html' },
      ),
    ],
    [
      approvalRequestPath,
      response(
        html,
        { status: 200 },
        { 'cache-control': 'no-cache', 'content-type': 'text/html' },
      ),
    ],
    ...['/v10', '/v1-admin', '/healthcheck'].map(
      (path) =>
        [
          path,
          response(
            html,
            { status: 200 },
            { 'cache-control': 'no-cache', 'content-type': 'text/html' },
          ),
        ] as const,
    ),
    [
      assetPath,
      response(
        'console.log("asset")',
        { status: 200 },
        {
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': 'text/javascript',
        },
      ),
    ],
    [
      unversionedAssetPath,
      response(
        '<svg/>',
        { status: 200 },
        {
          'cache-control': 'no-cache',
          'content-type': 'image/svg+xml',
        },
      ),
    ],
    [
      '/v1',
      response('Not Found', { status: 404 }, { 'content-type': 'text/plain' }),
    ],
    [
      '/v1/__frontend_deployment_probe__',
      response('Not Found', { status: 404 }, { 'content-type': 'text/plain' }),
    ],
    [
      '/health',
      response('Not Found', { status: 404 }, { 'content-type': 'text/plain' }),
    ],
    [
      '/health/unknown',
      response('Not Found', { status: 404 }, { 'content-type': 'text/plain' }),
    ],
  ])
}

function createFetch(
  responses: ReadonlyMap<string, Response>,
  requests?: Array<{ readonly path: string; readonly init?: RequestInit }>,
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    requests?.push({ path: url.pathname, init })
    const found = responses.get(url.pathname)
    if (!found) {
      throw new Error(`Unexpected test path: ${url.pathname}`)
    }

    return found.clone()
  }) as typeof fetch
}

describe('verifyFrontendHttpContract', () => {
  it('verifies health, SPA routes, one discovered asset and backend boundaries', async () => {
    const requests: Array<{
      readonly path: string
      readonly init?: RequestInit
    }> = []

    await expect(
      verifyFrontendHttpContract(
        new URL('http://127.0.0.1:8080'),
        createFetch(successfulResponses(), requests),
      ),
    ).resolves.toBeUndefined()

    expect(requests.map(({ path }) => path)).toEqual([
      '/_frontend/health',
      '/',
      '/login',
      approvalRequestPath,
      assetPath,
      unversionedAssetPath,
      '/v1',
      '/v1/__frontend_deployment_probe__',
      '/health',
      '/health/unknown',
      '/v10',
      '/v1-admin',
      '/healthcheck',
    ])
    expect(
      requests.every(
        ({ init }) =>
          init?.redirect === 'error' && init.signal instanceof AbortSignal,
      ),
    ).toBe(true)
  })

  it.each([
    {
      name: 'HTML cache header',
      path: '/',
      replacement: response(
        html,
        { status: 200 },
        {
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': 'text/html',
        },
      ),
    },
    {
      name: 'server version disclosure',
      path: '/',
      replacement: response(
        html,
        { status: 200 },
        {
          'cache-control': 'no-cache',
          'content-type': 'text/html',
          server: 'nginx/1.29.5',
        },
      ),
    },
    {
      name: 'health body',
      path: '/_frontend/health',
      replacement: response(
        'wrong\n',
        { status: 200 },
        {
          'cache-control': 'no-store',
          'content-type': 'text/plain',
        },
      ),
    },
    {
      name: 'security header',
      path: '/',
      replacement: new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'referrer-policy': 'no-referrer',
          'x-frame-options': 'DENY',
        },
      }),
    },
    {
      name: 'route status',
      path: '/login',
      replacement: response(
        html,
        { status: 500 },
        {
          'content-type': 'text/html',
        },
      ),
    },
    {
      name: 'redirect status',
      path: approvalRequestPath,
      replacement: response('', { status: 302 }, { location: '/login' }),
    },
    {
      name: 'asset cache header',
      path: assetPath,
      replacement: response(
        'asset',
        { status: 200 },
        {
          'cache-control': 'no-cache',
          'content-type': 'text/javascript',
        },
      ),
    },
    {
      name: 'duplicate Nginx asset cache headers',
      path: assetPath,
      replacement: response(
        'asset',
        { status: 200 },
        {
          'cache-control':
            'max-age=31536000, public, max-age=31536000, immutable',
          'content-type': 'text/javascript',
        },
      ),
    },
    {
      name: 'unversioned public asset cache header',
      path: unversionedAssetPath,
      replacement: response(
        '<svg/>',
        { status: 200 },
        {
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': 'image/svg+xml',
        },
      ),
    },
    {
      name: 'backend HTML response',
      path: '/v1/__frontend_deployment_probe__',
      replacement: response(
        html,
        { status: 404 },
        {
          'content-type': 'text/html',
        },
      ),
    },
  ])(
    'rejects a wrong $name without including response data',
    async ({ path, replacement }) => {
      const responses = successfulResponses()
      responses.set(path, replacement)

      await expect(
        verifyFrontendHttpContract(
          new URL('http://127.0.0.1:8080'),
          createFetch(responses),
        ),
      ).rejects.toMatchObject({
        name: 'FrontendHttpContractError',
      })

      await expect(
        verifyFrontendHttpContract(
          new URL('http://127.0.0.1:8080'),
          createFetch(responses),
        ),
      ).rejects.not.toThrow('console.log')
    },
  )
})
