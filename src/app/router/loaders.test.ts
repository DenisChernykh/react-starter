import { describe, expect, it, vi } from 'vitest'

import { ApiNetworkError, ApiProblemError } from '@/shared/api'

import {
  createRedirectAuthenticatedLoader,
  createRequireSessionLoader,
} from './loaders'

const request = new Request('http://localhost/private?tab=1')

describe('protected route loader', () => {
  it('passes navigation cancellation to the protected session load', async () => {
    const controller = new AbortController()
    const navigationRequest = new Request('http://localhost/private', {
      signal: controller.signal,
    })
    const clear = vi.fn()
    const load = vi.fn(async (signal?: AbortSignal) => {
      if (signal !== navigationRequest.signal) {
        throw new Error('Session load did not receive the navigation signal')
      }
    })
    const loader = createRequireSessionLoader({ load, clear })

    await expect(
      loader({
        request: navigationRequest,
        params: {},
        context: {} as never,
      } as never),
    ).resolves.toBeNull()
    expect(clear).not.toHaveBeenCalled()
  })

  it('passes navigation cancellation to the login session load', async () => {
    const controller = new AbortController()
    const navigationRequest = new Request('http://localhost/login', {
      signal: controller.signal,
    })
    const load = vi.fn(async (signal?: AbortSignal) => {
      if (signal !== navigationRequest.signal) {
        throw new Error('Session load did not receive the navigation signal')
      }
    })
    const loader = createRedirectAuthenticatedLoader({ load })

    const response = await Promise.resolve(
      loader({
        request: navigationRequest,
        params: {},
        context: {} as never,
      } as never),
    ).catch((error: unknown) => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).headers.get('Location')).toBe('/')
  })

  it('does not clear authentication when an aborted load finishes with 401', async () => {
    const controller = new AbortController()
    const navigationRequest = new Request('http://localhost/private', {
      signal: controller.signal,
    })
    const authenticationError = new ApiProblemError(
      {
        type: 'https://example.test/problem',
        title: 'Authentication required',
        status: 401,
        detail: 'Authentication required',
        instance: 'urn:request:late-authentication-failure',
        code: 'AUTHENTICATION_REQUIRED',
        requestId: 'late-authentication-failure',
      },
      null,
    )
    let rejectLoad!: (error: unknown) => void
    const load = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectLoad = reject
        }),
    )
    const clear = vi.fn()
    const loader = createRequireSessionLoader({ load, clear })

    const result = loader({
      request: navigationRequest,
      params: {},
      context: {} as never,
    } as never)
    controller.abort()
    rejectLoad(authenticationError)

    await expect(result).rejects.toBe(authenticationError)
    expect(clear).not.toHaveBeenCalled()
  })

  it('redirects only AUTHENTICATION_REQUIRED and clears auth memory', async () => {
    const clear = vi.fn()
    const load = vi.fn().mockRejectedValue(
      new ApiProblemError(
        {
          type: 'https://example.test/problem',
          title: 'Authentication required',
          status: 401,
          detail: 'Authentication required',
          instance: 'urn:request:1',
          code: 'AUTHENTICATION_REQUIRED',
          requestId: '1',
        },
        null,
      ),
    )
    const loader = createRequireSessionLoader({ load, clear })

    const response = await Promise.resolve(
      loader({ request, params: {}, context: {} as never } as never),
    ).catch((error: unknown) => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
    expect((response as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fprivate%3Ftab%3D1',
    )
    expect(clear).toHaveBeenCalledOnce()
  })

  it.each([
    new ApiNetworkError(),
    new ApiProblemError(
      {
        type: 'https://example.test/problem',
        title: 'Forbidden',
        status: 403,
        detail: 'Forbidden',
        instance: 'urn:request:3',
        code: 'AUTHORIZATION_DENIED',
        requestId: '3',
      },
      null,
    ),
    new ApiProblemError(
      {
        type: 'https://example.test/problem',
        title: 'Unavailable',
        status: 503,
        detail: 'Unavailable',
        instance: 'urn:request:2',
        code: 'DEPENDENCY_UNAVAILABLE',
        requestId: '2',
      },
      null,
    ),
  ])('rethrows a non-authentication failure', async (error) => {
    const clear = vi.fn()
    const loader = createRequireSessionLoader({
      load: vi.fn().mockRejectedValue(error),
      clear,
    })

    await expect(
      loader({ request, params: {}, context: {} as never } as never),
    ).rejects.toBe(error)
    expect(clear).not.toHaveBeenCalled()
  })
})
