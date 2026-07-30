// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { CommandPort, CommandResult } from '../lib/command-runner.ts'
import { parseOciSmokeOptions, runLocalImageSmoke } from './run-image-smoke.ts'

const digestImage = 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64)
const revision = '1'.repeat(40)

function commandResult(stdout = '', exitCode = 0, stderr = ''): CommandResult {
  return { exitCode, stdout, stderr }
}

class DualFailureCommandPort implements CommandPort {
  run(
    _executable: string,
    arguments_: readonly string[],
  ): Promise<CommandResult> {
    if (arguments_[0] === 'rev-parse') {
      return Promise.resolve(commandResult(`${revision}\n`))
    }
    if (arguments_[0] === 'show') {
      return Promise.resolve(commandResult('2026-07-30T12:00:00Z\n'))
    }
    if (arguments_[0] === 'config') {
      return Promise.resolve(
        commandResult('https://github.com/example/react-starter.git\n'),
      )
    }
    if (arguments_[0] === 'build') {
      return Promise.resolve(commandResult('', 17, 'docker-private-output'))
    }
    if (arguments_[0] === 'image' && arguments_[1] === 'rm') {
      return Promise.resolve(commandResult('', 18, 'docker-private-output'))
    }

    return Promise.resolve(commandResult('', 99, 'unexpected-private-output'))
  }
}

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

  it('keeps source and workflow equality expectations optional', () => {
    expect(
      parseOciSmokeOptions(['--image', digestImage, '--revision', revision]),
    ).toEqual({
      buildLocal: false,
      expectedRevision: revision,
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

describe('runLocalImageSmoke', () => {
  it('retains fixed build and cleanup categories when both fail', async () => {
    let thrown: unknown

    try {
      await runLocalImageSmoke(new DualFailureCommandPort())
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect(thrown).toMatchObject({
      message:
        'OCI smoke execution failed: primary operation and local image cleanup',
      name: 'AggregateError',
    })
    expect((thrown as AggregateError).errors).toEqual([
      expect.objectContaining({
        message: 'OCI smoke execution failed: docker build',
      }),
      expect.objectContaining({
        message: 'OCI smoke execution failed: local image cleanup',
      }),
    ])
    expect(
      (thrown as AggregateError).errors.map(String).join('\n'),
    ).not.toContain('private-output')
  })
})
