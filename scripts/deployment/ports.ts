import type { DeploymentImageReference } from './manifest.ts'

/** Порт проверки exact GitHub Actions run attempt для опубликованной ревизии. */
export interface PublicationVerificationPort {
  verify(input: {
    readonly integrationBranch: string
    readonly repository: string
    readonly revision: string
    readonly workflowRunUrl: string
    readonly token: string
    readonly signal?: AbortSignal
  }): Promise<void>
}

/** Порт проверки digest, OCI provenance и доступности registry image. */
export interface ImageVerificationPort {
  verify(input: {
    readonly image: DeploymentImageReference
    readonly repository: string
    readonly workflowRunUrl?: string
    readonly registryUrl: string
    readonly username: string
    readonly password: string
    readonly signal?: AbortSignal
  }): Promise<void>
}

/** Минимальная проекция существующего Dokploy application. */
export interface DokployApplication {
  readonly applicationId: string
  readonly sourceType: string
  readonly dockerImage: string | null
}

/** Минимальная проекция одной Dokploy deployment-записи. */
export interface DokployDeploymentRecord {
  readonly deploymentId: string
  readonly status: string
  readonly title: string
}

/** Узкий порт чтения и явного изменения одного Dokploy application. */
export interface DokployPort {
  getApplication(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<DokployApplication>
  listDeployments(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<readonly DokployDeploymentRecord[]>
  updateImage(
    applicationId: string,
    imageRef: string,
    signal?: AbortSignal,
  ): Promise<void>
  deploy(input: {
    readonly applicationId: string
    readonly title: string
    readonly description: string
    readonly signal?: AbortSignal
  }): Promise<void>
}

/** Результат hosted smoke с проверенными UI-путями и API probe status. */
export interface HostedSmokeResult {
  readonly checkedPaths: readonly string[]
  readonly apiProbeStatus: number
}

/** Порт проверки публичной HTTPS-границы развернутого frontend. */
export interface HostedSmokePort {
  verify(
    publicBaseUrl: string,
    smokePaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<HostedSmokeResult>
}

/** Порт монотонного времени и abort-aware ожидания для polling. */
export interface ClockPort {
  nowMs(): number
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>
}

/** Тип явно запущенной изменяющей deployment-операции. */
export type DeploymentOperation = 'bootstrap' | 'promote' | 'rollback'

/** Итог операции с отдельным состоянием неизвестного live-результата. */
export type DeploymentOutcome = 'succeeded' | 'failed' | 'indeterminate'

/** Redacted evidence одной frontend deployment-операции. */
export interface FrontendDeploymentEvidence {
  readonly schemaVersion: 1
  readonly operation: DeploymentOperation
  readonly outcome: DeploymentOutcome
  readonly environment: string
  readonly repository: string
  readonly applicationId: string
  readonly workflowRunUrl: string | null
  readonly publicBaseUrl: string
  readonly smokePaths: readonly string[]
  readonly previous: DeploymentImageReference | null
  readonly target: DeploymentImageReference
  readonly startedAt: string
  readonly finishedAt: string
  readonly deploymentId?: string
  readonly terminalStatus?: string
  readonly smoke?: HostedSmokeResult
  readonly failedStep?: string
}

/** Порт безопасной записи redacted deployment evidence. */
export interface EvidencePort {
  write(
    directory: string,
    evidence: FrontendDeploymentEvidence,
  ): Promise<string>
}
