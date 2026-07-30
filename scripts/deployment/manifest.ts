import { readFile } from 'node:fs/promises'
import { z } from 'zod'

const environmentPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u
const imageRefPattern =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@sha256:[0-9a-f]{64}$/u
const repositoryPattern =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/iu
const revisionPattern = /^[0-9a-f]{40}$/u
const smokePathPattern = /^\/(?!\/)[^\s?#]*$/u
const workflowPathPattern =
  /^\/([^/]+)\/([^/]+)\/actions\/runs\/[1-9][0-9]*\/attempts\/[1-9][0-9]*$/u
/** Неизменяемая ссылка на exact OCI digest и соответствующую Git-ревизию. */
export interface DeploymentImageReference {
  readonly imageRef: string
  readonly revision: string
}

/** Допустимый сценарий первого развёртывания или последующего продвижения. */
export type DeploymentMode = 'bootstrap' | 'promotion'

/** Проверенный, не содержащий секретов манифест одного frontend-релиза. */
export interface FrontendDeploymentManifest {
  readonly schemaVersion: 1
  readonly mode: DeploymentMode
  readonly environment: string
  readonly repository: string
  readonly workflowRunUrl: string
  readonly publicBaseUrl: string
  readonly candidate: DeploymentImageReference
  readonly expectedCurrent: DeploymentImageReference | null
  readonly smokePaths: readonly string[]
}

/** Безопасное описание одного нарушения входного deployment-контракта. */
export interface DeploymentInputIssue {
  readonly path: string
  readonly rule: string
}

/**
 * Ошибка проверки deployment-входа с безопасной сериализацией.
 *
 * @remarks
 * Не сохраняет исходный ввод и не включает отклонённые значения в сообщение
 * или JSON-представление.
 */
export class DeploymentInputError extends Error {
  readonly issues: readonly DeploymentInputIssue[]

  constructor(issues: readonly DeploymentInputIssue[]) {
    super('Invalid deployment input')
    this.name = 'DeploymentInputError'
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    )
  }

  /** Возвращает только фиксированную redacted-метаинформацию ошибки. */
  toJSON(): {
    readonly name: string
    readonly message: string
    readonly issues: readonly DeploymentInputIssue[]
  } {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues,
    }
  }
}

const imageReferenceSchema = z.strictObject({
  imageRef: z.string().refine((value) => imageRefPattern.test(value), {
    message: 'image_ref_format',
  }),
  revision: z.string().refine((value) => revisionPattern.test(value), {
    message: 'revision_format',
  }),
})

const manifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    mode: z.enum(['bootstrap', 'promotion']),
    environment: z.string().refine((value) => environmentPattern.test(value), {
      message: 'environment_format',
    }),
    repository: z.string().refine((value) => repositoryPattern.test(value), {
      message: 'repository_format',
    }),
    workflowRunUrl: z.string(),
    publicBaseUrl: z.string(),
    candidate: imageReferenceSchema,
    expectedCurrent: imageReferenceSchema.nullable(),
    smokePaths: z
      .array(
        z.string().refine((value) => smokePathPattern.test(value), {
          message: 'smoke_path_format',
        }),
      )
      .min(1),
  })
  .superRefine((manifest, context) => {
    validateWorkflowRunUrl(manifest, context)
    validatePublicBaseUrl(manifest.publicBaseUrl, context)
    validateImages(manifest, context)
    validateMode(manifest, context)
    validateSmokePaths(manifest.smokePaths, context)
  })
  .transform((manifest) => ({
    ...manifest,
    publicBaseUrl: manifest.publicBaseUrl.endsWith('/')
      ? manifest.publicBaseUrl.slice(0, -1)
      : manifest.publicBaseUrl,
  }))

function addIssue(
  context: z.RefinementCtx,
  path: readonly (string | number)[],
  rule: string,
): void {
  context.addIssue({
    code: 'custom',
    message: rule,
    path: [...path],
  })
}

