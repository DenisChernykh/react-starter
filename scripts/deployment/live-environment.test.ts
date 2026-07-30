// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { DeploymentInputError } from './manifest.ts'
import { parseDeploymentLiveEnvironment } from './live-environment.ts'

const validEnvironment = {
  DOKPLOY_BASE_URL: 'https://dokploy.example.com',
  DOKPLOY_API_KEY: 'dokploy-test-key',
  DOKPLOY_APPLICATION_ID: 'app_123',
  GITHUB_TOKEN: 'github-test-token',
  GHCR_REGISTRY_URL: 'https://ghcr.io',
  GHCR_USERNAME: 'package-reader',
  GHCR_PASSWORD: 'ghcr-test-password',
} satisfies NodeJS.ProcessEnv
const environmentKeys = Object.keys(
  validEnvironment,
) as (keyof typeof validEnvironment)[]

function expectEnvironmentError(
  input: NodeJS.ProcessEnv,
): DeploymentInputError {
  try {
    parseDeploymentLiveEnvironment(input)
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentInputError)
    return error as DeploymentInputError
  }

  throw new Error('Expected environment parsing to fail')
}

describe('parseDeploymentLiveEnvironment', () => {
  it('reads only the seven protected variables into a frozen camelCase value', () => {
    const parsed = parseDeploymentLiveEnvironment({
      ...validEnvironment,
      UNRELATED_SECRET: 'must-not-be-retained',
      DOKPLOY_BASE_URL: 'https://dokploy.example.com/',
    })

    expect(parsed).toEqual({
      dokployBaseUrl: 'https://dokploy.example.com',
      dokployApiKey: 'dokploy-test-key',
      dokployApplicationId: 'app_123',
      githubToken: 'github-test-token',
      ghcrRegistryUrl: 'https://ghcr.io',
      ghcrUsername: 'package-reader',
      ghcrPassword: 'ghcr-test-password',
    })
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(JSON.stringify(parsed)).not.toContain('must-not-be-retained')
  })

  it.each(environmentKeys)(
    'rejects missing %s without exposing other values',
    (key) => {
      const input = { ...validEnvironment }
      delete input[key]
      const error = expectEnvironmentError(input)
      const serialized = JSON.stringify(error)

      expect(error.issues).toContainEqual({
        path: key,
        rule: 'required',
      })
      expect(serialized).not.toContain('dokploy-test-key')
      expect(serialized).not.toContain('github-test-token')
      expect(serialized).not.toContain('ghcr-test-password')
    },
  )

  it.each(environmentKeys)('rejects empty %s', (key) => {
    const error = expectEnvironmentError({
      ...validEnvironment,
      [key]: '   ',
    })

    expect(error.issues).toContainEqual({
      path: key,
      rule: 'required',
    })
  })

  it.each([
    'http://dokploy.example.com',
    'https://user:secret@dokploy.example.com',
    'https://dokploy.example.com/api',
    'https://dokploy.example.com?token=secret',
    'https://dokploy.example.com#secret',
  ])('rejects invalid Dokploy origin without serializing %s', (value) => {
    const error = expectEnvironmentError({
      ...validEnvironment,
      DOKPLOY_BASE_URL: value,
    })

    expect(error.issues).toContainEqual({
      path: 'DOKPLOY_BASE_URL',
      rule: 'https_origin',
    })
    expect(JSON.stringify(error)).not.toContain(value)
  })

  it.each([
    'http://ghcr.io',
    'https://ghcr.io/',
    'https://registry.example.com',
    'https://user:secret@ghcr.io',
  ])('rejects unsupported GHCR registry without serializing %s', (value) => {
    const error = expectEnvironmentError({
      ...validEnvironment,
      GHCR_REGISTRY_URL: value,
    })

    expect(error.issues).toContainEqual({
      path: 'GHCR_REGISTRY_URL',
      rule: 'exact_ghcr_registry',
    })
    expect(JSON.stringify(error)).not.toContain(value)
  })
})
