import { randomUUID } from 'node:crypto'
import { chmod, link, mkdir, open, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { EvidencePort, FrontendDeploymentEvidence } from './ports.ts'
import { isCanonicalSmokePath } from './smoke-path.ts'

const environmentPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u
const imageRefPattern =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@sha256:[0-9a-f]{64}$/u
const repositoryPattern =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/iu
const revisionPattern = /^[0-9a-f]{40}$/u
const httpsOriginInputPattern = /^https:\/\/[^/?#\\\s]+\/?$/iu
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const workflowRunPattern =
  /^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/actions\/runs\/[1-9][0-9]*\/attempts\/[1-9][0-9]*$/iu

const imageSchema = z.strictObject({
  imageRef: z.string().refine((value) => imageRefPattern.test(value)),
  revision: z.string().refine((value) => revisionPattern.test(value)),
})

const smokeSchema = z.strictObject({
  checkedPaths: z.array(z.string().refine(isCanonicalSmokePath)),
  apiProbeStatus: z.number().int().min(400).max(499),
  frontendRevision: z.string().refine((value) => revisionPattern.test(value)),
})

const evidenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    operation: z.enum(['bootstrap', 'promote', 'rollback']),
    outcome: z.enum(['succeeded', 'failed', 'indeterminate']),
    environment: z.string().refine((value) => environmentPattern.test(value)),
    repository: z.string().refine((value) => repositoryPattern.test(value)),
    applicationId: z.string().min(1).max(256),
    workflowRunUrl: z
      .string()
      .refine((value) => workflowRunPattern.test(value))
      .nullable(),
    publicBaseUrl: z.string(),
    smokePaths: z.array(z.string().refine(isCanonicalSmokePath)).min(1),
    previous: imageSchema.nullable(),
    target: imageSchema,
    startedAt: z.string().refine(isTimestamp),
    finishedAt: z.string().refine(isTimestamp),
    deploymentId: z.string().min(1).max(256).optional(),
    terminalStatus: z.string().min(1).max(64).optional(),
    smoke: smokeSchema.optional(),
    failedStep: z.string().min(1).max(128).optional(),
  })
  .superRefine((evidence, context) => {
    if (!isHttpsOrigin(evidence.publicBaseUrl)) {
      context.addIssue({
        code: 'custom',
        path: ['publicBaseUrl'],
        message: 'origin',
      })
    }
    const seenSmokePaths = new Set<string>()
    evidence.smokePaths.forEach((path, index) => {
      if (seenSmokePaths.has(path)) {
        context.addIssue({
          code: 'custom',
          path: ['smokePaths', index],
          message: 'unique',
        })
      }
      seenSmokePaths.add(path)
      if (/^(?:\/v1|\/health|\/_frontend)(?:\/|$)/u.test(path)) {
        context.addIssue({
          code: 'custom',
          path: ['smokePaths', index],
          message: 'reserved',
        })
      }
    })
    const repositoryPrefix = `ghcr.io/${evidence.repository.toLowerCase()}@sha256:`
    if (!evidence.target.imageRef.startsWith(repositoryPrefix)) {
      context.addIssue({ code: 'custom', path: ['target'], message: 'image' })
    }
    if (
      evidence.previous !== null &&
      !evidence.previous.imageRef.startsWith(repositoryPrefix)
    ) {
      context.addIssue({ code: 'custom', path: ['previous'], message: 'image' })
    }
    if (
      evidence.previous !== null &&
      evidence.previous.imageRef === evidence.target.imageRef
    ) {
      context.addIssue({
        code: 'custom',
        path: ['previous'],
        message: 'distinct',
      })
    }
    if ((evidence.operation === 'bootstrap') !== (evidence.previous === null)) {
      context.addIssue({
        code: 'custom',
        path: ['previous'],
        message: 'operation',
      })
    }
    if (
      (evidence.operation === 'rollback') !==
      (evidence.workflowRunUrl === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['workflowRunUrl'],
        message: 'operation',
      })
    }
    if (
      (evidence.outcome === 'succeeded') !==
      (evidence.failedStep === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['failedStep'],
        message: 'outcome',
      })
    }
    if (
      evidence.outcome === 'succeeded' &&
      (evidence.deploymentId === undefined ||
        evidence.terminalStatus !== 'done' ||
        evidence.smoke === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'success',
      })
    }
    if (Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'order',
      })
    }
  })

