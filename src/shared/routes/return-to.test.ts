import { describe, expect, it } from 'vitest'

import { sanitizeReturnTo } from './return-to'

describe('sanitizeReturnTo', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['https://evil.test/path', '/'],
    ['//evil.test/path', '/'],
    ['/login', '/'],
    ['/settings?tab=profile#name', '/settings?tab=profile#name'],
  ])('maps %s to %s', (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected)
  })
})