function validateWorkflowRunUrl(
  manifest: z.infer<typeof manifestSchema> | z.input<typeof manifestSchema>,
  context: z.RefinementCtx,
): void {
  let url: URL
  try {
    url = new URL(manifest.workflowRunUrl)
  } catch {
    addIssue(context, ['workflowRunUrl'], 'workflow_run_url_format')
    return
  }

  const pathMatch = workflowPathPattern.exec(url.pathname)
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'github.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    pathMatch === null
  ) {
    addIssue(context, ['workflowRunUrl'], 'workflow_run_url_format')
    return
  }

  const workflowRepository = `${pathMatch[1]}/${pathMatch[2]}`
  if (workflowRepository.toLowerCase() !== manifest.repository.toLowerCase()) {
    addIssue(context, ['workflowRunUrl'], 'repository_match')
  }
}

function validatePublicBaseUrl(value: string, context: z.RefinementCtx): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    addIssue(context, ['publicBaseUrl'], 'public_base_url_format')
    return
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    addIssue(context, ['publicBaseUrl'], 'public_base_url_format')
  }
}

function validateImages(
  manifest: z.input<typeof manifestSchema>,
  context: z.RefinementCtx,
): void {
  const repositoryPrefix = `ghcr.io/${manifest.repository.toLowerCase()}@sha256:`
  if (!manifest.candidate.imageRef.startsWith(repositoryPrefix)) {
    addIssue(context, ['candidate', 'imageRef'], 'repository_match')
  }

  if (manifest.expectedCurrent !== null) {
    if (!manifest.expectedCurrent.imageRef.startsWith(repositoryPrefix)) {
      addIssue(context, ['expectedCurrent', 'imageRef'], 'repository_match')
    }
    if (manifest.expectedCurrent.imageRef === manifest.candidate.imageRef) {
      addIssue(
        context,
        ['expectedCurrent', 'imageRef'],
        'distinct_from_candidate',
      )
    }
  }
}

function validateMode(
  manifest: z.input<typeof manifestSchema>,
  context: z.RefinementCtx,
): void {
  if (manifest.mode === 'bootstrap' && manifest.expectedCurrent !== null) {
    addIssue(context, ['expectedCurrent'], 'bootstrap_requires_null')
  }
  if (manifest.mode === 'promotion' && manifest.expectedCurrent === null) {
    addIssue(context, ['expectedCurrent'], 'promotion_requires_current')
  }
}

function validateSmokePaths(
  smokePaths: readonly string[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>()
  smokePaths.forEach((path, index) => {
    if (seen.has(path)) {
      addIssue(context, ['smokePaths', index], 'unique')
    }
    seen.add(path)

    if (/^(?:\/v1|\/health|\/_frontend\/health)(?:\/|$)/u.test(path)) {
      addIssue(context, ['smokePaths', index], 'smoke_path_reserved')
    }
  })
}

function issuePath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.')
}

function toDeploymentIssue(issue: z.core.$ZodIssue): DeploymentInputIssue {
  const rule = issue.code === 'custom' ? issue.message : issue.code
  return {
    path: issuePath(issue.path),
    rule,
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

/**
 * Строго проверяет неизвестный JSON-compatible ввод как release manifest.
 *
 * @returns Глубоко замороженный манифест с нормализованным URL-origin.
 * @throws {@link DeploymentInputError} без сохранения исходных значений.
 */
export function parseDeploymentManifest(
  input: unknown,
): FrontendDeploymentManifest {
  const parsed = manifestSchema.safeParse(input)
  if (!parsed.success) {
    throw new DeploymentInputError(parsed.error.issues.map(toDeploymentIssue))
  }

  return deepFreeze(parsed.data)
}

/**
 * Читает JSON-файл и проверяет его как release manifest.
 *
 * @remarks
 * Ошибки чтения и JSON-синтаксиса преобразуются в redacted
 * {@link DeploymentInputError}.
 */
export async function readDeploymentManifest(
  path: string,
): Promise<FrontendDeploymentManifest> {
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch {
    throw new DeploymentInputError([{ path: '', rule: 'read_failed' }])
  }

  let input: unknown
  try {
    input = JSON.parse(contents) as unknown
  } catch {
    throw new DeploymentInputError([{ path: '', rule: 'json_format' }])
  }

  return parseDeploymentManifest(input)
}
