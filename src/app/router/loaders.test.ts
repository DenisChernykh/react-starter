import { describe, expect, it, vi } from 'vitest'

import { ApiNetworkError, ApiProblemError } from '@/shared/api'

import { createRequireSessionLoader } from './loaders'

const request = new Request('http://localhost/private?tab=1')

describe('protected route loader', () => {
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
