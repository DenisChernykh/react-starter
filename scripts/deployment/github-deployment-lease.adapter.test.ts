// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  GithubDeploymentLeaseAdapter,
  GithubDeploymentLeaseError,
} from './github-deployment-lease.adapter.ts'

const applicationId = 'app_123'
const repository = 'example/react-starter'
const revision = '1'.repeat(40)
const token = 'private-github-token'
const lockRef = 'refs/tags/frontend-deployment-lock/stage-fe0275c5a52b6627'

interface RecordedRequest {
  readonly input: string | URL | Request
  readonly init?: RequestInit
}

function recordingFetch(responses: readonly Response[]): {
  readonly calls: RecordedRequest[]
  readonly fetch: typeof fetch
} {
  const calls: RecordedRequest[] = []
  let responseIndex = 0
  return {
    calls,
    fetch: (async (input, init) => {
      calls.push({ input, init })
      const response = responses[responseIndex]
      responseIndex += 1
      if (response === undefined) {
        throw new Error('Unexpected request')
      }
      return response
    }) as typeof fetch,
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function refResponse(sha = revision): Response {
  return jsonResponse(
    {
      object: { sha, type: 'commit' },
      ref: lockRef,
    },
    201,
  )
}

const leaseInput = Object.freeze({
  applicationId,
  environment: 'stage',
  repository,
  revision,
  token,
})

describe('GithubDeploymentLeaseAdapter', () => {
  it('atomically acquires one fixed repository ref for the application', async () => {
    const fake = recordingFetch([refResponse()])

    const lease = await new GithubDeploymentLeaseAdapter({
      fetchImplementation: fake.fetch,
    }).acquire(leaseInput)

    expect(lease).toEqual({ ref: lockRef, repository, revision })
    expect(Object.isFrozen(lease)).toBe(true)
    expect(fake.calls).toHaveLength(1)
    const call = fake.calls[0]
    expect(call?.input.toString()).toBe(
      'https://api.github.com/repos/example/react-starter/git/refs',
    )
    expect(call?.init).toMatchObject({
      body: JSON.stringify({ ref: lockRef, sha: revision }),
      credentials: 'omit',
      method: 'POST',
      redirect: 'error',
    })
    expect(new Headers(call?.init?.headers)).toEqual(
      new Headers({
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      }),
    )
  })

  it('treats an existing fixed ref as a held lease without exposing response data', async () => {
    const privateBody = 'private-conflict-body'
    const fake = recordingFetch([jsonResponse({ message: privateBody }, 422)])

    await expect(
      new GithubDeploymentLeaseAdapter({
        fetchImplementation: fake.fetch,
      }).acquire(leaseInput),
    ).rejects.toMatchObject({
      name: 'GithubDeploymentLeaseError',
      rule: 'held',
    })
    await expect(
      new GithubDeploymentLeaseAdapter({
        fetchImplementation: recordingFetch([
          jsonResponse({ message: privateBody }, 422),
        ]).fetch,
      }).acquire(leaseInput),
    ).rejects.not.toThrow(privateBody)
  })

  it('verifies lease ownership before deleting the exact ref', async () => {
    const getResponse = refResponse()
    const fake = recordingFetch([
      new Response(await getResponse.text(), {
        headers: getResponse.headers,
        status: 200,
      }),
      new Response(null, { status: 204 }),
    ])
    const adapter = new GithubDeploymentLeaseAdapter({
      fetchImplementation: fake.fetch,
    })
    const lease = Object.freeze({ ref: lockRef, repository, revision })

    await expect(adapter.release({ lease, token })).resolves.toBeUndefined()

    expect(fake.calls.map(({ input }) => input.toString())).toEqual([
      'https://api.github.com/repos/example/react-starter/git/ref/tags/frontend-deployment-lock/stage-fe0275c5a52b6627',
      'https://api.github.com/repos/example/react-starter/git/refs/tags/frontend-deployment-lock/stage-fe0275c5a52b6627',
    ])
    expect(fake.calls.map(({ init }) => init?.method)).toEqual([
      'GET',
      'DELETE',
    ])
  })

  it('does not delete a ref that no longer belongs to the acquired revision', async () => {
    const fake = recordingFetch([
      jsonResponse(
        {
          object: { sha: '2'.repeat(40), type: 'commit' },
          ref: lockRef,
        },
        200,
      ),
    ])
    const adapter = new GithubDeploymentLeaseAdapter({
      fetchImplementation: fake.fetch,
    })

    await expect(
      adapter.release({
        lease: Object.freeze({ ref: lockRef, repository, revision }),
        token,
      }),
    ).rejects.toMatchObject({
      name: 'GithubDeploymentLeaseError',
      rule: 'lost',
    })
    expect(fake.calls).toHaveLength(1)
  })

  it('serializes only fixed redacted diagnostics', () => {
    const error = new GithubDeploymentLeaseError('request')

    expect(error.toJSON()).toEqual({
      message: 'GitHub deployment lease failed',
      name: 'GithubDeploymentLeaseError',
      rule: 'request',
    })
    expect(JSON.stringify(error)).not.toContain(token)
  })
})
