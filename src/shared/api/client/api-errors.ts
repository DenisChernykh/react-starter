import axios from 'axios'
import { z } from 'zod'

import type { ProblemResponseDto } from '../generated/model'
import { AuthGetCsrfToken401Response } from '../generated-zod/auth/auth.zod'

// Orval emits response schemas per operation; this response references the
// shared ProblemResponseDto contract whose code enum is used by every problem.
const problemDocumentSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  instance: z.string(),
  code: AuthGetCsrfToken401Response.shape.code,
  requestId: z.string(),
  errors: z
    .array(
      z.object({
        pointer: z.string(),
        code: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
})

/** Структурированное тело ошибки API в формате Problem Details. */
export type ProblemDocumentLike = z.infer<typeof problemDocumentSchema>
/** Допустимый код ошибки, возвращаемый API. */
export type ProblemCode = ProblemResponseDto['code']

/** Ошибка API с проверенным телом Problem Details. */
export class ApiProblemError<
  TProblem extends ProblemDocumentLike = ProblemDocumentLike,
> extends Error {
  public readonly name = 'ApiProblemError'
  public readonly problem: TProblem
  public readonly retryAfterMs: number | null

  public constructor(problem: TProblem, retryAfterMs: number | null) {
    super(problem.title)
    this.problem = problem
    this.retryAfterMs = retryAfterMs
  }

  public get status() {
    return this.problem.status
  }

  public get code() {
    return this.problem.code
  }

  public get requestId() {
    return this.problem.requestId
  }
}

/** Ошибка отсутствия сетевого соединения с API. */
export class ApiNetworkError extends Error {
  public readonly name = 'ApiNetworkError'

  public constructor() {
    super('The API could not be reached')
  }
}

/** Ошибка некорректного ответа API. */
export class ApiProtocolError extends Error {
  public readonly name = 'ApiProtocolError'

  public constructor() {
    super('The API returned an invalid error response')
  }
}

/** Объединение нормализованных ошибок клиентского API. */
export type ApiClientError<
  TProblem extends ProblemDocumentLike = ProblemDocumentLike,
> = ApiProblemError<TProblem> | ApiNetworkError | ApiProtocolError

function parseRetryAfter(value: unknown, now: number): number | null {
  if (typeof value !== 'string') return null

  const retryAfter = value.trim()
  if (/^\d+$/u.test(retryAfter)) {
    const seconds = Number(retryAfter)
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : null
  }

  const retryAt = Date.parse(retryAfter)
  if (Number.isNaN(retryAt) || retryAt <= now) return null

  return retryAt - now
}

/** Преобразует неизвестную ошибку Axios в нормализованную ошибку клиентского API. */
export function normalizeApiError<
  TProblem extends ProblemDocumentLike = ProblemDocumentLike,
>(error: unknown, now = Date.now()): ApiClientError<TProblem> {
  if (!axios.isAxiosError(error)) return new ApiProtocolError()
  if (error.response === undefined) return new ApiNetworkError()

  const contentType = String(error.response.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (contentType !== 'application/problem+json') {
    return new ApiProtocolError()
  }

  const parsed = problemDocumentSchema.safeParse(error.response.data)
  if (!parsed.success || parsed.data.status !== error.response.status) {
    return new ApiProtocolError()
  }

  return new ApiProblemError(
    parsed.data as TProblem,
    parseRetryAfter(error.response.headers['retry-after'], now),
  )
}

/** Проверяет, имеет ли ошибка API указанный код. */
export function isProblemCode<TCode extends ProblemCode>(
  error: unknown,
  code: TCode,
): error is ApiProblemError<ProblemDocumentLike & { code: TCode }> {
  return error instanceof ApiProblemError && error.code === code
}
