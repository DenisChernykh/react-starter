// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const actionPins = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
  'docker/login-action@af1e73f918a031802d376d3c8bbc3fe56130a9b0',
  'docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
  'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25',
]
const toolchainCheck = `- run: corepack enable
      - name: Verify locked toolchain
        run: |
          test "$(node --version)" = "v24.18.0"
          test "$(pnpm --version)" = "11.15.1"
      - run: pnpm install --frozen-lockfile`

describe('stage image workflow', () => {
  it('keeps source CI separate from immutable stage-image publication', async () => {
    const [ci, stageImage] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/stage-image.yml', 'utf8'),
    ])

    expect(ci).toContain('pull_request:')
    expect(ci).not.toContain('push:')
    expect(stageImage).toContain('push:')
    expect(stageImage).toContain('branches: [stage]')
    expect(stageImage).toContain('packages: write')
    expect(stageImage).toContain('${{ steps.build.outputs.digest }}')
    expect(stageImage).toContain('severity: HIGH,CRITICAL')
    expect(stageImage).toContain('ignore-unfixed: true')
    expect(stageImage).toContain('pnpm oci:check')
    expect(stageImage).not.toMatch(/DOKPLOY|VPS|SSH_PRIVATE_KEY/u)
    expect(stageImage).not.toMatch(/latest|stage-latest/u)
    expect(stageImage.split(toolchainCheck)).toHaveLength(3)

    for (const actionPin of actionPins) {
      expect(stageImage).toContain(actionPin)
    }
  })
})
