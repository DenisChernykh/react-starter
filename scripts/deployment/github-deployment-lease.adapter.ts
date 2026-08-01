import { createHash } from 'node:crypto'
import type { DeploymentLease, DeploymentLeasePort } from './ports.ts'

type GithubDeploymentLeaseRule = 'contract' | 'held' | 'lost' | 'request'
const DEFAULT_TIMEOUT_MS = 10_000
const environmentPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u
const repositoryPattern =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/iu
const revisionPattern = /^[0-9a-f]{40}$/u

/** Redacted ошибка GitHub-backed deployment lease. */
export class GithubDeploymentLeaseError extends Error {
  readonly rule: GithubDeploymentLeaseRule

  constructor(rule: GithubDeploymentLeaseRule) {
    super('GitHub deployment lease failed')
    this.name = 'GithubDeploymentLeaseError'
    this.rule = rule
  }

  /** Возвращает только фиксированные безопасные поля lease-ошибки. */
  toJSON(): {
    readonly message: string
    readonly name: string
    readonly rule: GithubDeploymentLeaseRule
  } {
    return { message: this.message, name: this.name, rule: this.rule }
  }
}

/** GitHub adapter атомарной аренды одного deployment application. */
export class GithubDeploymentLeaseAdapter implements DeploymentLeasePort {
  readonly #fetchImplementation: typeof fetch
  readonly #timeoutMs: number

  constructor(
    dependencies: {
      readonly fetchImplementation?: typeof fetch
      readonly timeoutMs?: number
    } = {},
  ) {
    this.#fetchImplementation = dependencies.fetchImplementation ?? fetch
    this.#timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** Получает фиксированную lease-ссылку или отклоняет конкурентную операцию. */
  async acquire(input: {
    readonly applicationId: string
    readonly environment: string
    readonly repository: string
    readonly revision: string
    readonly token: string
    readonly signal?: AbortSignal
  }): Promise<DeploymentLease> {
    this.#requireInput(input)
    const ref = this.#lockRef(input.environment, input.applicationId)
    const response = await this.#request(
      `https://api.github.com/repos/${input.repository}/git/refs`,
      input.token,
      'POST',
      input.signal,
      JSON.stringify({ ref, sha: input.revision }),
    )
    if (response.status === 409 || response.status === 422) {
      this.#discardBody(response)
      throw new GithubDeploymentLeaseError('held')
    }
    if (response.status !== 201) {
      this.#discardBody(response)
      throw new GithubDeploymentLeaseError('request')
    }

    const projected = await this.#readRef(response)
    if (
      projected.ref !== ref ||
      projected.type !== 'commit' ||
      projected.sha !== input.revision
    ) {
      throw new GithubDeploymentLeaseError('contract')
    }

    return Object.freeze({
      ref,
      repository: input.repository,
      revision: input.revision,
    })
  }

  /** Освобождает только ранее полученную lease-ссылку. */
  async release(input: {
    readonly lease: DeploymentLease
    readonly token: string
    readonly signal?: AbortSignal
  }): Promise<void> {
    const refPath = this.#requireLease(input.lease)
    const base = `https://api.github.com/repos/${input.lease.repository}/git`
    const current = await this.#request(
      `${base}/ref/${refPath}`,
      input.token,
      'GET',
      input.signal,
    )
    if (current.status !== 200) {
      this.#discardBody(current)
      throw new GithubDeploymentLeaseError('request')
    }
    const projected = await this.#readRef(current)
    if (
      projected.ref !== input.lease.ref ||
      projected.type !== 'commit' ||
      projected.sha !== input.lease.revision
    ) {
      throw new GithubDeploymentLeaseError('lost')
    }

    const deleted = await this.#request(
      `${base}/refs/${refPath}`,
      input.token,
      'DELETE',
      input.signal,
    )
    if (deleted.status !== 204) {
      this.#discardBody(deleted)
      throw new GithubDeploymentLeaseError('request')
    }
  }

  #lockRef(environment: string, applicationId: string): string {
    const applicationHash = createHash('sha256')
      .update(applicationId)
      .digest('hex')
      .slice(0, 16)
    return `refs/tags/frontend-deployment-lock/${environment}-${applicationHash}`
  }

  #requireInput(input: {
    readonly applicationId: string
    readonly environment: string
    readonly repository: string
    readonly revision: string
    readonly token: string
  }): void {
    if (
      input.applicationId === '' ||
      !environmentPattern.test(input.environment) ||
      !repositoryPattern.test(input.repository) ||
      !revisionPattern.test(input.revision) ||
      input.token === ''
    ) {
      throw new GithubDeploymentLeaseError('contract')
    }
  }

  #requireLease(lease: DeploymentLease): string {
    if (
      !repositoryPattern.test(lease.repository) ||
      !revisionPattern.test(lease.revision) ||
      !/^refs\/tags\/frontend-deployment-lock\/[a-z0-9-]+-[0-9a-f]{16}$/u.test(
        lease.ref,
      )
    ) {
      throw new GithubDeploymentLeaseError('contract')
    }
    return lease.ref.slice('refs/'.length)
  }

  async #request(
    url: string,
    token: string,
    method: 'DELETE' | 'GET' | 'POST',
    signal?: AbortSignal,
    body?: string,
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs)
    const requestSignal =
      signal === undefined
        ? timeoutSignal
        : AbortSignal.any([timeoutSignal, signal])
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }

    try {
      const response = await this.#fetchImplementation(url, {
        ...(body === undefined ? {} : { body }),
        credentials: 'omit',
        headers,
        method,
        redirect: 'error',
        signal: requestSignal,
      })
      if (
        response.redirected ||
        (response.status >= 300 && response.status < 400)
      ) {
        this.#discardBody(response)
        throw new GithubDeploymentLeaseError('request')
      }
      return response
    } catch (error) {
      if (error instanceof GithubDeploymentLeaseError) {
        throw error
      }
      throw new GithubDeploymentLeaseError('request')
    }
  }

  async #readRef(response: Response): Promise<{
    readonly ref: string
    readonly sha: string
    readonly type: string
  }> {
    try {
      const body: unknown = await response.json()
      if (
        typeof body !== 'object' ||
        body === null ||
        !('ref' in body) ||
        typeof body.ref !== 'string' ||
        !('object' in body) ||
        typeof body.object !== 'object' ||
        body.object === null ||
        !('sha' in body.object) ||
        typeof body.object.sha !== 'string' ||
        !('type' in body.object) ||
        typeof body.object.type !== 'string'
      ) {
        throw new GithubDeploymentLeaseError('contract')
      }
      return {
        ref: body.ref,
        sha: body.object.sha,
        type: body.object.type,
      }
    } catch (error) {
      if (error instanceof GithubDeploymentLeaseError) {
        throw error
      }
      throw new GithubDeploymentLeaseError('contract')
    }
  }

  #discardBody(response: Response): void {
    void response.body?.cancel().catch(() => undefined)
  }
}
