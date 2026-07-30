// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseOciSmokeOptions } from './run-image-smoke.ts'

const digestImage = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const revision = '1'.repeat(40)

describe('parseOciSmokeOptions', () => {
  it('selects an owned local build when no arguments are supplied', () => {
    expect(parseOciSmokeOptions([])).toMatchObject({ buildLocal: true })
  })

  it('parses an exact digest and its expected OCI labels', () => {
    expect(
      parseOciSmokeOptions([
        '--image',
        digestImage,
        '--revision',
        revision,
        '--source',
        'https://github.com/example/react-starter',
        '--workflow-run-url',
        'https://github.com/example/react-starter/actions/runs/1/attempts/1',
      ]),
    ).toMatchObject({
      buildLocal: false,
      expectedRevision: revision,
      expectedSource: 'https://github.com/example/react-starter',
      expectedWorkflowRunUrl:
        'https://github.com/example/react-starter/actions/runs/1/attempts/1',
      imageRef: digestImage,
    })
  })

  it.each([
    {
      name: 'mutable tag',
      arguments_: [
        '--image',
        'ghcr.io/example/react-starter:stage',
        '--revision',
        revision,
      ],
    },
    {
      name: 'mixed-case GHCR coordinate',
      arguments_: [
        '--image',
        'ghcr.io/Example/react-starter@sha256:' + 'a'.repeat(64),
        '--revision',
        revision,
      ],
    },
    {
      name: 'missing revision',
      arguments_: ['--image', digestImage],
    },
    {
      name: 'unknown flag',
      arguments_: [
        '--image',
        digestImage,
        '--revision',
        revision,
        '--token',
        'private-test-value',
      ],
    },
    {
      name: 'credential-bearing source',
      arguments_: [
        '--image',
        digestImage,
        '--revision',
        revision,
        '--source',
        'https://private-test-value@github.com/example/react-starter',
      ],
    },
    {
      name: 'credential-bearing workflow URL',
      arguments_: [
        '--image',
        digestImage,
        '--revision',
        revision,
        '--workflow-run-url',
        'https://user:private-test-value@github.com/example/actions/runs/1',
      ],
    },
  ])('rejects $name with a fixed non-sensitive error', ({ arguments_ }) => {
    let thrown: unknown

    try {
      parseOciSmokeOptions(arguments_)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      name: 'OciSmokeCliError',
      message: 'Invalid OCI smoke arguments',
    })
    expect(String(thrown)).not.toContain('private-test-value')
  })
})
