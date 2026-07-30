import { spawn } from 'node:child_process'

const MAX_OUTPUT_BYTES = 1024 * 1024

/** Результат завершившегося дочернего процесса с ограниченным выводом. */
export interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/** Параметры одного ограниченного запуска дочернего процесса. */
export interface CommandOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly stdin?: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

/** Порт запуска внешних команд без участия командной оболочки. */
export interface CommandPort {
  run(
    executable: string,
    arguments_: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult>
}

class CommandExecutionError extends Error {
  constructor(executable: string, category: string) {
    super(`Command "${executable}" failed: ${category}`)
    this.name = 'CommandExecutionError'
  }
}

/**
 * Запускает один процесс через `spawn` с массивом аргументов и ограниченным выводом.
 *
 * @remarks
 * Тайм-аут и внешний abort завершают дочерний процесс. Текст ошибки намеренно не
 * содержит аргументы, stdin, environment или вывод процесса.
 */
export class ExecFileCommandRunner implements CommandPort {
  run(
    executable: string,
    arguments_: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
      const signal = options.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal
      const child = spawn(executable, [...arguments_], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let settled = false

      const finish = (
        callback: () => void,
        terminateChild = false,
      ): undefined => {
        if (settled) {
          return
        }

        settled = true
        signal.removeEventListener('abort', onAbort)
        if (terminateChild && child.exitCode === null) {
          child.kill('SIGTERM')
        }
        callback()
      }

      const rejectWith = (category: string, terminateChild = false): void => {
        finish(
          () => reject(new CommandExecutionError(executable, category)),
          terminateChild,
        )
      }

      const onAbort = (): void => {
        rejectWith(timeoutSignal.aborted ? 'timeout' : 'abort', true)
      }

      const collect = (
        chunks: Buffer[],
        chunk: Buffer,
        currentBytes: number,
        category: string,
      ): number => {
        const nextBytes = currentBytes + chunk.byteLength
        if (nextBytes > MAX_OUTPUT_BYTES) {
          rejectWith(category, true)
          return currentBytes
        }

        chunks.push(chunk)
        return nextBytes
      }

      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
      }

      child.on('error', () => {
        rejectWith('spawn')
      })
      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes = collect(stdoutChunks, chunk, stdoutBytes, 'stdout-limit')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes = collect(stderrChunks, chunk, stderrBytes, 'stderr-limit')
      })
      child.on('close', (exitCode, exitSignal) => {
        if (exitCode === null) {
          rejectWith(exitSignal === null ? 'exit' : 'signal')
          return
        }

        finish(() =>
          resolve({
            exitCode,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
          }),
        )
      })

      child.stdin.on('error', () => undefined)
      child.stdin.end(options.stdin)
    })
  }
}
