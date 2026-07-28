import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { ProblemDocumentLike } from './api-errors'
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  normalizeApiError,
} from './api-errors'

const problem = {
  type: 'https://nest-js-starter.invalid/problems/rate-limit-exceeded',
  title: 'Rate limit exceeded',
  status: 429,
  detail: 'Too many requests.',
  instance: 'urn:request:request-1',
  code: 'RATE_LIMIT_EXCEEDED',
  requestId: 'request-1',
}

function axiosFailure(data: unknown, contentType: string, retryAfter?: string) {
  const headers = new AxiosHeaders({ 'content-type': contentType })
  if (retryAfter !== undefined) headers.set('retry-after', retryAfter)

  return new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      config: { headers: new AxiosHeaders() },
      data,
      headers,
      status: 429,
      statusText: 'Too Many Requests',
    },
  )
}

describe('normalizeApiError', () => {
  it('preserves the RFC 9457 code, status, request ID, and Retry-After', () => {
    const error = normalizeApiError(
      axiosFailure(problem, 'application/problem+json; charset=utf-8', '12'),
    )

    expect(error).toBeInstanceOf(ApiProblemError)
    expect(error).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429,
      requestId: 'request-1',
      retryAfterMs: 12_000,
    })
  })

  it.each([
    [problem, 'application/json'],
    [{ ...problem, requestId: undefined }, 'application/problem+json'],
    [
      { ...problem, code: 'UNDECLARED_PROBLEM_CODE' },
      'application/problem+json',
    ],
  ])('maps an invalid problem response to a protocol error', (data, type) => {
    expect(normalizeApiError(axiosFailure(data, type))).toBeInstanceOf(
      ApiProtocolError,
    )
  })

  it('maps a response-less Axios failure to a network error', () => {
    expect(normalizeApiError(new AxiosError('offline'))).toBeInstanceOf(
      ApiNetworkError,
    )
  })

  it('accepts a future HTTP date Retry-After value', () => {
    const now = Date.UTC(2030, 0, 1, 0, 0, 0)
    const error = normalizeApiError(
      axiosFailure(
        problem,
        'application/problem+json',
        'Tue, 01 Jan 2030 00:00:05 GMT',
      ),
      now,
    )

    expect(error).toMatchObject({ retryAfterMs: 5_000 })
  })

  it.each(['-1', '0.5', 'not-a-date', 'Mon, 31 Dec 2029 23:59:59 GMT'])(
    'maps an invalid Retry-After value to null: %s',
    (retryAfter) => {
      const error = normalizeApiError(
        axiosFailure(problem, 'application/problem+json', retryAfter),
        Date.UTC(2030, 0, 1, 0, 0, 0),
      )

      expect(error).toMatchObject({ retryAfterMs: null })
    },
  )
})

type GeneratedProblem = ProblemDocumentLike & {
  code: 'AUTHENTICATION_REQUIRED' | 'DEPENDENCY_UNAVAILABLE'
}

const preserveProblemType = (error: ApiProblemError<GeneratedProblem>) =>
  error.problem.code

expectTypeOf(preserveProblemType).returns.toEqualTypeOf<
  'AUTHENTICATION_REQUIRED' | 'DEPENDENCY_UNAVAILABLE'
>()
