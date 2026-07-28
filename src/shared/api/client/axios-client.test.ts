import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing'

import { ApiProblemError } from './api-errors'
import { clearCsrfToken } from './csrf-token'
import { healthReady, healthStartup } from '../generated/health/health'
import { apiMutator } from './orval-mutator'

const apiOrigin = 'http://localhost:3000'

describe('credentialed Axios transport', () => {
  beforeEach(clearCsrfToken)

  it('sends credentials and exempts login from CSRF fetching', async () => {
    let csrfRequests = 0
    let credentials: RequestCredentials | undefined
    let csrfHeader: string | null = 'unexpected'

    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-from-endpoint' })
      }),
      http.post(`${apiOrigin}/v1/auth/login`, ({ request }) => {
        credentials = request.credentials
        csrfHeader = request.headers.get('X-CSRF-Token')
        return HttpResponse.json({
          csrfToken: 'A'.repeat(43),
          session: {
            publicId: 'AbCdEfGhIjKlMnOpQrStUv',
            absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
          },
        })
      }),
    )

    await apiMutator({
      url: '/v1/auth/login',
      method: 'POST',
      data: { email: 'admin@example.com', password: 'secret' },
    })

    expect(credentials).toBe('include')
    expect(csrfHeader).toBeNull()
    expect(csrfRequests).toBe(0)
  })

  it('fetches CSRF once and attaches valid JSON to unsafe requests', async () => {
    let csrfRequests = 0
    const csrfHeaders: Array<string | null> = []
    const contentTypes: Array<string | null> = []
    const requestBodies: string[] = []

    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-from-endpoint' })
      }),
      http.post(`${apiOrigin}/v1/auth/logout`, async ({ request }) => {
        csrfHeaders.push(request.headers.get('X-CSRF-Token'))
        contentTypes.push(request.headers.get('Content-Type'))
        requestBodies.push(await request.text())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await Promise.all([
      apiMutator<void>({ url: '/v1/auth/logout', method: 'POST' }),
      apiMutator<void>({ url: '/v1/auth/logout', method: 'POST' }),
    ])

    expect(csrfRequests).toBe(1)
    expect(csrfHeaders).toEqual(['csrf-from-endpoint', 'csrf-from-endpoint'])
    expect(contentTypes).toEqual([
      expect.stringContaining('application/json'),
      expect.stringContaining('application/json'),
    ])
    expect(requestBodies).toEqual(['{}', '{}'])
  })

  it('does not fetch or attach CSRF for safe requests', async () => {
    let csrfRequests = 0
    let csrfHeader: string | null = 'unexpected'

    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-from-endpoint' })
      }),
      http.get(`${apiOrigin}/v1/auth/me`, ({ request }) => {
        csrfHeader = request.headers.get('X-CSRF-Token')
        return HttpResponse.json({
          userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
          normalizedEmail: 'admin@example.com',
          roleKeys: ['admin'],
          permissions: [],
        })
      }),
    )

    await apiMutator({ url: '/v1/auth/me', method: 'GET' })

    expect(csrfRequests).toBe(0)
    expect(csrfHeader).toBeNull()
  })

  it('throws the normalized problem instead of a raw Axios error', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/dependency-unavailable',
            title: 'Dependency unavailable',
            status: 503,
            detail: 'Redis details must not reach the UI.',
            instance: 'urn:request:request-503',
            code: 'DEPENDENCY_UNAVAILABLE',
            requestId: 'request-503',
          },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    const failure = apiMutator({ url: '/v1/auth/me', method: 'GET' })

    await expect(failure).rejects.toBeInstanceOf(ApiProblemError)
    await expect(failure).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      requestId: 'request-503',
    })
  })

  it('returns declared operational health 503 bodies as data', async () => {
    const readiness = {
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'up' },
    }
    const startup = { status: 'starting' }
    server.use(
      http.get(`${apiOrigin}/health/ready`, () =>
        HttpResponse.json(readiness, { status: 503 }),
      ),
      http.get(`${apiOrigin}/health/startup`, () =>
        HttpResponse.json(startup, { status: 503 }),
      ),
    )

    await expect(healthReady()).resolves.toEqual(readiness)
    await expect(healthStartup()).resolves.toEqual(startup)
  })

  it('normalizes a health problem document instead of returning it as data', async () => {
    server.use(
      http.get(`${apiOrigin}/health/ready`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/dependency-unavailable',
            title: 'Dependency unavailable',
            status: 503,
            detail: 'The readiness dependency is unavailable.',
            instance: 'urn:request:health-problem',
            code: 'DEPENDENCY_UNAVAILABLE',
            requestId: 'health-problem',
          },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    await expect(healthReady()).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      requestId: 'health-problem',
    })
  })

  it('preserves an explicit caller validateStatus policy', async () => {
    const unavailable = { status: 'unavailable' }
    server.use(
      http.get(`${apiOrigin}/custom-health`, () =>
        HttpResponse.json(unavailable, { status: 503 }),
      ),
    )

    await expect(
      apiMutator<typeof unavailable>(
        { url: '/custom-health', method: 'GET' },
        { validateStatus: null },
      ),
    ).resolves.toEqual(unavailable)
  })
})
