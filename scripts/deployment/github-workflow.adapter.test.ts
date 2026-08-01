// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  GithubWorkflowAdapter,
  GithubWorkflowContractError,
} from './github-workflow.adapter.ts'

const repository = 'example/react-starter'
const revision = '1'.repeat(40)
const workflowRunUrl =
  'https://github.com/example/react-starter/actions/runs/123/attempts/2'
const apiUrl =
  'https://api.github.com/repos/example/react-starter/actions/runs/123/attempts/2'
const token = 'github-private-token'

const successfulAttempt = {
  conclusion: 'success',
  event: 'push',
  head_branch: 'stage',
  head_sha: revision,
  path: '.github/workflows/stage-image.yml',
  status: 'completed',
} as const

interface RecordedFetch {
  readonly input: string | URL | Request
  readonly init?: RequestInit
}

function recordingFetch(
  response: Response | ((init?: RequestInit) => Promise<Response>),
): { readonly calls: RecordedFetch[]; readonly fetch: typeof fetch } {
  const calls: RecordedFetch[] = []

  return {
    calls,
    fetch: (async (input, init) => {
      calls.push({ input, init })
      return typeof response === 'function' ? response(init) : response
    }) as typeof fetch,
  }
}

function attemptResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ ...successfulAttempt, ...overrides })
}

function verifyInput(
  overrides: Partial<{
    readonly integrationBranch: string
    readonly repository: string
    readonly revision: string
    readonly workflowRunUrl: string
    readonly token: string
    readonly signal: AbortSignal
  }> = {},
) {
  return {
    integrationBranch: 'stage',
    repository,
    revision,
    token,
    workflowRunUrl,
    ...overrides,
  }
}

async function expectSafeContractFailure(
  promise: Promise<unknown>,
  forbiddenValues: readonly string[] = [],
): Promise<GithubWorkflowContractError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(GithubWorkflowContractError)
    const serialized = JSON.stringify(error)
    const rendered = String(error)
    for (const forbidden of ['Authorization', token, ...forbiddenValues]) {
      expect(rendered).not.toContain(forbidden)
      expect(serialized).not.toContain(forbidden)
    }
    return error as GithubWorkflowContractError
  }

  throw new Error('Expected GithubWorkflowContractError')
}

describe('GithubWorkflowAdapter', () => {
  it('verifies the exact successful stage workflow run attempt with one GET', async () => {
    const fake = recordingFetch(attemptResponse())

    await expect(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput(),
      ),
    ).resolves.toBeUndefined()

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.input.toString()).toBe(apiUrl)
    expect(fake.calls[0]?.init).toMatchObject({
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      method: 'GET',
      redirect: 'error',
    })
    expect(fake.calls[0]?.init?.body).toBeUndefined()
    expect(fake.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('binds a personalized integration branch to the exact run attempt', async () => {
    const fake = recordingFetch(attemptResponse({ head_branch: 'main' }))

    await expect(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput({ integrationBranch: 'main' }),
      ),
    ).resolves.toBeUndefined()
  })

  it.each([
    ['event', 'workflow_dispatch'],
    ['status', 'in_progress'],
    ['conclusion', 'failure'],
    ['head_branch', 'main'],
    ['head_sha', '2'.repeat(40)],
    ['path', '.github/workflows/ci.yml'],
  ] as const)('rejects a mismatch in %s', async (field, value) => {
    const fake = recordingFetch(attemptResponse({ [field]: value }))

    const error = await expectSafeContractFailure(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput(),
      ),
    )

    expect(error).toMatchObject({
      message: 'GitHub workflow verification failed: contract mismatch',
      name: 'GithubWorkflowContractError',
    })
  })

  it.each([
    null,
    [],
    {},
    {
      conclusion: 'success',
      event: 'push',
      head_branch: 'stage',
      head_sha: revision,
      path: '.github/workflows/stage-image.yml',
    },
    {
      ...successfulAttempt,
      event: 1,
    },
  ])('rejects an invalid response shape without exposing it', async (body) => {
    const privateBody = 'private-response-value'
    const response =
      body === null
        ? new Response(JSON.stringify(null))
        : new Response(
            JSON.stringify(
              Array.isArray(body)
                ? [...body, privateBody]
                : { ...body, privateBody },
            ),
          )
    const fake = recordingFetch(response)

    const error = await expectSafeContractFailure(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput(),
      ),
      [privateBody],
    )

    expect(error.message).toBe(
      'GitHub workflow verification failed: response shape',
    )
  })

  it('rejects non-2xx without exposing the response body', async () => {
    const privateBody = 'private-non-2xx-body'
    const fake = recordingFetch(new Response(privateBody, { status: 401 }))

    const error = await expectSafeContractFailure(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput(),
      ),
      [privateBody],
    )

    expect(error.message).toBe(
      'GitHub workflow verification failed: response status',
    )
  })

  it('rejects invalid JSON without exposing the response body', async () => {
    const privateBody = '{private-invalid-json'
    const fake = recordingFetch(new Response(privateBody))

    const error = await expectSafeContractFailure(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput(),
      ),
      [privateBody],
    )

    expect(error.message).toBe(
      'GitHub workflow verification failed: response JSON',
    )
  })

  it('times out the single request without retrying', async () => {
    const fake = recordingFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )

    const error = await expectSafeContractFailure(
      new GithubWorkflowAdapter({
        fetchImplementation: fake.fetch,
        timeoutMs: 1,
      }).verify(verifyInput()),
    )

    expect(error.message).toBe(
      'GitHub workflow verification failed: request timeout',
    )
    expect(fake.calls).toHaveLength(1)
  })

  it('rejects a strict attempt URL and repository mismatch before fetch', async () => {
    const privateUsername = 'url-user'
    const privatePassword = 'url-password'
    const fake = recordingFetch(attemptResponse())

    const invalidUrls = [
      `https://${privateUsername}:${privatePassword}@github.com/example/react-starter/actions/runs/123/attempts/2`,
      `${workflowRunUrl}?token=private-query`,
      `${workflowRunUrl}#private-fragment`,
      'http://github.com/example/react-starter/actions/runs/123/attempts/2',
      'https://github.com/example/react-starter/actions/runs/0/attempts/2',
      'https://github.com/example/react-starter/actions/runs/123/attempts/2/extra',
    ]

    for (const invalidUrl of invalidUrls) {
      const error = await expectSafeContractFailure(
        new GithubWorkflowAdapter({
          fetchImplementation: fake.fetch,
        }).verify(verifyInput({ workflowRunUrl: invalidUrl })),
        [privateUsername, privatePassword, 'private-query', 'private-fragment'],
      )
      expect(error.message).toBe(
        'GitHub workflow verification failed: attempt URL',
      )
    }

    const mismatch = await expectSafeContractFailure(
      new GithubWorkflowAdapter({ fetchImplementation: fake.fetch }).verify(
        verifyInput({ repository: 'other/react-starter' }),
      ),
    )
    expect(mismatch.message).toBe(
      'GitHub workflow verification failed: attempt URL',
    )
    expect(fake.calls).toHaveLength(0)
  })

  it('turns external abort into a fixed redacted contract error', async () => {
    const controller = new AbortController()
    const fake = recordingFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    const promise = new GithubWorkflowAdapter({
      fetchImplementation: fake.fetch,
    }).verify(verifyInput({ signal: controller.signal }))

    controller.abort('private-abort-reason')
    const error = await expectSafeContractFailure(promise, [
      'private-abort-reason',
    ])

    expect(error.message).toBe(
      'GitHub workflow verification failed: request aborted',
    )
    expect(fake.calls).toHaveLength(1)
  })
})
