import { describe, expect, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  type ProblemCode,
} from '@/shared/api'

import { shouldRetryQuery } from './query-client'

const problem = (status: number, code: ProblemCode) =>
  new ApiProblemError(
    {
      type: 'https://example.test/problem',
      title: 'Problem',
      status,
      detail: 'Problem',
      instance: 'urn:request:1',
      code,
      requestId: '1',
    },
    null,
  )

describe('query retry policy', () => {
  it('never retries 4xx problem responses or protocol failures', () => {
    expect(shouldRetryQuery(0, problem(401, 'AUTHENTICATION_REQUIRED'))).toBe(
      false,
    )
    expect(shouldRetryQuery(0, new ApiProtocolError())).toBe(false)
  })

  it('retries network and 5xx failures at most twice', () => {
    expect(shouldRetryQuery(0, new ApiNetworkError())).toBe(true)
    expect(shouldRetryQuery(1, problem(503, 'DEPENDENCY_UNAVAILABLE'))).toBe(
      true,
    )
    expect(shouldRetryQuery(2, new ApiNetworkError())).toBe(false)
  })
})
