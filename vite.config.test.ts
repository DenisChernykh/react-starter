// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { parseDevApiProxyTarget } from './vite.config.ts'

describe('parseDevApiProxyTarget', () => {
  it('defaults to the local backend origin', () => {
    expect(parseDevApiProxyTarget(undefined)).toBe('http://localhost:3000')
  })

  it('normalizes an explicit HTTP(S) origin', () => {
    expect(parseDevApiProxyTarget('https://api.example.com/')).toBe(
      'https://api.example.com',
    )
  })

  it.each([
    '/api',
    'ftp://api.example.com',
    'https://user:secret@api.example.com',
    'https://api.example.com/v1',
    'https://api.example.com?token=secret',
  ])('rejects an unsafe proxy target: %s', (value) => {
    expect(() => parseDevApiProxyTarget(value)).toThrow('DEV_API_PROXY_TARGET')
  })
})
