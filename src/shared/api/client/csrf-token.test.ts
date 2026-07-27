import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCsrfToken,
  getOrFetchCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from './csrf-token'

describe('CSRF token memory', () => {
  beforeEach(clearCsrfToken)

  it('keeps and clears the current token in module memory', () => {
    setCsrfToken('token-1')
    expect(peekCsrfToken()).toBe('token-1')
    clearCsrfToken()
    expect(peekCsrfToken()).toBeNull()
  })

  it('deduplicates concurrent token fetches', async () => {
    const fetcher = vi.fn(async () => 'token-1')

    await expect(
      Promise.all([
        getOrFetchCsrfToken(fetcher),
        getOrFetchCsrfToken(fetcher),
        getOrFetchCsrfToken(fetcher),
      ]),
    ).resolves.toEqual(['token-1', 'token-1', 'token-1'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not cache a rejected fetch', async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('token-2')

    await expect(getOrFetchCsrfToken(fetcher)).rejects.toThrow('offline')
    await expect(getOrFetchCsrfToken(fetcher)).resolves.toBe('token-2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
