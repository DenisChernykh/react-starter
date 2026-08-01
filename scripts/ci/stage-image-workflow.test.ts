// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const actionPins = {
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  setupBuildx:
    'docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
  setupNode: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  trivy: 'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25',
  dockerBuild:
    'docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
  dockerLogin: 'docker/login-action@af1e73f918a031802d376d3c8bbc3fe56130a9b0',
} as const

function requireRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected workflow mapping: ${description}`)
  }

  return value as Record<string, unknown>
}

function requireArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected workflow sequence: ${description}`)
  }

  return value
}

async function readWorkflow(path: string): Promise<{
  readonly document: Record<string, unknown>
  readonly source: string
}> {
  const source = await readFile(path, 'utf8')
  return { document: requireRecord(parse(source), path), source }
}

function requireJob(
  workflow: Record<string, unknown>,
  jobName: string,
): Record<string, unknown> {
  return requireRecord(
    requireRecord(workflow.jobs, 'jobs')[jobName],
    `job ${jobName}`,
  )
}

function requireSteps(job: Record<string, unknown>): Record<string, unknown>[] {
  return requireArray(job.steps, 'job steps').map((step, index) =>
    requireRecord(step, `step ${index}`),
  )
}

function requireStep(
  job: Record<string, unknown>,
  selector: { readonly id?: string; readonly name?: string },
): Record<string, unknown> {
  const step = requireSteps(job).find(
    (candidate) =>
      (selector.id === undefined || candidate.id === selector.id) &&
      (selector.name === undefined || candidate.name === selector.name),
  )
  if (!step) {
    throw new TypeError(`Expected workflow step: ${JSON.stringify(selector)}`)
  }

  return step
}

function collectActionUses(
  workflow: Record<string, unknown>,
): readonly string[] {
  return Object.values(requireRecord(workflow.jobs, 'jobs')).flatMap((job) =>
    requireSteps(requireRecord(job, 'job'))
      .map((step) => step.uses)
      .filter((uses): uses is string => typeof uses === 'string'),
  )
}

describe('frontend GitHub workflows', () => {
  it('commit-pins every external action in the unified image workflow', async () => {
    const { document: stageImage } = await readWorkflow(
      '.github/workflows/stage-image.yml',
    )
    const stageUses = collectActionUses(stageImage)

    expect(stageUses).toEqual(expect.arrayContaining(Object.values(actionPins)))
    expect(stageUses).toSatisfy((uses: readonly string[]) =>
      uses.every((value) => /^[^@\s]+@[a-f0-9]{40}$/u.test(value)),
    )
  })

  it('runs one least-privileged gate before trusted PR or stage publication', async () => {
    const { document: stageImage } = await readWorkflow(
      '.github/workflows/stage-image.yml',
    )
    const triggers = requireRecord(stageImage.on, 'Stage image triggers')
    const pullRequest = requireRecord(
      triggers.pull_request,
      'pull_request trigger',
    )
    const push = requireRecord(triggers.push, 'push trigger')
    const gate = requireJob(stageImage, 'gate')
    const publish = requireJob(stageImage, 'publish')

    expect(pullRequest.branches).toEqual(['stage'])
    expect(push.branches).toEqual(['stage'])
    expect(triggers).not.toHaveProperty('workflow_dispatch')
    expect(stageImage.permissions).toEqual({ contents: 'read' })
    expect(gate.permissions).toEqual({ contents: 'read' })
    expect(publish.needs).toBe('gate')
    expect(publish.if).toBe(
      "github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]')",
    )
    expect(publish.permissions).toEqual({
      contents: 'read',
      packages: 'write',
    })
    expect(
      requireSteps(gate)
        .map((step) => step.run)
        .filter(Boolean),
    ).toEqual([
      'corepack enable',
      expect.stringContaining('test "$(node --version)" = "v24.18.0"'),
      'pnpm install --frozen-lockfile',
      'pnpm check',
    ])
    await expect(
      readFile('.github/workflows/ci.yml', 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('publishes linux/amd64 only after gate with exact attempt provenance', async () => {
    const { document: stageImage } = await readWorkflow(
      '.github/workflows/stage-image.yml',
    )
    const triggers = requireRecord(stageImage.on, 'Stage image triggers')
    const push = requireRecord(triggers.push, 'push trigger')
    const gate = requireJob(stageImage, 'gate')
    const publish = requireJob(stageImage, 'publish')
    const metadata = requireStep(publish, { id: 'metadata' })
    const build = requireStep(publish, { id: 'build' })
    const buildWith = requireRecord(build.with, 'build inputs')

    expect(push.branches).toEqual(['stage'])
    expect(stageImage.permissions).toEqual({ contents: 'read' })
    expect(gate.permissions).toEqual({ contents: 'read' })
    expect(publish.needs).toBe('gate')
    expect(publish.permissions).toEqual({
      contents: 'read',
      packages: 'write',
    })
    expect(buildWith.platforms).toBe('linux/amd64')
    expect(buildWith.push).toBe(true)
    expect(metadata.run).toEqual(
      expect.stringContaining(
        'WORKFLOW_RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}"',
      ),
    )
    expect(buildWith['build-args']).toEqual(
      expect.stringContaining(
        'BUILD_WORKFLOW_RUN_URL=${{ steps.metadata.outputs.workflow_run_url }}',
      ),
    )
  })

  it('keeps one immutable digest through scan, pull, smoke and summary', async () => {
    const { document: stageImage, source } = await readWorkflow(
      '.github/workflows/stage-image.yml',
    )
    const publish = requireJob(stageImage, 'publish')
    const steps = requireSteps(publish)
    const trivy = steps.find((step) => step.uses === actionPins.trivy)
    const pull = requireStep(publish, { name: 'Pull published digest' })
    const smoke = requireStep(publish, { name: 'Smoke published digest' })
    const summary = requireStep(publish, {
      name: 'Summarize verified candidate',
    })
    const digestExpression = '${{ steps.build.outputs.digest }}'

    expect(requireRecord(trivy?.with, 'Trivy inputs')).toMatchObject({
      'exit-code': 1,
      'ignore-unfixed': true,
      'image-ref':
        '${{ steps.metadata.outputs.image_name }}@${{ steps.build.outputs.digest }}',
      scanners: 'vuln',
      severity: 'HIGH,CRITICAL',
    })
    for (const step of [pull, smoke, summary]) {
      expect(requireRecord(step.env, `${String(step.name)} env`).DIGEST).toBe(
        digestExpression,
      )
    }
    expect(pull.run).toBe('docker pull "${IMAGE_NAME}@${DIGEST}"')
    expect(smoke.run).toEqual(
      expect.stringContaining('--image "${IMAGE_NAME}@${DIGEST}"'),
    )
    expect(smoke.run).not.toContain('pnpm oci:check --')
    expect(requireRecord(smoke.env, 'smoke env').WORKFLOW_RUN_URL).toBe(
      '${{ steps.metadata.outputs.workflow_run_url }}',
    )
    expect(requireRecord(summary.env, 'summary env').GATE_RESULT).toBe(
      '${{ needs.gate.result }}',
    )
    expect(source).not.toMatch(/DOKPLOY|VPS|SSH_PRIVATE_KEY/u)
    expect(source).not.toMatch(/latest|stage-latest/u)
  })
})
