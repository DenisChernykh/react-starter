// @vitest-environment node

import { describe, expect, it } from 'vitest'

import viteConfig, { parseDevApiProxyTarget } from './vite.config.ts'

async function resolveDevProxyContexts(): Promise<readonly string[]> {
  const config =
    typeof viteConfig === 'function'
      ? await viteConfig({
          command: 'serve',
          isPreview: false,
          isSsrBuild: false,
          mode: 'test',
        })
      : viteConfig

  return Object.keys(config.server?.proxy ?? {})
}

function matchesProxyContext(
  contexts: readonly string[],
  requestPath: string,
): boolean {
  return contexts.some((context) =>
    context.startsWith('^')
      ? new RegExp(context, 'u').test(requestPath)
      : requestPath.startsWith(context),
  )
}

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

  it.each(['/v1', '/v1/users', '/health', '/health/ready'])(
    'proxies the exact backend boundary: %s',
    async (requestPath) => {
      expect(
        matchesProxyContext(await resolveDevProxyContexts(), requestPath),
      ).toBe(true)
    },
  )

  it.each(['/v10', '/v1-admin', '/healthcheck'])(
    'keeps a prefix collision in the Vite frontend: %s',
    async (requestPath) => {
      expect(
        matchesProxyContext(await resolveDevProxyContexts(), requestPath),
      ).toBe(false)
    },
  )
})
