import { DeploymentInputError } from './manifest.ts'

const commands = new Set<DeploymentCommand>([
  'preflight',
  'bootstrap',
  'promote',
  'rollback',
])
const protectedFlags = new Set([
  '--token',
  '--password',
  '--api-key',
  '--registry-password',
])

/** Фиксированная безопасная справка по deployment-командам. */
export const DEPLOYMENT_CLI_USAGE = [
  'Usage:',
  '  pnpm deployment:preflight -- --manifest <path>',
  '  pnpm deployment:bootstrap -- --manifest <path> --apply',
  '  pnpm deployment:promote -- --manifest <path> --apply',
  '  pnpm deployment:rollback -- --evidence <path> --apply',
].join('\n')

/** Поддерживаемая операторская deployment-команда. */
export type DeploymentCommand =
  'preflight' | 'bootstrap' | 'promote' | 'rollback'

/** Строго разобранные опции одной deployment-команды. */
export interface DeploymentCliOptions {
  readonly command: DeploymentCommand
  readonly apply: boolean
  readonly manifestPath?: string
  readonly evidencePath?: string
}

function cliError(rule: string): DeploymentInputError {
  return new DeploymentInputError([{ path: 'arguments', rule }])
}

function readFlagValue(arguments_: readonly string[], index: number): string {
  const value = arguments_[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw cliError('value_required')
  }
  return value
}

/**
 * Разбирает фиксированную CLI-грамматику без secret-bearing флагов.
 *
 * @remarks
 * Удаляет не более одного служебного разделителя pnpm `--`. Mutating-команды
 * принимаются только с явным `--apply`, а `preflight` всегда остаётся read-only.
 *
 * @throws {@link DeploymentInputError} с фиксированными redacted-правилами.
 */
export function parseDeploymentCliOptions(
  arguments_: readonly string[],
): DeploymentCliOptions {
  if (arguments_.some((argument) => protectedFlags.has(argument))) {
    throw cliError('protected_flag')
  }

  const separatorCount = arguments_.filter(
    (argument) => argument === '--',
  ).length
  if (separatorCount > 1) {
    throw cliError('duplicate')
  }
  const normalizedArguments = arguments_.filter((argument) => argument !== '--')
  const command = normalizedArguments[0]
  if (!commands.has(command as DeploymentCommand)) {
    throw cliError('command')
  }

  let manifestPath: string | undefined
  let evidencePath: string | undefined
  let apply = false

  for (let index = 1; index < normalizedArguments.length; index += 1) {
    const argument = normalizedArguments[index]
    if (argument === '--manifest') {
      if (manifestPath !== undefined) {
        throw cliError('duplicate')
      }
      manifestPath = readFlagValue(normalizedArguments, index)
      index += 1
      continue
    }
    if (argument === '--evidence') {
      if (evidencePath !== undefined) {
        throw cliError('duplicate')
      }
      evidencePath = readFlagValue(normalizedArguments, index)
      index += 1
      continue
    }
    if (argument === '--apply') {
      if (apply) {
        throw cliError('duplicate')
      }
      apply = true
      continue
    }
    throw cliError('unexpected_argument')
  }

  const typedCommand = command as DeploymentCommand
  if (typedCommand === 'preflight') {
    if (apply) {
      throw cliError('preflight_read_only')
    }
    if (manifestPath === undefined || evidencePath !== undefined) {
      throw cliError('manifest_required')
    }
    return Object.freeze({
      command: typedCommand,
      manifestPath,
      apply: false,
    })
  }

  if (typedCommand === 'rollback') {
    if (evidencePath === undefined || manifestPath !== undefined) {
      throw cliError('rollback_requires_evidence')
    }
    if (!apply) {
      throw cliError('apply_required')
    }
    return Object.freeze({
      command: typedCommand,
      evidencePath,
      apply: true,
    })
  }

  if (manifestPath === undefined || evidencePath !== undefined) {
    throw cliError('manifest_required')
  }
  if (!apply) {
    throw cliError('apply_required')
  }
  return Object.freeze({
    command: typedCommand,
    manifestPath,
    apply: true,
  })
}
