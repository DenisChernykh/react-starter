import { describe, expect, it } from 'vitest'

import { parsePublicEnv } from './env'

describe('parsePublicEnv', () => {
  it('accepts an absolute HTTP API URL and removes its trailing slash', () => {
    expect(
      parsePublicEnv({ VITE_API_BASE_URL: 'http://localhost:3000/' }),
    ).toEqual({ VITE_API_BASE_URL: 'http://localhost:3000' })
  })

  it.each(['', '/api', 'ftp://example.com'])(
    'rejects an invalid API URL: %s',
    (VITE_API_BASE_URL) => {
      expect(() => parsePublicEnv({ VITE_API_BASE_URL })).toThrow(
        'VITE_API_BASE_URL',
      )
    },
  )
})
