// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExecFileCommandRunner } from './command-runner.ts'

function terminateIfAlive(pid: number | undefined): void {
  if (pid === undefined) {
    return
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'ESRCH'
    ) {
      throw error
    }
  }
}

describe('ExecFileCommandRunner', () => {
  it('captures one bounded child process result', async () => {
    const result = await new ExecFileCommandRunner().run(
      process.execPath,
      ['-e', 'process.stdout.write("ok")'],
      { timeoutMs: 1_000 },
    )

    expect(result).toEqual({ exitCode: 0, stdout: 'ok', stderr: '' })
  })

  it('returns stdout, stderr and the non-zero exit code', async () => {
    const result = await new ExecFileCommandRunner().run(
      process.execPath,
      [
        '-e',
        'process.stdout.write("out"); process.stderr.write("err"); process.exit(7)',
      ],
      { timeoutMs: 1_000 },
    )

    expect(result).toEqual({ exitCode: 7, stdout: 'out', stderr: 'err' })
  })

  it('delivers stdin without exposing it in a successful command result', async () => {
    const result = await new ExecFileCommandRunner().run(
      process.execPath,
      [
        '-e',
        'process.stdin.setEncoding("utf8"); let data = ""; process.stdin.on("data", chunk => { data += chunk }); process.stdin.on("end", () => process.stdout.write(String(data.length)))',
      ],
      { stdin: 'private-test-value', timeoutMs: 1_000 },
    )

    expect(result).toEqual({ exitCode: 0, stdout: '18', stderr: '' })
  })

  it('rejects a timed-out command with a fixed non-sensitive error', async () => {
    const privateValue = 'timeout-private-value'

    await expect(
      new ExecFileCommandRunner().run(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1_000)'],
        {
          env: { ...process.env, PRIVATE_TEST_VALUE: privateValue },
          stdin: privateValue,
          timeoutMs: 20,
        },
      ),
    ).rejects.toMatchObject({
      name: 'CommandExecutionError',
      message: `Command "${process.execPath}" failed: timeout`,
    })

    await expect(
      new ExecFileCommandRunner().run(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1_000)'],
        {
          env: { ...process.env, PRIVATE_TEST_VALUE: privateValue },
          stdin: privateValue,
          timeoutMs: 20,
        },
      ),
    ).rejects.not.toThrow(privateValue)
  })

  it('rejects an aborted command with a fixed category', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      new ExecFileCommandRunner().run(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1_000)'],
        { signal: controller.signal, timeoutMs: 1_000 },
      ),
    ).rejects.toMatchObject({
      name: 'CommandExecutionError',
      message: `Command "${process.execPath}" failed: abort`,
    })
  })

  it('waits for graceful SIGTERM cleanup before rejecting', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'react-starter-command-runner-'),
    )
    const pidPath = join(directory, 'pid')
    const cleanupPath = join(directory, 'cleanup')
    let childPid: number | undefined

    try {
      await expect(
        new ExecFileCommandRunner().run(
          process.execPath,
          [
            '-e',
            'const fs = require("node:fs"); const [pidPath, cleanupPath] = process.argv.slice(1); fs.writeFileSync(pidPath, String(process.pid)); process.on("SIGTERM", () => setTimeout(() => { fs.writeFileSync(cleanupPath, "done"); process.exit(0) }, 50)); setInterval(() => {}, 1_000)',
            pidPath,
            cleanupPath,
          ],
          { timeoutMs: 300 },
        ),
      ).rejects.toMatchObject({
        name: 'CommandExecutionError',
        message: `Command "${process.execPath}" failed: timeout`,
      })

      childPid = Number(await readFile(pidPath, 'utf8'))
      await expect(readFile(cleanupPath, 'utf8')).resolves.toBe('done')
      expect(() => process.kill(childPid!, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' }),
      )
    } finally {
      terminateIfAlive(childPid)
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('uses SIGKILL after the termination grace period and waits for close', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'react-starter-command-runner-'),
    )
    const pidPath = join(directory, 'pid')
    let childPid: number | undefined

    try {
      await expect(
        new ExecFileCommandRunner().run(
          process.execPath,
          [
            '-e',
            'const fs = require("node:fs"); fs.writeFileSync(process.argv[1], String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1_000)',
            pidPath,
          ],
          { timeoutMs: 300 },
        ),
      ).rejects.toMatchObject({
        name: 'CommandExecutionError',
        message: `Command "${process.execPath}" failed: timeout`,
      })

      childPid = Number(await readFile(pidPath, 'utf8'))
      expect(() => process.kill(childPid!, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' }),
      )
    } finally {
      terminateIfAlive(childPid)
      await rm(directory, { force: true, recursive: true })
    }
  })
})