function isTimestamp(value: string): boolean {
  return timestampPattern.test(value) && !Number.isNaN(Date.parse(value))
}

function isHttpsOrigin(value: string): boolean {
  if (!httpsOriginInputPattern.test(value)) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze)
    return Object.freeze(value)
  }
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    return Object.freeze(value)
  }
  return value
}

/** Redacted ошибка чтения или атомарной записи deployment evidence. */
export class EvidenceFileError extends Error {
  readonly category: string

  constructor(category: string) {
    super('Deployment evidence operation failed')
    this.name = 'EvidenceFileError'
    this.category = category
  }

  /** Сериализует только фиксированную безопасную категорию. */
  toJSON(): {
    readonly name: string
    readonly message: string
    readonly category: string
  } {
    return { category: this.category, message: this.message, name: this.name }
  }
}

/** Строго проверяет неизвестный JSON-compatible evidence-ввод. */
export function parseDeploymentEvidence(
  input: unknown,
): FrontendDeploymentEvidence {
  const parsed = evidenceSchema.safeParse(input)
  if (!parsed.success) {
    throw new EvidenceFileError('invalid_evidence')
  }
  return deepFreeze(parsed.data)
}

/** Читает и строго проверяет один evidence JSON без раскрытия path/body. */
export async function readDeploymentEvidence(
  path: string,
): Promise<FrontendDeploymentEvidence> {
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch {
    throw new EvidenceFileError('read_failed')
  }

  let input: unknown
  try {
    input = JSON.parse(contents) as unknown
  } catch {
    throw new EvidenceFileError('json_format')
  }
  return parseDeploymentEvidence(input)
}

function evidenceFilename(evidence: FrontendDeploymentEvidence): string {
  const timestamp = evidence.finishedAt.replace(/[-:.]/gu, '')
  return `${evidence.environment}-${evidence.operation}-${evidence.target.revision.slice(0, 12)}-${timestamp}.json`
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  )
}

/**
 * Записывает evidence атомарно, exclusively и с режимом файла `0600`.
 *
 * @remarks
 * Каталог принудительно получает `0700`. Временный файл создаётся рядом с
 * destination через `wx`, синхронизируется и публикуется атомарным no-clobber
 * hard link. Поэтому final path никогда не наблюдается пустым или частичным.
 */
export class EvidenceFileAdapter implements EvidencePort {
  async write(
    directory: string,
    evidence: FrontendDeploymentEvidence,
  ): Promise<string> {
    const parsed = parseDeploymentEvidence(evidence)
    const filename = evidenceFilename(parsed)
    const destination = join(directory, filename)
    const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`)
    let temporaryExists = false
    let failure: EvidenceFileError | undefined

    try {
      await mkdir(directory, { mode: 0o700, recursive: true })
      await chmod(directory, 0o700)
      const handle = await open(temporary, 'wx', 0o600)
      temporaryExists = true
      try {
        await handle.writeFile(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await chmod(temporary, 0o600)

      await link(temporary, destination)
    } catch (error) {
      failure =
        error instanceof EvidenceFileError
          ? error
          : new EvidenceFileError(
              isFileExistsError(error) ? 'destination_exists' : 'write_failed',
            )
    }

    if (temporaryExists) {
      try {
        await rm(temporary, { force: true })
      } catch {
        failure = new EvidenceFileError(
          failure === undefined ? 'cleanup_failed' : 'write_and_cleanup_failed',
        )
      }
    }

    if (failure !== undefined) {
      throw failure
    }
    return destination
  }
}
