// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { DeploymentInputError } from './manifest.ts'
import {
  DEPLOYMENT_CLI_USAGE,
  parseDeploymentCliOptions,
} from './cli-options.ts'

function expectCliError(arguments_: readonly string[]): DeploymentInputError {
  try {
    parseDeploymentCliOptions(arguments_)
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentInputError)
    return error as DeploymentInputError
  }

  throw new Error('Expected CLI parsing to fail')
}

describe('parseDeploymentCliOptions', () => {
  it('parses read-only preflight options', () => {
    expect(
      parseDeploymentCliOptions(['preflight', '--manifest', 'release.json']),
    ).toEqual({
      command: 'preflight',
      manifestPath: 'release.json',
      apply: false,
    })
  })

  it('filters one pnpm separator', () => {
    expect(
      parseDeploymentCliOptions([
        'preflight',
        '--',
        '--manifest',
        'release.json',
      ]),
    ).toEqual({
      command: 'preflight',
      manifestPath: 'release.json',
      apply: false,
    })
  })

  it.each(['bootstrap', 'promote'] as const)(
    'parses explicit %s mutation options',
    (command) => {
      expect(
        parseDeploymentCliOptions([
          command,
          '--manifest',
          'release.json',
          '--apply',
        ]),
      ).toEqual({
        command,
        manifestPath: 'release.json',
        apply: true,
      })
    },
  )

  it('parses explicit rollback options', () => {
    expect(
      parseDeploymentCliOptions([
        'rollback',
        '--evidence',
        '.deployment/evidence/failed.json',
        '--apply',
      ]),
    ).toEqual({
      command: 'rollback',
      evidencePath: '.deployment/evidence/failed.json',
      apply: true,
    })
  })

  it.each(['bootstrap', 'promote', 'rollback'] as const)(
    'rejects %s without --apply',
    (command) => {
      const pathFlag = command === 'rollback' ? '--evidence' : '--manifest'
      const error = expectCliError([command, pathFlag, 'release.json'])

      expect(error.issues).toContainEqual({
        path: 'arguments',
        rule: 'apply_required',
      })
    },
  )

  it('rejects --apply for preflight', () => {
    const error = expectCliError([
      'preflight',
      '--manifest',
      'release.json',
      '--apply',
    ])

    expect(error.issues).toContainEqual({
      path: 'arguments',
      rule: 'preflight_read_only',
    })
  })

  it.each([
    [
      'manifest',
      ['preflight', '--manifest', 'one.json', '--manifest', 'two.json'],
    ],
    [
      'evidence',
      [
        'rollback',
        '--evidence',
        'one.json',
        '--evidence',
        'two.json',
        '--apply',
      ],
    ],
    ['apply', ['promote', '--manifest', 'release.json', '--apply', '--apply']],
    ['separator', ['preflight', '--', '--', '--manifest', 'release.json']],
  ])('rejects duplicated %s input', (_name, arguments_) => {
    expect(expectCliError(arguments_).issues).toContainEqual({
      path: 'arguments',
      rule: 'duplicate',
    })
  })

  it('rejects positional extras', () => {
    expect(
      expectCliError([
        'promote',
        '--manifest',
        'release.json',
        '--apply',
        'extra',
      ]).issues,
    ).toContainEqual({
      path: 'arguments',
      rule: 'unexpected_argument',
    })
  })

  it('rejects a manifest flag for rollback', () => {
    expect(
      expectCliError(['rollback', '--manifest', 'release.json', '--apply'])
        .issues,
    ).toContainEqual({
      path: 'arguments',
      rule: 'rollback_requires_evidence',
    })
  })

  it.each(['--token', '--password', '--api-key', '--registry-password'])(
    'rejects protected flag %s without serializing its value',
    (flag) => {
      const error = expectCliError([
        'preflight',
        '--manifest',
        'release.json',
        flag,
        'cli-secret-value',
      ])

      expect(error.issues).toContainEqual({
        path: 'arguments',
        rule: 'protected_flag',
      })
      expect(JSON.stringify(error)).not.toContain('cli-secret-value')
    },
  )

  it.each([
    { arguments_: [] },
    { arguments_: ['unknown', '--manifest', 'release.json'] },
    { arguments_: ['preflight'] },
    { arguments_: ['preflight', '--manifest'] },
    { arguments_: ['preflight', '--evidence', 'failed.json'] },
    {
      arguments_: [
        'rollback',
        '--evidence',
        'failed.json',
        '--manifest',
        'release.json',
      ],
    },
  ])('rejects invalid grammar %#', ({ arguments_ }) => {
    expect(() => parseDeploymentCliOptions(arguments_)).toThrow(
      DeploymentInputError,
    )
  })
})

describe('DEPLOYMENT_CLI_USAGE', () => {
  it('provides the fixed package-script grammar', () => {
    expect(DEPLOYMENT_CLI_USAGE).toBe(
      [
        'Usage:',
        '  pnpm deployment:preflight -- --manifest <path>',
        '  pnpm deployment:bootstrap -- --manifest <path> --apply',
        '  pnpm deployment:promote -- --manifest <path> --apply',
        '  pnpm deployment:rollback -- --evidence <path> --apply',
      ].join('\n'),
    )
  })
})
