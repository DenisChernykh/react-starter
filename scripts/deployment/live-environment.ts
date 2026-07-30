import { DeploymentInputError, type DeploymentInputIssue } from './manifest.ts'

const requiredVariableNames = [
  'DOKPLOY_BASE_URL',
  'DOKPLOY_API_KEY',
  'DOKPLOY_APPLICATION_ID',
  'GITHUB_TOKEN',
  'GHCR_REGISTRY_URL',
  'GHCR_USERNAME',
  'GHCR_PASSWORD',
] as const

/** Проверенные process-only credentials и координаты live deployment. */
export interface DeploymentLiveEnvironment {
  readonly dokployBaseUrl: string
  readonly dokployApiKey: string
  readonly dokployApplicationId: string
  readonly githubToken: string
  readonly ghcrRegistryUrl: 'https://ghcr.io'
  readonly ghcrUsername: string
  readonly ghcrPassword: string
}

function isHttpsOrigin(value: string): boolean {
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

/**
 * Читает только семь разрешённых live-переменных и проверяет их границы.
 *
 * @remarks
 * Исходный `process.env` не сохраняется. Ошибки содержат только имена
 * переменных и фиксированные правила, но никогда не их значения.
 *
 * @returns Замороженный camelCase-объект для live-адаптеров.
 */
export function parseDeploymentLiveEnvironment(
  input: NodeJS.ProcessEnv,
): DeploymentLiveEnvironment {
  const values: Partial<
    Record<(typeof requiredVariableNames)[number], string>
  > = {}
  const issues: DeploymentInputIssue[] = []

  for (const name of requiredVariableNames) {
    const value = input[name]
    if (value === undefined || value.trim() === '') {
      issues.push({ path: name, rule: 'required' })
      continue
    }
    values[name] = value
  }

  if (issues.length > 0) {
    throw new DeploymentInputError(issues)
  }

  const dokployBaseUrl = values.DOKPLOY_BASE_URL as string
  const ghcrRegistryUrl = values.GHCR_REGISTRY_URL as string
  if (!isHttpsOrigin(dokployBaseUrl)) {
    issues.push({ path: 'DOKPLOY_BASE_URL', rule: 'https_origin' })
  }
  if (ghcrRegistryUrl !== 'https://ghcr.io') {
    issues.push({
      path: 'GHCR_REGISTRY_URL',
      rule: 'exact_ghcr_registry',
    })
  }
  if (issues.length > 0) {
    throw new DeploymentInputError(issues)
  }

  return Object.freeze({
    dokployBaseUrl: new URL(dokployBaseUrl).origin,
    dokployApiKey: values.DOKPLOY_API_KEY as string,
    dokployApplicationId: values.DOKPLOY_APPLICATION_ID as string,
    githubToken: values.GITHUB_TOKEN as string,
    ghcrRegistryUrl: 'https://ghcr.io',
    ghcrUsername: values.GHCR_USERNAME as string,
    ghcrPassword: values.GHCR_PASSWORD as string,
  })
}
