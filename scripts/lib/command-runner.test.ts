// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { ExecFileCommandRunner } from './command-runner.ts'

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
})
