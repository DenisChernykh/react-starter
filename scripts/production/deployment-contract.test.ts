// @vitest-environment node

import { execFile as execFileCallback } from 'node:child_process'
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type RecordValue = Record<string, unknown>
const execFile = promisify(execFileCallback)

type CommandResult = {
  readonly code: number
  readonly stderr: string
  readonly stdout: string
}

async function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandResult & { readonly log?: string }> {
  try {
    const result = await execFile(command, [...args], {
      env,
      encoding: 'utf8',
    })
    return { code: 0, stderr: result.stderr, stdout: result.stdout }
  } catch (error) {
    const record = error as {
      readonly code?: unknown
      readonly stderr?: unknown
      readonly stdout?: unknown
    }
    return {
      code: typeof record.code === 'number' ? record.code : 1,
      stderr: typeof record.stderr === 'string' ? record.stderr : '',
      stdout: typeof record.stdout === 'string' ? record.stdout : '',
    }
  }
}

async function writeExecutable(path: string, source: string): Promise<void> {
  await writeFile(path, source, 'utf8')
  await chmod(path, 0o755)
}

async function runWithFakeDocker(
  mode: string,
  approvedImage: string,
): Promise<CommandResult & { readonly log?: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'react-starter-compose-'))
  try {
    const fakeDockerPath = join(directory, 'docker')
    const composePath = join(directory, 'compose.yaml')
    const envPath = join(directory, 'compose.env')
    await writeExecutable(
      fakeDockerPath,
      String.raw`#!/bin/sh
set -eu
for arg do
  printf '%s\n' "$arg" >> "$DOCKER_FAKE_LOG"
done
last=''
for arg do
  last="$arg"
done
if [ "$last" = "--quiet" ]; then
  exit 0
fi
if [ "$last" != "--images" ]; then
  exit 91
fi
case "$DOCKER_FAKE_MODE" in
  valid)
    printf '%s\n' "$DOCKER_FAKE_IMAGE"
    ;;
  resolved-tag)
    printf '%s\n' 'ghcr.io/example/react-starter:stage'
    ;;
  mismatch)
    printf '%s\n' 'ghcr.io/example/react-starter@sha256:1111111111111111111111111111111111111111111111111111111111111111'
    ;;
  multiple)
    printf '%s\n%s\n' "$DOCKER_FAKE_IMAGE" 'ghcr.io/example/other@sha256:2222222222222222222222222222222222222222222222222222222222222222'
    ;;
  *)
    exit 92
    ;;
esac
`,
    )
    await writeFile(composePath, 'services: {}\n', 'utf8')
    await writeFile(envPath, 'FRONTEND_IMAGE=placeholder\n', 'utf8')
    const result = await runCommand(
      'scripts/production/verify-compose-image.sh',
      [composePath, envPath, approvedImage],
      {
        ...process.env,
        DOCKER_FAKE_IMAGE: approvedImage,
        DOCKER_FAKE_LOG: join(directory, 'docker-args.log'),
        DOCKER_FAKE_MODE: mode,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
      },
    )
    return {
      ...result,
      log: await readFile(join(directory, 'docker-args.log'), 'utf8').catch(
        () => undefined,
      ),
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function runWithFakeTopology(
  mode: 'valid' | 'mismatch',
): Promise<CommandResult & { readonly log?: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'react-starter-topology-'))
  try {
    const fakeDockerPath = join(directory, 'docker')
    const composePath = join(directory, 'compose.yaml')
    const envPath = join(directory, 'compose.env')
    await writeExecutable(
      fakeDockerPath,
      String.raw`#!/bin/sh
set -eu
for arg do
  printf '%s\n' "$arg" >> "$DOCKER_FAKE_LOG"
done
last=''
for arg do
  last="$arg"
done
if [ "$last" = '--quiet' ]; then
  exit 0
fi
if [ "$last" != 'config' ]; then
  exit 91
fi
if [ "$DOCKER_FAKE_MODE" = 'valid' ]; then
  cat <<'EOF'
name: expected-project
services:
  frontend:
    networks:
      edge:
        aliases:
          - expected-alias
networks:
  edge:
    name: expected-network
    external: true
EOF
else
  cat <<'EOF'
name: wrong-project
services:
  frontend:
    networks:
      edge:
        aliases:
          - wrong-alias
networks:
  edge:
    name: wrong-network
    external: true
EOF
fi
`,
    )
    await writeFile(composePath, 'services: {}\n', 'utf8')
    await writeFile(envPath, 'FRONTEND_IMAGE=placeholder\n', 'utf8')
    const result = await runCommand(
      'scripts/production/verify-compose-topology.sh',
      [
        composePath,
        envPath,
        'expected-project',
        'expected-network',
        'expected-alias',
      ],
      {
        ...process.env,
        DOCKER_FAKE_LOG: join(directory, 'docker-args.log'),
        DOCKER_FAKE_MODE: mode,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
      },
    )
    return {
      ...result,
      log: await readFile(join(directory, 'docker-args.log'), 'utf8').catch(
        () => undefined,
      ),
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function runWithFakeCurl(scenario: string): Promise<
  CommandResult & {
    readonly log?: string
    readonly urls?: readonly string[]
  }
> {
  const directory = await mkdtemp(join(tmpdir(), 'react-starter-hosted-'))
  try {
    const fakeCurlPath = join(directory, 'curl')
    const argsLogPath = join(directory, 'curl-args.log')
    await writeExecutable(
      fakeCurlPath,
      String.raw`#!/bin/sh
set -eu
OUTPUT=''
HEADERS=''
URL=''
if [ -n "$CURL_ARGS_LOG" ]; then
  for arg do
    printf '%s\n' "$arg" >> "$CURL_ARGS_LOG"
  done
fi
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output|--dump-header|--write-out|--connect-timeout|--max-time|--proto)
      value="$2"
      if [ "$1" = "--output" ]; then OUTPUT="$value"; fi
    if [ "$1" = "--dump-header" ]; then HEADERS="$value"; fi
      shift 2
      ;;
    --silent|--show-error|--tlsv1.2)
      shift
      ;;
    *)
      URL="$1"
      shift
      ;;
  esac
done
if [ -n "$CURL_URL_LOG" ]; then
  printf '%s\n' "$URL" >> "$CURL_URL_LOG"
fi
if [ "$CURL_FAKE_SCENARIO" = 'signal' ]; then
  kill -TERM "$PPID"
fi
PATH_NAME="$(printf '%s' "$URL" | sed 's#^https://frontend.example.test##')"
respond() {
  printf 'HTTP/1.1 %s fake\nContent-Type: %s\n\n' "$1" "$2" > "$HEADERS"
  printf '%s' "$3" > "$OUTPUT"
  if [ "$PATH_NAME" = '/_frontend/identity' ]; then
    printf '\n' >> "$OUTPUT"
  fi
  if [ "$PATH_NAME" = '/_frontend/health' ]; then
    printf '\n' >> "$OUTPUT"
  fi
  printf '%s' "$1"
}
html='<html><body><div id="root"></div></body></html>'
problem='{"type":"https://example.test/problem","title":"probe"}'
identity_body="$(printf '%s\n%s\n' "$EXPECTED_SOURCE" "$EXPECTED_REVISION")"
wrong_identity_body="$(printf '%s\n%s\n' 'https://github.com/wrong/source' "$EXPECTED_REVISION")"
case "$CURL_FAKE_SCENARIO:$PATH_NAME" in
  success:/_frontend/health|frontend-backend:/_frontend/health|wrong-identity:/_frontend/health|redirect:/_frontend/health|signal:/_frontend/health)
    respond 200 'text/plain' 'ok'
    ;;
  success:/_frontend/identity|frontend-backend:/_frontend/identity|redirect:/_frontend/identity)
    respond 200 'text/plain' "$identity_body"
    ;;
  wrong-identity:/_frontend/identity)
    respond 200 'text/plain' "$wrong_identity_body"
    ;;
  redirect:/)
    respond 302 'text/html' ''
    ;;
  success:/|success:/login|frontend-backend:/|frontend-backend:/login|wrong-identity:/|wrong-identity:/login|redirect:/login)
    respond 200 'text/html' "$html"
    ;;
  frontend-backend:/v1)
    respond 200 'text/html' "$html"
    ;;
  success:/v1|success:/v1/__frontend_deployment_probe__|success:/health|success:/health/__frontend_deployment_probe__|frontend-backend:/v1/__frontend_deployment_probe__|frontend-backend:/health|frontend-backend:/health/__frontend_deployment_probe__|wrong-identity:/v1|wrong-identity:/v1/__frontend_deployment_probe__|wrong-identity:/health|wrong-identity:/health/__frontend_deployment_probe__|redirect:/v1|redirect:/v1/__frontend_deployment_probe__|redirect:/health|redirect:/health/__frontend_deployment_probe__)
    respond 404 'application/problem+json' "$problem"
    ;;
  success:/v10|success:/v1-admin|success:/healthcheck|frontend-backend:/v10|frontend-backend:/v1-admin|frontend-backend:/healthcheck|wrong-identity:/v10|wrong-identity:/v1-admin|wrong-identity:/healthcheck|redirect:/v10|redirect:/v1-admin|redirect:/healthcheck)
    respond 200 'text/html' "$html"
    ;;
  *)
    respond 500 'text/plain' 'unexpected fake curl path'
    ;;
esac
`,
    )
    const result = await runCommand(
      'scripts/production/verify-hosted-routing.sh',
      [
        'https://frontend.example.test',
        'https://github.com/example/react-starter',
        '0123456789abcdef0123456789abcdef01234567',
        '/login',
      ],
      {
        ...process.env,
        CURL_ARGS_LOG: argsLogPath,
        CURL_URL_LOG: join(directory, 'curl-urls.log'),
        CURL_FAKE_SCENARIO: scenario,
        EXPECTED_REVISION: '0123456789abcdef0123456789abcdef01234567',
        EXPECTED_SOURCE: 'https://github.com/example/react-starter',
        PATH: `${directory}:${process.env.PATH ?? ''}`,
      },
    )
    return {
      ...result,
      log: await readFile(argsLogPath, 'utf8').catch(() => undefined),
      urls: (
        await readFile(join(directory, 'curl-urls.log'), 'utf8').catch(() => '')
      )
        .trim()
        .split('\n')
        .filter(Boolean),
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function extractBashBlock(markdown: string, heading: string): string {
  const headingIndex = markdown.indexOf(heading)
  if (headingIndex < 0) {
    throw new Error(`Missing heading: ${heading}`)
  }

  const fenceStart = markdown.indexOf('```bash\n', headingIndex)
  if (fenceStart < 0) {
    throw new Error(`Missing bash block after: ${heading}`)
  }

  const contentStart = fenceStart + '```bash\n'.length
  const fenceEnd = markdown.indexOf('\n```', contentStart)
  if (fenceEnd < 0) {
    throw new Error(`Unclosed bash block after: ${heading}`)
  }

  return markdown.slice(contentStart, fenceEnd)
}

async function runRollbackFailureRecordContract(): Promise<{
  readonly failedRecord: string
  readonly result: CommandResult
}> {
  const directory = await mkdtemp(join(tmpdir(), 'react-starter-rollback-'))
  try {
    const runbook = await readFile(
      'docs/runbooks/frontend-compose-deployment.md',
      'utf8',
    )
    const operationBlock = extractBashBlock(
      runbook,
      '## Host-only records and checked deployment step',
    )
    const fakeDockerPath = join(directory, 'docker')
    const candidateEnvPath = join(directory, 'candidate.env')
    const rollbackEnvPath = join(directory, 'previous.env')
    const scriptPath = join(directory, 'rollback-contract.sh')

    await writeExecutable(fakeDockerPath, '#!/bin/sh\nexit 1\n')
    await writeFile(candidateEnvPath, 'FRONTEND_IMAGE=candidate\n', 'utf8')
    await writeFile(rollbackEnvPath, 'FRONTEND_IMAGE=previous\n', 'utf8')
    await writeExecutable(
      scriptPath,
      `#!/bin/sh
set -eu
RUNTIME_DIR=$TEST_RUNTIME_DIR
ENV_FILE=$TEST_RUNTIME_DIR/current.env
COMPOSE_FILE=$TEST_RUNTIME_DIR/compose.yaml
WAIT_TIMEOUT=1
TARGET_ENV_FILE=$TEST_CANDIDATE_ENV
RECORD_TEMP_FILE=''
CURRENT_ENV_TEMP_FILE=''
EFFECTIVE_FRONTEND_EDGE_NETWORK=example-edge
EFFECTIVE_FRONTEND_EDGE_ALIAS=example-frontend
FRONTEND_ORIGIN=https://frontend.example.test
EXPECTED_SOURCE=https://github.com/example/react-starter
EXPECTED_REVISION=0123456789abcdef0123456789abcdef01234567
HOSTED_ROUTING_CHECKER=true
fail() {
  printf '%s\\n' "$1" >&2
  exit 1
}

verify_edge_alias() {
  return 0
}
${operationBlock}
deploy_target_once "$TEST_RESOLVED_IMAGE" "$TEST_ROLLBACK_ENV"
`,
    )

    const result = await runCommand(scriptPath, [], {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ''}`,
      TEST_CANDIDATE_ENV: candidateEnvPath,
      TEST_RESOLVED_IMAGE:
        'ghcr.io/example/react-starter@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      TEST_ROLLBACK_ENV: rollbackEnvPath,
      TEST_RUNTIME_DIR: directory,
    })
    const failedRecords = (await readdir(directory)).filter((name) =>
      name.startsWith('frontend-compose.failed.'),
    )
    expect(failedRecords).toHaveLength(1)

    return {
      failedRecord: await readFile(join(directory, failedRecords[0]), 'utf8'),
      result,
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function runUnhealthyDeploymentContract(): Promise<{
  readonly failedRecords: readonly string[]
  readonly result: CommandResult
}> {
  const directory = await mkdtemp(join(tmpdir(), 'react-starter-health-'))
  try {
    const runbook = await readFile(
      'docs/runbooks/frontend-compose-deployment.md',
      'utf8',
    )
    const operationBlock = extractBashBlock(
      runbook,
      '## Host-only records and checked deployment step',
    )
    const fakeDockerPath = join(directory, 'docker')
    const targetEnvPath = join(directory, 'target.env')
    const scriptPath = join(directory, 'health-contract.sh')
    const expectedImage =
      'ghcr.io/example/react-starter@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    await writeExecutable(
      fakeDockerPath,
      String.raw`#!/bin/sh
set -eu
case "$*" in
  *'compose'*'up'*) exit 0 ;;
  *'compose'*'ps'*) printf '%s\n' container-id ;;
  *'inspect'*'Config.Image'*) printf '%s\n' "$TEST_EXPECTED_IMAGE" ;;
  *'inspect'*'State.Health'*) printf '%s\n' unhealthy ;;
  *) exit 91 ;;
esac
`,
    )
    await writeFile(targetEnvPath, 'FRONTEND_IMAGE=target\n', 'utf8')
    await writeExecutable(
      scriptPath,
      `#!/bin/sh
set -eu
RUNTIME_DIR=$TEST_RUNTIME_DIR
ENV_FILE=$TEST_RUNTIME_DIR/current.env
COMPOSE_FILE=$TEST_RUNTIME_DIR/compose.yaml
WAIT_TIMEOUT=1
TARGET_ENV_FILE=$TEST_TARGET_ENV
RECORD_TEMP_FILE=''
CURRENT_ENV_TEMP_FILE=''
EFFECTIVE_FRONTEND_EDGE_NETWORK=example-edge
EFFECTIVE_FRONTEND_EDGE_ALIAS=example-frontend
FRONTEND_ORIGIN=https://frontend.example.test
EXPECTED_SOURCE=https://github.com/example/react-starter
EXPECTED_REVISION=0123456789abcdef0123456789abcdef01234567
HOSTED_ROUTING_CHECKER=true
fail() {
  printf '%s\\n' "$1" >&2
  exit 1
}
verify_edge_alias() {
  return 0
}
${operationBlock}
deploy_target_once "$TEST_EXPECTED_IMAGE" "$TEST_TARGET_ENV"
`,
    )

    const result = await runCommand(scriptPath, [], {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ''}`,
      TEST_EXPECTED_IMAGE: expectedImage,
      TEST_RUNTIME_DIR: directory,
      TEST_TARGET_ENV: targetEnvPath,
    })

    return {
      failedRecords: (await readdir(directory)).filter((name) =>
        name.startsWith('frontend-compose.failed.'),
      ),
      result,
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function runSignalRecordContract(): Promise<{
  readonly failedRecords: readonly string[]
  readonly result: CommandResult
}> {
  const directory = await mkdtemp(join(tmpdir(), 'react-starter-signal-'))
  try {
    const runbook = await readFile(
      'docs/runbooks/frontend-compose-deployment.md',
      'utf8',
    )
    const operationBlock = extractBashBlock(
      runbook,
      '## Host-only records and checked deployment step',
    )
    const targetEnvPath = join(directory, 'target.env')
    const scriptPath = join(directory, 'signal-contract.sh')

    await writeFile(targetEnvPath, 'FRONTEND_IMAGE=target\n', 'utf8')
    await writeExecutable(
      scriptPath,
      `#!/bin/sh
set -eu
RUNTIME_DIR=$TEST_RUNTIME_DIR
ENV_FILE=$TEST_RUNTIME_DIR/current.env
COMPOSE_FILE=$TEST_RUNTIME_DIR/compose.yaml
WAIT_TIMEOUT=1
TARGET_ENV_FILE=$TEST_TARGET_ENV
RECORD_TEMP_FILE=''
CURRENT_ENV_TEMP_FILE=''
MUTATION_TARGET_ENV_FILE=$TEST_TARGET_ENV
fail() {
  printf '%s\\n' "$1" >&2
  exit 1
}
${operationBlock}
handle_signal 143
`,
    )

    const result = await runCommand(scriptPath, [], {
      ...process.env,
      TEST_RUNTIME_DIR: directory,
      TEST_TARGET_ENV: targetEnvPath,
    })

    return {
      failedRecords: (await readdir(directory)).filter((name) =>
        name.startsWith('frontend-compose.failed.'),
      ),
      result,
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function requireRecord(value: unknown, description: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected mapping: ${description}`)
  }

  return value as RecordValue
}

async function readContractFiles(): Promise<{
  readonly compose: RecordValue
  readonly composeSource: string
  readonly caddySource: string
}> {
  const [composeSource, caddySource] = await Promise.all([
    readFile('compose.production.yaml', 'utf8'),
    readFile('config/caddy/frontend-ingress.Caddyfile.example', 'utf8'),
  ])

  return {
    compose: requireRecord(parse(composeSource), 'production Compose'),
    composeSource,
    caddySource,
  }
}

describe('production deployment contracts', () => {
  it('defines one secret-free frontend Compose service on an external edge network', async () => {
    const { compose, composeSource } = await readContractFiles()
    const services = requireRecord(compose.services, 'services')
    const frontend = requireRecord(services.frontend, 'frontend service')
    const networks = requireRecord(compose.networks, 'networks')
    const edge = requireRecord(networks.edge, 'edge network')
    const frontendNetworks = requireRecord(
      frontend.networks,
      'frontend networks',
    )
    const frontendEdge = requireRecord(
      frontendNetworks.edge,
      'frontend edge network',
    )
    const logging = requireRecord(frontend.logging, 'frontend logging')
    const loggingOptions = requireRecord(logging.options, 'logging options')
    const healthcheck = requireRecord(
      frontend.healthcheck,
      'frontend healthcheck',
    )

    expect(compose.name).toEqual(
      expect.stringMatching(/^\$\{COMPOSE_PROJECT_NAME:\?.+\}$/u),
    )
    expect(Object.keys(services)).toEqual(['frontend'])
    expect(frontend.image).toEqual(
      expect.stringMatching(/^\$\{FRONTEND_IMAGE:\?.+\}$/u),
    )
    expect(frontend.restart).toBe('unless-stopped')
    expect(healthcheck.test).toEqual([
      'CMD',
      'wget',
      '-qO-',
      'http://127.0.0.1:8080/_frontend/health',
    ])
    expect(frontendEdge.aliases).toEqual([
      expect.stringMatching(/^\$\{FRONTEND_EDGE_ALIAS:\?.+\}$/u),
    ])
    expect(edge).toMatchObject({
      external: true,
      name: expect.stringMatching(/^\$\{FRONTEND_EDGE_NETWORK:\?.+\}$/u),
    })
    expect(logging).toMatchObject({ driver: 'json-file' })
    expect(loggingOptions).toMatchObject({
      'max-size': expect.any(String),
      'max-file': expect.any(String),
    })
    expect(loggingOptions['max-size']).not.toBe('0')
    expect(loggingOptions['max-file']).not.toBe('0')

    for (const forbiddenKey of [
      'ports',
      'environment',
      'secrets',
      'build',
      'command',
    ]) {
      expect(frontend).not.toHaveProperty(forbiddenKey)
    }

    expect(composeSource).not.toMatch(/backend|caddy|auto.?deploy|ssh/iu)
  })

  it('routes only exact backend paths and slash descendants before frontend fallback', async () => {
    const { caddySource } = await readContractFiles()
    const directiveLines = caddySource
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))

    expect(directiveLines).toEqual([
      '{$FRONTEND_DOMAIN} {',
      '@backend path /v1 /v1/* /health /health/*',
      'handle @backend {',
      'reverse_proxy {$BACKEND_UPSTREAM}',
      '}',
      'handle {',
      'reverse_proxy {$FRONTEND_EDGE_ALIAS}:8080',
      '}',
      '}',
    ])

    for (const collisionPath of [
      '/v10',
      '/v1-admin',
      '/healthcheck',
      '/_frontend/health',
      '/_frontend/identity',
    ]) {
      expect(caddySource).not.toContain(collisionPath)
    }
  })

  it('keeps the manual host runbook aligned with the immutable-digest contract', async () => {
    const [deploymentRunbook, publicationRunbook, ingressRunbook, readme] =
      await Promise.all([
        readFile('docs/runbooks/frontend-compose-deployment.md', 'utf8'),
        readFile('docs/runbooks/frontend-image-publication.md', 'utf8'),
        readFile('docs/runbooks/frontend-same-origin-ingress.md', 'utf8'),
        readFile('README.md', 'utf8'),
      ])

    expect(deploymentRunbook).toContain(
      'FRONTEND_IMAGE=ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>',
    )
    expect(deploymentRunbook).toContain('Event=push')
    expect(deploymentRunbook).toContain('docker compose')
    expect(deploymentRunbook).toContain('verify-compose-image.sh')
    expect(deploymentRunbook).toContain('verify-hosted-routing.sh')
    expect(deploymentRunbook).toContain('verify_edge_alias')
    expect(deploymentRunbook).toContain('docker network inspect')
    expect(deploymentRunbook).toContain(
      '[ "$attached_alias" = "$wanted_alias" ]',
    )
    expect(deploymentRunbook).toContain('mkdir "$LOCK_DIR"')
    expect(deploymentRunbook).toContain('--password-stdin')
    expect(deploymentRunbook).toContain(
      'frontend-compose.previous.$OPERATION_ID.env',
    )
    expect(deploymentRunbook).toContain(
      'frontend-compose.failed.$OPERATION_ID.env',
    )
    expect(deploymentRunbook).toContain('verify-compose-topology.sh')
    expect(deploymentRunbook).toContain(
      'SHARED_LOCK_ROOT=/path/to/host-shared/frontend-compose-locks',
    )
    expect(deploymentRunbook).toContain('trap cleanup EXIT')
    expect(deploymentRunbook).toContain("trap 'handle_signal 129' HUP")
    expect(deploymentRunbook).toContain("trap 'handle_signal 130' INT")
    expect(deploymentRunbook).toContain("trap 'handle_signal 143' TERM")
    expect(deploymentRunbook).toContain(
      'ln "$RECORD_TEMP_FILE" "$destination_file"',
    )
    expect(deploymentRunbook).toContain(
      'FRONTEND_ORIGIN="https://${FRONTEND_DOMAIN}"',
    )
    expect(deploymentRunbook).toContain('--pull never')
    expect(deploymentRunbook).toContain('--wait-timeout')
    expect(deploymentRunbook).toContain('record_no_clobber')
    expect(deploymentRunbook).toContain('verify_current_live_state')
    expect(deploymentRunbook).toContain('ps --all -q frontend')
    expect(deploymentRunbook).toContain('application/problem+json')
    expect(readme).toContain('GHCR_READ_ONLY_PAT')
    expect(readme).toContain('--password-stdin')
    expect(publicationRunbook).toContain('frontend-compose-deployment.md')
    expect(ingressRunbook).toContain('frontend-ingress.Caddyfile.example')

    const targetPreflightStart = deploymentRunbook.indexOf(
      '## Target preflight:',
    )
    const targetPreflightEnd = deploymentRunbook.indexOf(
      '## Host-only records',
      targetPreflightStart,
    )
    const targetPreflight = deploymentRunbook.slice(
      targetPreflightStart,
      targetPreflightEnd,
    )
    expect(targetPreflight).not.toMatch(/\n\s+up --/u)
    expect(targetPreflight).not.toContain('deploy_target_once')

    const promotionStart = deploymentRunbook.indexOf('## Promotion')
    const promotionEnd = deploymentRunbook.indexOf(
      '## Explicit rollback',
      promotionStart,
    )
    const promotion = deploymentRunbook.slice(promotionStart, promotionEnd)
    const previousRecordIndex = promotion.indexOf(
      'record_no_clobber "$ENV_FILE" "$PREVIOUS_ENV_RECORD"',
    )
    const currentLiveStateIndex = promotion.indexOf(
      'verify_current_live_state "$ENV_FILE"',
    )
    const installIndex = promotion.indexOf(
      'install_current_env "$TARGET_ENV_FILE"',
    )
    const deployIndex = promotion.indexOf(
      'deploy_target_once "$RESOLVED_FRONTEND_IMAGE" "$TARGET_ENV_FILE"',
    )
    expect(previousRecordIndex).toBeGreaterThanOrEqual(0)
    expect(currentLiveStateIndex).toBeGreaterThanOrEqual(0)
    expect(previousRecordIndex).toBeGreaterThan(currentLiveStateIndex)
    expect(installIndex).toBeGreaterThan(previousRecordIndex)
    expect(deployIndex).toBeGreaterThan(installIndex)
  })

  it('records the selected rollback target when deployment fails', async () => {
    const rollback = await runRollbackFailureRecordContract()

    expect(rollback.result.code).not.toBe(0)
    expect(rollback.failedRecord).toBe('FRONTEND_IMAGE=previous\n')
  })

  it('records the target when final container health is unhealthy', async () => {
    const unhealthy = await runUnhealthyDeploymentContract()

    expect(unhealthy.result.code).not.toBe(0)
    expect(unhealthy.failedRecords).toHaveLength(1)
  })

  it('records an indeterminate target before a deployment signal exits', async () => {
    const interrupted = await runSignalRecordContract()

    expect(interrupted.result.code).toBe(143)
    expect(interrupted.failedRecords).toHaveLength(1)
  })

  it('rejects effective Compose topology mismatches before mutation', async () => {
    const valid = await runWithFakeTopology('valid')
    expect(valid.code).toBe(0)

    const mismatch = await runWithFakeTopology('mismatch')
    expect(mismatch.code).not.toBe(0)
    expect(mismatch.stderr).toContain('effective project mismatch')
    expect(mismatch.log).toContain('--quiet')
    expect(mismatch.log).not.toContain('up')
  })

  it('binds Compose to one exact approved lowercase GHCR digest', async () => {
    const approvedImage =
      'ghcr.io/example/react-starter@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    const valid = await runWithFakeDocker('valid', approvedImage)
    expect(valid.code).toBe(0)
    expect(valid.stdout).toBe(`${approvedImage}\n`)
    expect(valid.stderr).toBe('')

    const approvedTag = await runWithFakeDocker(
      'valid',
      'ghcr.io/example/react-starter:stage',
    )
    expect(approvedTag.code).not.toBe(0)
    expect(approvedTag.stderr).toContain(
      'approved image is not an exact GHCR digest',
    )

    const resolvedTag = await runWithFakeDocker('resolved-tag', approvedImage)
    expect(resolvedTag.code).not.toBe(0)
    expect(resolvedTag.stderr).toContain(
      'resolved image is not an exact GHCR digest',
    )

    const mismatch = await runWithFakeDocker('mismatch', approvedImage)
    expect(mismatch.code).not.toBe(0)
    expect(mismatch.stderr).toContain(
      'compose image does not match approved digest',
    )

    const multiple = await runWithFakeDocker('multiple', approvedImage)
    expect(multiple.code).not.toBe(0)
    expect(multiple.stderr).toContain('expected one resolved image')
  })

  it('verifies hosted routing without network access or response-body output', async () => {
    const success = await runWithFakeCurl('success')
    expect(success.code).toBe(0)
    expect(success.stdout).toBe('')
    expect(success.stderr).toBe('')
    expect(success.log).not.toContain('--location')
    expect(success.urls).toEqual([
      'https://frontend.example.test/_frontend/health',
      'https://frontend.example.test/_frontend/identity',
      'https://frontend.example.test/',
      'https://frontend.example.test/login',
      'https://frontend.example.test/v1',
      'https://frontend.example.test/v1/__frontend_deployment_probe__',
      'https://frontend.example.test/health',
      'https://frontend.example.test/health/__frontend_deployment_probe__',
      'https://frontend.example.test/v10',
      'https://frontend.example.test/v1-admin',
      'https://frontend.example.test/healthcheck',
    ])

    const frontendBackend = await runWithFakeCurl('frontend-backend')
    expect(frontendBackend.code).not.toBe(0)
    expect(frontendBackend.stderr).toContain(
      'path=/v1 rule=backend-status status=200',
    )
    expect(frontendBackend.stderr).not.toContain('<div id="root"></div>')

    const wrongIdentity = await runWithFakeCurl('wrong-identity')
    expect(wrongIdentity.code).not.toBe(0)
    expect(wrongIdentity.stderr).toContain(
      'path=/_frontend/identity rule=identity-body',
    )

    const redirect = await runWithFakeCurl('redirect')
    expect(redirect.code).not.toBe(0)
    expect(redirect.stderr).toContain('path=/ rule=status status=302')

    const interrupted = await runWithFakeCurl('signal')
    expect(interrupted.code).toBe(143)
  })
})
