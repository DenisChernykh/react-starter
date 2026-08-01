# Frontend Dokploy Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed local TypeScript operator that verifies one published frontend digest, promotes it to one existing Dokploy application, records redacted evidence, and performs only an explicitly requested rollback.

**Architecture:** Strict non-secret manifests and process-only credentials enter a deterministic orchestration core through injected ports. GitHub and Docker adapters bind the digest to a successful `stage-image` run, a narrow Dokploy adapter reads and changes only the existing application's exact `dockerImage`, and hosted smoke verifies the public HTTPS boundary. Preflight is read-only, every mutating command repeats it, deployment polling locks onto one new record, and rollback consumes prior evidence instead of guessing a tag.

**Tech Stack:** Node.js `24.18.0`, pnpm `11.15.1`, TypeScript `6.0.2`, Zod `4.4.3`, Vitest `4.1.10`, `tsx` `4.23.1`, built-in `fetch`, Docker CLI, GitHub Actions REST API, GHCR, Dokploy HTTP API.

## Global Constraints

- Execute this plan only after `2026-07-30-frontend-oci-publication.md` is implemented and its `pnpm check` plus `pnpm oci:check` evidence is fresh.
- Before implementation, run `git status --short --branch`, record branch/HEAD/worktrees, and use `superpowers:using-git-worktrees`; preserve unrelated changes.
- Run all checks on Node `24.18.0` and pnpm `11.15.1`.
- Do not push, open a pull request, merge, publish GHCR, mutate live Dokploy/VPS, or claim hosted PASS.
- Keep executable deployment tooling under `scripts/deployment`; it may consume `scripts/lib/command-runner.ts` and must not import application code from `src`.
- Add no dependency: use existing Zod, Node APIs, `fetch`, Vitest and `tsx`.
- Accept only lowercase `ghcr.io/...@sha256:<64 lowercase hex>` image references and full 40-character lowercase Git revisions.
- Candidate, current and rollback identities are exact digests; tags never enter a manifest, Dokploy update or evidence file.
- `preflight` is read-only. `bootstrap`, `promote` and `rollback` mutate only with explicit `--apply`.
- Repeat a full fresh preflight immediately before the first mutation.
- Never retry `application.update` or `application.deploy`; read-only GET requests may retry only bounded transient network/`5xx` failures.
- Promotion never invokes rollback automatically.
- The operator changes only `dockerImage`; it never sends runtime environment, build arguments, registry password or Traefik configuration to Dokploy.
- Secrets are process environment only. Never accept them in CLI flags, manifests, evidence, thrown error messages or console output.
- Evidence is atomic, exclusive, mode `0600`, stored below ignored `.deployment/evidence`.
- Bootstrap is allowed only when no successful deployment exists and no exact image is configured; it has no application-level rollback.
- Promotion requires one distinct `expectedCurrent` exact image and at least one successful prior deployment.
- Poll for at most 10 minutes at 5-second intervals; `done` is the only success, `running` the only non-terminal state, and `error`, `cancelled` or unknown states fail closed.
- Add Russian TSDoc to every new or changed handwritten TypeScript export.
- Follow TDD with focused RED/GREEN cycles and one reviewable commit per task.

---

## File Structure

- `scripts/deployment/manifest.ts` — strict release manifest and redacted input errors.
- `scripts/deployment/cli-options.ts` — command grammar with explicit `--apply`.
- `scripts/deployment/live-environment.ts` — process-only credential validation.
- `scripts/deployment/ports.ts` — immutable orchestration interfaces and evidence types.
- `scripts/deployment/github-workflow.adapter.ts` — verifies the exact workflow run attempt.
- `scripts/deployment/docker-image-verification.adapter.ts` — temporary GHCR login, pull and OCI label verification.
- `scripts/deployment/dokploy-http.adapter.ts` — strict HTTPS projection over four Dokploy endpoints.
- `scripts/deployment/frontend-hosted-smoke.adapter.ts` — public TLS, UI deep-link and API-routing checks.
- `scripts/deployment/deployment-orchestrator.ts` — preflight, bootstrap, promotion, polling and rollback policy.
- `scripts/deployment/evidence-file.adapter.ts` — strict read plus atomic `0600` write.
- `scripts/deployment/cli.ts` — composition root and redacted output.
- `scripts/deployment/*.test.ts` — Node-environment unit tests beside each bounded unit.
- `docs/runbooks/frontend-release-manifest.bootstrap.example.json` — symbolic first-deployment input.
- `docs/runbooks/frontend-release-manifest.promotion.example.json` — symbolic normal promotion input.
- `docs/runbooks/frontend-dokploy-deployment.md` — application preparation, preflight and apply.
- `docs/runbooks/frontend-dokploy-rollback.md` — evidence-led explicit rollback.

---

### Task 1: Strict manifests, CLI grammar and protected environment

**Files:**

- Create: `scripts/deployment/manifest.ts`
- Create: `scripts/deployment/manifest.test.ts`
- Create: `scripts/deployment/cli-options.ts`
- Create: `scripts/deployment/cli-options.test.ts`
- Create: `scripts/deployment/live-environment.ts`
- Create: `scripts/deployment/live-environment.test.ts`
- Create: `scripts/deployment/ports.ts`
- Create: `docs/runbooks/frontend-release-manifest.bootstrap.example.json`
- Create: `docs/runbooks/frontend-release-manifest.promotion.example.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

- Produces:

```ts
export interface DeploymentImageReference {
  readonly imageRef: string
  readonly revision: string
}

export type DeploymentMode = 'bootstrap' | 'promotion'

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

export interface DeploymentInputIssue {
  readonly path: string
  readonly rule: string
}

export class DeploymentInputError extends Error {
  readonly issues: readonly DeploymentInputIssue[]
}

export function parseDeploymentManifest(
  input: unknown,
): FrontendDeploymentManifest

export function readDeploymentManifest(
  path: string,
): Promise<FrontendDeploymentManifest>

export type DeploymentCommand =
  'preflight' | 'bootstrap' | 'promote' | 'rollback'

export interface DeploymentCliOptions {
  readonly command: DeploymentCommand
  readonly apply: boolean
  readonly manifestPath?: string
  readonly evidencePath?: string
}

export function parseDeploymentCliOptions(
  arguments_: readonly string[],
): DeploymentCliOptions

export interface DeploymentLiveEnvironment {
  readonly dokployBaseUrl: string
  readonly dokployApiKey: string
  readonly dokployApplicationId: string
  readonly githubToken: string
  readonly ghcrRegistryUrl: 'https://ghcr.io'
  readonly ghcrUsername: string
  readonly ghcrPassword: string
}

export function parseDeploymentLiveEnvironment(
  input: NodeJS.ProcessEnv,
): DeploymentLiveEnvironment
```

- `ports.ts` also produces the interfaces explicitly listed in later tasks.
- Consumers: every subsequent task.

- [ ] **Step 1: Write failing strict-manifest tests**

Use this valid promotion fixture:

```ts
const promotionManifest = {
  schemaVersion: 1,
  mode: 'promotion',
  environment: 'stage',
  repository: 'example/react-starter',
  workflowRunUrl:
    'https://github.com/example/react-starter/actions/runs/123/attempts/1',
  publicBaseUrl: 'https://stage.example.com',
  candidate: {
    imageRef: 'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64),
    revision: '1'.repeat(40),
  },
  expectedCurrent: {
    imageRef: 'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64),
    revision: '2'.repeat(40),
  },
  smokePaths: [
    '/login',
    '/approval-requests/00000000-0000-4000-8000-000000000000',
  ],
} as const
```

Prove it parses and is deeply frozen. Also reject:

- unknown keys, including `token`, `password`, `env` and `headers`;
- an environment outside `^[a-z0-9][a-z0-9-]{0,63}$`;
- tag references, mixed-case GHCR paths and non-hex digests;
- candidate/current equality;
- workflow repository mismatch or a URL without `/attempts/<number>`;
- credential-bearing/query/fragment URLs;
- duplicate paths, non-absolute paths, `/v1`, `/health` and
  `/_frontend/health` smoke paths;
- `bootstrap` with non-null `expectedCurrent`;
- `promotion` with null `expectedCurrent`.

Catch `DeploymentInputError` and assert `JSON.stringify(error)` contains field
paths/rules but not rejected secret values.

- [ ] **Step 2: Run manifest tests and verify RED**

Run:

```bash
pnpm exec vitest run scripts/deployment/manifest.test.ts
```

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement strict Zod manifest parsing**

Use `z.strictObject`, `safeParse`, explicit regexes and cross-field checks:

```ts
const imageRefPattern =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@sha256:[0-9a-f]{64}$/u
const revisionPattern = /^[0-9a-f]{40}$/u
const smokePathPattern = /^\/(?!\/)[^\s?#]*$/u
```

Normalize only trailing `/` from URL origins; do not normalize image refs,
revisions or paths. Bind candidate and current image coordinates to
`repository.toLowerCase()`. Compare the workflow URL owner/repository to
`repository` case-insensitively while preserving the manifest spelling for the
GitHub API and OCI source label. Return a deeply frozen object.
`DeploymentInputError.toJSON()` returns only `name`, `message` and `issues`.

- [ ] **Step 4: Write failing CLI grammar tests**

Cover:

```ts
expect(
  parseDeploymentCliOptions(['preflight', '--manifest', 'release.json']),
).toEqual({
  command: 'preflight',
  manifestPath: 'release.json',
  apply: false,
})

expect(
  parseDeploymentCliOptions([
    'promote',
    '--manifest',
    'release.json',
    '--apply',
  ]),
).toEqual({
  command: 'promote',
  manifestPath: 'release.json',
  apply: true,
})

expect(
  parseDeploymentCliOptions([
    'rollback',
    '--evidence',
    '.deployment/evidence/failed.json',
    '--apply',
  ]),
).toEqual({
  command: 'rollback',
  evidencePath: '.deployment/evidence/failed.json',
  apply: true,
})
```

Reject mutation commands without `--apply`, `preflight --apply`, duplicated
flags, positional extras, rollback manifest flags, and flags named `--token`,
`--password`, `--api-key` or `--registry-password`. Manifest mode versus
command is checked after the file is parsed in Task 6.

- [ ] **Step 5: Implement the explicit parser and usage**

The fixed usage is:

```text
Usage:
  pnpm deployment:preflight -- --manifest <path>
  pnpm deployment:bootstrap -- --manifest <path> --apply
  pnpm deployment:promote -- --manifest <path> --apply
  pnpm deployment:rollback -- --evidence <path> --apply
```

Filter only one pnpm `--` separator. Do not accept arbitrary unknown flags.

- [ ] **Step 6: Write failing live-environment tests**

The valid fixture contains:

```ts
{
  DOKPLOY_BASE_URL: 'https://dokploy.example.com',
  DOKPLOY_API_KEY: 'dokploy-test-key',
  DOKPLOY_APPLICATION_ID: 'app_123',
  GITHUB_TOKEN: 'github-test-token',
  GHCR_REGISTRY_URL: 'https://ghcr.io',
  GHCR_USERNAME: 'package-reader',
  GHCR_PASSWORD: 'ghcr-test-password',
}
```

Reject missing/empty values, non-HTTPS Dokploy, URL credentials/path/query,
and any GHCR registry other than exactly `https://ghcr.io`. Assert errors never
contain fixture secret values.

- [ ] **Step 7: Implement protected environment parsing**

Read only the seven named variables. Return a frozen camelCase object. Errors
name missing/invalid variable keys and fixed rules only. Do not retain the
input environment or include values in `toJSON`.

- [ ] **Step 8: Define the orchestration ports**

Add to `ports.ts`:

```ts
export interface PublicationVerificationPort {
  verify(input: {
    readonly repository: string
    readonly revision: string
    readonly workflowRunUrl: string
    readonly token: string
    readonly signal?: AbortSignal
  }): Promise<void>
}

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

export interface DokployApplication {
  readonly applicationId: string
  readonly sourceType: string
  readonly dockerImage: string | null
}

export interface DokployDeploymentRecord {
  readonly deploymentId: string
  readonly status: string
  readonly title: string
}

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

export interface HostedSmokeResult {
  readonly checkedPaths: readonly string[]
  readonly apiProbeStatus: number
}

export interface HostedSmokePort {
  verify(
    publicBaseUrl: string,
    smokePaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<HostedSmokeResult>
}

export interface ClockPort {
  nowMs(): number
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>
}
```

Define evidence types in Task 5's interface now so later tasks import one
source of truth:

```ts
export type DeploymentOperation = 'bootstrap' | 'promote' | 'rollback'
export type DeploymentOutcome = 'succeeded' | 'failed' | 'indeterminate'

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

export interface EvidencePort {
  write(
    directory: string,
    evidence: FrontendDeploymentEvidence,
  ): Promise<string>
}
```

- [ ] **Step 9: Add package scripts, ignore and examples**

Add:

```json
"deployment:preflight": "tsx scripts/deployment/cli.ts preflight",
"deployment:bootstrap": "tsx scripts/deployment/cli.ts bootstrap",
"deployment:promote": "tsx scripts/deployment/cli.ts promote",
"deployment:rollback": "tsx scripts/deployment/cli.ts rollback"
```

Append to `.gitignore`:

```text
# Local deployment inputs and evidence
.deployment/
```

The bootstrap example uses symbolic `a...` digest, `1...` revision,
`expectedCurrent: null` and `mode: bootstrap`. The promotion example uses
distinct `a...`/`b...` digests, `1...`/`2...` revisions and `mode: promotion`.
Use only `example` hosts and repository names.

- [ ] **Step 10: Run focused tests and commit**

Run:

```bash
pnpm exec vitest run scripts/deployment/manifest.test.ts scripts/deployment/cli-options.test.ts scripts/deployment/live-environment.test.ts
pnpm exec tsc -b --pretty false
```

Expected: PASS.

Commit:

```bash
git add package.json .gitignore scripts/deployment/manifest.ts scripts/deployment/manifest.test.ts scripts/deployment/cli-options.ts scripts/deployment/cli-options.test.ts scripts/deployment/live-environment.ts scripts/deployment/live-environment.test.ts scripts/deployment/ports.ts docs/runbooks/frontend-release-manifest.bootstrap.example.json docs/runbooks/frontend-release-manifest.promotion.example.json
git commit -m "feat(deployment): add frontend release inputs"
```

---

### Task 2: GitHub run-attempt and OCI image verification

**Files:**

- Create: `scripts/deployment/github-workflow.adapter.ts`
- Create: `scripts/deployment/github-workflow.adapter.test.ts`
- Create: `scripts/deployment/docker-image-verification.adapter.ts`
- Create: `scripts/deployment/docker-image-verification.adapter.test.ts`

**Interfaces:**

- Implements `PublicationVerificationPort` and `ImageVerificationPort`.
- GitHub run attempts must be completed, successful `push` events on `stage`
  for `.github/workflows/stage-image.yml`.
- OCI labels must equal:

```text
org.opencontainers.image.source=https://github.com/<repository>
org.opencontainers.image.revision=<revision>
io.github.actions.workflow-run-url=<workflowRunUrl>, when supplied
```

- Consumers: Task 5 preflight and Task 6 rollback.

- [ ] **Step 1: Write failing GitHub adapter tests**

Inject fake fetch. For:

```text
https://github.com/example/react-starter/actions/runs/123/attempts/2
```

require one GET to:

```text
https://api.github.com/repos/example/react-starter/actions/runs/123/attempts/2
```

The successful JSON projection is:

```ts
{
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_branch: 'stage',
  head_sha: '1'.repeat(40),
  path: '.github/workflows/stage-image.yml',
}
```

Cover mismatch for every field, non-2xx, invalid JSON, timeout and response
shape. Assert `Authorization`, token, body and URL credentials never appear in
`GithubWorkflowContractError`.

- [ ] **Step 2: Implement the GitHub workflow verifier**

Use built-in fetch with:

```ts
{
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
}
```

Use `redirect: 'error'`, 10-second timeout, and no automatic retry in this
adapter; the orchestration preflight can be rerun explicitly. Parse the attempt
URL strictly and compare all six fields from Step 1.

- [ ] **Step 3: Write failing Docker image-verification tests**

Use a fake `CommandPort` and fake temp-directory functions to prove:

```text
docker login ghcr.io --username <username> --password-stdin
docker pull <exact digest>
docker image inspect <exact digest> --format {{json .Config.Labels}}
```

The password must be stdin only. `DOCKER_CONFIG` must point to a unique
temporary directory with mode `0700`; it is removed in `finally`. Cover login,
pull, invalid JSON, missing labels, revision/source/workflow mismatch and
abort. Assert no `docker image rm` occurs and no secret reaches arguments or
errors.

- [ ] **Step 4: Implement temporary-auth image inspection**

Use `mkdtemp`, `chmod(0o700)` and `rm(path, { recursive: true, force: true })`
for the owned credential directory. Pass:

```ts
{
  ...process.env,
  DOCKER_CONFIG: temporaryDockerConfig,
}
```

to all three Docker commands. Use the existing
`ExecFileCommandRunner`. Require successful exit codes and strictly parse
labels. Do not print command stderr or preserve the temporary config. Leaving
the pulled image in the local Docker cache is allowed and documented; never
delete a potentially pre-existing user image.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm exec vitest run scripts/deployment/github-workflow.adapter.test.ts scripts/deployment/docker-image-verification.adapter.test.ts
pnpm exec tsc -b --pretty false
```

Expected: PASS.

Commit:

```bash
git add scripts/deployment/github-workflow.adapter.ts scripts/deployment/github-workflow.adapter.test.ts scripts/deployment/docker-image-verification.adapter.ts scripts/deployment/docker-image-verification.adapter.test.ts
git commit -m "feat(deployment): verify published frontend image"
```

---

### Task 3: Strict Dokploy HTTPS adapter

**Files:**

- Create: `scripts/deployment/dokploy-http.adapter.ts`
- Create: `scripts/deployment/dokploy-http.adapter.test.ts`

**Interfaces:**

- Implements `DokployPort` with:

```text
GET  /api/application.one?applicationId=...
GET  /api/deployment.all?applicationId=...
POST /api/application.update
POST /api/application.deploy
```

- `application.update` body is exactly `{ applicationId, dockerImage }`.
- `application.deploy` body is exactly
  `{ applicationId, title, description }`.
- Consumers: Tasks 5 and 6.
- Produces:

```ts
export interface DokployHttpAdapterOptions {
  readonly baseUrl: string
  readonly apiKey: string
  readonly fetchImplementation?: typeof fetch
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}

export class DokployHttpAdapter implements DokployPort {
  constructor(options: DokployHttpAdapterOptions)
}
```

- [ ] **Step 1: Write failing read-adapter tests**

With injected fetch and a no-delay fake sleep, require `x-api-key`,
`Accept: application/json`, `redirect: error` and HTTPS. Assert transient GET
retries request delays of `250` then `500` milliseconds.

Project `application.one` to exactly:

```ts
{
  applicationId: 'app_123',
  sourceType: 'docker',
  dockerImage:
    'ghcr.io/example/react-starter@sha256:' + 'b'.repeat(64),
}
```

Project `deployment.all` records to only:

```ts
{
  deploymentId: 'deployment_123',
  status: 'done',
  title: 'frontend:promote:' + '2'.repeat(40),
}
```

Reject a missing/wrong field, duplicate deployment IDs, non-array deployment
body, non-JSON, redirects and credential-bearing base URL.

- [ ] **Step 2: Write failing mutation tests**

Assert `updateImage` sends only:

```json
{
  "applicationId": "app_123",
  "dockerImage": "ghcr.io/example/react-starter@sha256:..."
}
```

Assert `deploy` sends only application ID, title and description. Both require
plain `{}` success responses. Prove `500`, timeout and invalid responses do not
retry either mutation.

- [ ] **Step 3: Implement bounded read retries and no mutation retries**

Create `DokployContractError` with `operation`, optional numeric `status` and a
fixed category only.

For GET:

- timeout each request after 10 seconds;
- at most 3 attempts;
- retry only transport failures and `500`–`599`;
- delays `250ms`, then `500ms`;
- never retry `400`–`499` or response-contract failures.

For POST:

- one attempt only;
- require exact empty object.

Do not include base URL, API key, headers or response body in errors.
Use the injected sleep only between eligible GET attempts so tests never wait
on wall-clock time.

- [ ] **Step 4: Run focused tests and compare official endpoints**

Run:

```bash
pnpm exec vitest run scripts/deployment/dokploy-http.adapter.test.ts
pnpm exec tsc -b --pretty false
```

Expected: PASS.

Confirm the four paths against:

- `https://docs.dokploy.com/docs/api/reference-application`
- `https://docs.dokploy.com/docs/api/reference-deployment`

The upstream OpenAPI currently describes the two mutation bodies and empty
success responses, but its success schemas for `application.one` and
`deployment.all` are empty objects. Keep the explicit runtime projections
above and record that only a later read-only call to the installed instance can
prove its response compatibility.

Do not make a live Dokploy request.

- [ ] **Step 5: Commit the Dokploy boundary**

```bash
git add scripts/deployment/dokploy-http.adapter.ts scripts/deployment/dokploy-http.adapter.test.ts
git commit -m "feat(deployment): add strict Dokploy adapter"
```

---

### Task 4: Hosted frontend smoke

**Files:**

- Create: `scripts/deployment/frontend-hosted-smoke.adapter.ts`
- Create: `scripts/deployment/frontend-hosted-smoke.adapter.test.ts`

**Interfaces:**

- Implements `HostedSmokePort`.
- Always checks:

```text
/_frontend/health
/
/login
manifest smokePaths
/v1/__frontend_deployment_probe__
```

- Returns only checked paths and API probe status.
- Consumers: Task 5 promotion/bootstrap and Task 6 rollback.

- [ ] **Step 1: Write failing hosted-smoke tests**

With fake fetch, prove:

- base URL must be a credential-free HTTPS origin;
- health is `200`, body `ok\n`, `Cache-Control` includes `no-store`;
- `/`, `/login` and configured paths are `200 text/html` with
  `<div id="root">`;
- the API probe is a `4xx`, is not `text/html`, and does not contain the app
  root;
- redirects, TLS/transport error, timeout, duplicate path or unexpected
  status/content type fail.

Use `redirect: 'error'` and assert no cookies or authorization headers are
sent.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run scripts/deployment/frontend-hosted-smoke.adapter.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement bounded public verification**

Use a 10-second timeout per request and no retries. Normalize only the base
origin. Deduplicate the fixed and manifest paths before fetching. Throw
`FrontendHostedSmokeError` with `path`, optional status and a fixed rule; never
include body text.

- [ ] **Step 4: Run focused tests and commit**

Run:

```bash
pnpm exec vitest run scripts/deployment/frontend-hosted-smoke.adapter.test.ts
pnpm exec tsc -b --pretty false
```

Expected: PASS.

Commit:

```bash
git add scripts/deployment/frontend-hosted-smoke.adapter.ts scripts/deployment/frontend-hosted-smoke.adapter.test.ts
git commit -m "feat(deployment): verify hosted frontend routes"
```

---

### Task 5: Read-only preflight, bootstrap and promotion orchestration

**Files:**

- Create: `scripts/deployment/deployment-orchestrator.ts`
- Create: `scripts/deployment/deployment-orchestrator.test.ts`

**Interfaces:**

- Produces:

```ts
export interface DeploymentPreflightResult {
  readonly mode: DeploymentMode
  readonly application: DokployApplication
  readonly previous: DeploymentImageReference | null
  readonly candidate: DeploymentImageReference
  readonly successfulDeploymentCount: number
}

export interface DeploymentOrchestratorDependencies {
  readonly publication: PublicationVerificationPort
  readonly image: ImageVerificationPort
  readonly dokploy: DokployPort
  readonly smoke: HostedSmokePort
  readonly clock: ClockPort
  readonly evidence: EvidencePort
}

export interface DeploymentOperationInput {
  readonly manifest: FrontendDeploymentManifest
  readonly live: DeploymentLiveEnvironment
  readonly evidenceDirectory: string
  readonly signal?: AbortSignal
}

export async function runDeploymentPreflight(
  input: Omit<DeploymentOperationInput, 'evidenceDirectory'>,
  dependencies: Pick<
    DeploymentOrchestratorDependencies,
    'publication' | 'image' | 'dokploy'
  >,
): Promise<DeploymentPreflightResult>

export class FrontendDeploymentOrchestrator {
  constructor(dependencies: DeploymentOrchestratorDependencies)
  bootstrap(input: DeploymentOperationInput): Promise<string>
  promote(input: DeploymentOperationInput): Promise<string>
  rollback(
    evidence: FrontendDeploymentEvidence,
    live: DeploymentLiveEnvironment,
    evidenceDirectory: string,
    signal?: AbortSignal,
  ): Promise<string>
}
```

- `bootstrap` and `promote` return the written evidence path.
- `rollback` is implemented in Task 6, but its signature is fixed here.

- [ ] **Step 1: Write failing read-only preflight tests**

Use fakes with call recording. Assert this order:

```text
verify GitHub run attempt
verify candidate image labels
get Dokploy application
list deployments
apply mode-specific guards
return frozen preflight result
```

Prove no `updateImage`, `deploy`, smoke or evidence write occurs.

Bootstrap succeeds only for:

```ts
{
  sourceType: 'docker',
  dockerImage: null,
  successfulDeploymentCount: 0,
}
```

Promotion succeeds only when:

- `sourceType === 'docker'`;
- configured `dockerImage === expectedCurrent.imageRef`;
- at least one record has `status === 'done'`;
- candidate differs from current.

Reject mutable/unknown configured images, current drift, candidate mismatch,
existing bootstrap image/history and unknown deployment records.

- [ ] **Step 2: Implement the fail-closed preflight**

Pass GitHub and GHCR secrets only to their ports. `previous` is null for
bootstrap and exactly the manifest `expectedCurrent` for promotion. Freeze the
result. Throw `DeploymentExecutionError` containing fixed `step` and `category`
only.

- [ ] **Step 3: Write failing successful bootstrap/promotion tests**

For both operations prove:

1. full preflight repeats immediately;
2. snapshot deployments;
3. `updateImage(applicationId, candidate.imageRef)` once;
4. `deploy` once with title
   `frontend:<operation>:<revision>:<nowMs>`;
5. identification polls until exactly one new matching-title record appears;
6. after identification, polling observes only that deployment ID;
7. `running` continues and `done` succeeds;
8. hosted smoke runs after `done`;
9. evidence is written once and returned.

Use a fake clock to advance 5 seconds per sleep.

- [ ] **Step 4: Write failing error and timeout tests**

Cover:

- two new matching records → ambiguous failure;
- no new record for 10 minutes → indeterminate timeout;
- identified record missing/duplicated on a later poll;
- `error` and `cancelled` terminal states;
- unknown status;
- smoke failure after `done`;
- evidence write failure;
- abort signal.

Assert no automatic update back to the previous image occurs. Evidence still
contains `previous`, `target`, failed step, terminal status when known, and
`indeterminate` for deadline/unknown external state.

- [ ] **Step 5: Implement bounded apply orchestration**

Use:

```ts
const pollIntervalMs = 5_000
const pollDeadlineMs = 600_000
```

Snapshot IDs before deploy. During identification:

- zero new matching records → sleep and retry within deadline;
- exactly one → lock its ID;
- more than one → fail ambiguous.

After lock, require exactly one record with that ID on every poll. Treat only
`done` as success and only `running` as non-terminal. Build evidence through a
private recorder and call `EvidencePort.write` on both success and caught
failure. Re-throw only redacted `DeploymentExecutionError` after evidence is
attempted.

Do not call rollback from either method.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
pnpm exec vitest run scripts/deployment/deployment-orchestrator.test.ts
pnpm exec tsc -b --pretty false
```

Expected: PASS.

Commit:

```bash
git add scripts/deployment/deployment-orchestrator.ts scripts/deployment/deployment-orchestrator.test.ts
git commit -m "feat(deployment): orchestrate frontend promotion"
```

---

### Task 6: Secure evidence, explicit rollback and CLI composition

**Files:**

- Create: `scripts/deployment/evidence-file.adapter.ts`
- Create: `scripts/deployment/evidence-file.adapter.test.ts`
- Modify: `scripts/deployment/deployment-orchestrator.ts`
- Modify: `scripts/deployment/deployment-orchestrator.test.ts`
- Create: `scripts/deployment/cli.ts`
- Create: `scripts/deployment/cli.test.ts`

**Interfaces:**

- Produces:

```ts
export class EvidenceFileAdapter implements EvidencePort {
  write(
    directory: string,
    evidence: FrontendDeploymentEvidence,
  ): Promise<string>
}

export function parseDeploymentEvidence(
  input: unknown,
): FrontendDeploymentEvidence

export function readDeploymentEvidence(
  path: string,
): Promise<FrontendDeploymentEvidence>

export async function runDeploymentCli(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  overrides?: Partial<DeploymentCliDependencies>,
): Promise<number>
```

- Rollback evidence path is derived automatically in `.deployment/evidence`;
  the input file is never overwritten.

- [ ] **Step 1: Write failing evidence adapter tests**

Verify:

- directory is created mode `0700`;
- a same-directory temporary file is opened with `wx` and mode `0600`;
- JSON is written, synced, closed and atomically renamed;
- existing destination is not overwritten;
- filename contains sanitized environment, operation, revision prefix and UTC
  timestamp;
- temp file is removed on failure;
- resulting file mode is exactly `0600`;
- parser rejects unknown keys, credentials, malformed digests and inconsistent
  null fields;
- no secret fixture appears in errors.

- [ ] **Step 2: Implement strict evidence read/write**

Use a strict Zod schema matching `FrontendDeploymentEvidence`. Build filenames:

```text
<environment>-<operation>-<revision12>-<YYYYMMDDTHHMMSSmmmZ>.json
```

Serialize with two-space indentation plus newline. Redaction happens before
calling the adapter: the schema has no token/header/body fields and rejects
unknown keys.

- [ ] **Step 3: Write failing rollback orchestration tests**

Given failed promotion evidence with non-null `previous`, require:

1. verify previous image source/revision without requiring a workflow URL;
2. `getApplication` and require its current image equals failed evidence
   `target.imageRef`;
3. snapshot deployments;
4. update to `previous.imageRef`;
5. deploy once with `frontend:rollback:<revision>:<nowMs>`;
6. identify and poll one deployment;
7. repeat hosted smoke using evidence `publicBaseUrl` and `smokePaths`;
8. write a new rollback evidence file.

Reject:

- bootstrap evidence with `previous: null`;
- source evidence whose operation is already `rollback`;
- current image changed after the failed operation;
- source evidence without `outcome: failed` or `indeterminate`;
- invalid previous image;
- any attempt to overwrite the source evidence.

- [ ] **Step 4: Implement explicit rollback**

Reuse the same identify/poll/smoke helpers as promotion. Do not call GitHub
workflow verification for the previous image; it is bound by exact digest,
revision, source label and previously stored evidence. Set rollback evidence:

```ts
{
  operation: 'rollback',
  previous: sourceEvidence.target,
  target: sourceEvidence.previous,
  workflowRunUrl: null,
}
```

Never attempt another rollback automatically if rollback itself fails.

- [ ] **Step 5: Write failing CLI composition tests**

Inject fake adapters and cover:

- `preflight` parses manifest/environment and never mutates;
- bootstrap command refuses a promotion manifest;
- promote command refuses a bootstrap manifest;
- missing `--apply` is rejected before adapter composition and never calls
  `updateImage` or `deploy`;
- successful apply prints only operation, environment, short revision and
  evidence path;
- rollback reads evidence before composition;
- all errors set exit code `1` and print only fixed redacted JSON;
- tokens, passwords, API key, URL query and upstream response body never reach
  stdout/stderr.

- [ ] **Step 6: Implement the process composition root**

`runDeploymentCli`:

1. parses options;
2. reads manifest or evidence;
3. parses the seven environment variables;
4. creates `ExecFileCommandRunner`, GitHub, Docker, Dokploy, smoke, clock and
   evidence adapters;
5. dispatches one command;
6. returns `0` on success, `1` on redacted failure.

Use fixed evidence directory:

```text
.deployment/evidence
```

The executable tail calls `runDeploymentCli(process.argv.slice(2), process.env)`
and sets `process.exitCode`; it never calls `process.exit()` during cleanup.

- [ ] **Step 7: Run all deployment tests and manual dry-run grammar**

Run:

```bash
pnpm exec vitest run scripts/deployment
pnpm deployment:preflight -- --manifest docs/runbooks/frontend-release-manifest.promotion.example.json
```

Expected:

- unit tests PASS;
- the manual preflight exits non-zero only because protected live variables are
  absent;
- its output names missing variable keys but contains no secret or mutation.

- [ ] **Step 8: Commit evidence, rollback and CLI**

```bash
git add scripts/deployment/evidence-file.adapter.ts scripts/deployment/evidence-file.adapter.test.ts scripts/deployment/deployment-orchestrator.ts scripts/deployment/deployment-orchestrator.test.ts scripts/deployment/cli.ts scripts/deployment/cli.test.ts
git commit -m "feat(deployment): add explicit frontend rollback"
```

---

### Task 7: Dokploy runbooks and final local verification

**Files:**

- Create: `docs/runbooks/frontend-dokploy-deployment.md`
- Create: `docs/runbooks/frontend-dokploy-rollback.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/getting-started.md`

**Interfaces:**

- Docs expose only commands and environment variables implemented above.
- They make environment preparation a separate authorized operation.
- They explicitly distinguish local mock evidence from a hosted drill.

- [ ] **Step 1: Document Dokploy application preparation**

`frontend-dokploy-deployment.md` must state that a separately authorized
operator prepares one existing application with:

- source type `docker`;
- GHCR registry connection stored in Dokploy;
- container port `8080`;
- health path `/_frontend/health`;
- no auto-deploy webhook;
- domain/path routing from `frontend-same-origin-ingress.md`;
- an API key scoped as narrowly and briefly as the installed Dokploy supports.

Document the seven environment variables exactly. Explain that the local
`GHCR_PASSWORD` is used only for verification and is not copied into Dokploy.

- [ ] **Step 2: Document preflight, bootstrap and promotion**

Provide the literal sequence:

```bash
pnpm deployment:preflight -- --manifest /absolute/path/release.json
pnpm deployment:bootstrap -- --manifest /absolute/path/release.json --apply
pnpm deployment:promote -- --manifest /absolute/path/release.json --apply
```

Explain:

- bootstrap requires an unused Dokploy application and has no application-level
  rollback;
- promotion requires `expectedCurrent`;
- preflight checks the exact successful workflow attempt and OCI labels;
- apply repeats preflight;
- no command edits Traefik, DNS, TLS, environment values or registry secrets;
- evidence is local `0600`;
- no success claim is valid until hosted smoke finishes.

Link:

- `https://docs.dokploy.com/docs/api/reference-application`
- `https://docs.dokploy.com/docs/api/reference-deployment`
- `https://docs.dokploy.com/docs/core/registry`
- `https://docs.dokploy.com/docs/core/domains`

- [ ] **Step 3: Document explicit rollback**

`frontend-dokploy-rollback.md` must use:

```bash
pnpm deployment:rollback -- --evidence /absolute/path/failed-evidence.json --apply
```

Explain drift protection, previous exact digest verification, new deployment
polling, repeated hosted smoke, the derived rollback evidence path, and why
rollback is never automatic. State that bootstrap without previous evidence
cannot use this command.

- [ ] **Step 4: Update active project navigation**

In `AGENTS.md`, route deployment tasks to the publication, ingress, Dokploy and
rollback runbooks. Add:

- no VPS/Dokploy mutation without explicit request;
- preflight is read-only but still requires live credentials;
- local operator tests do not prove instance compatibility;
- no deployment PASS without deployment ID and hosted smoke.

In `README.md`, add the four package scripts and concise links.

In `docs/architecture/overview.md`, add operator units and the
manifest → preflight → exact image → Dokploy → smoke → evidence flow.

In `docs/getting-started.md`, add product-copy personalization for GHCR package,
Dokploy application ID, example manifests and ignored evidence. Do not require
Dokploy for local frontend development.

- [ ] **Step 5: Run placeholder, secret and documentation scans**

Run:

```bash
rg -n "TBD|TODO|FIXME|PLACEHOLDER" scripts/deployment docs/runbooks AGENTS.md README.md docs/architecture/overview.md docs/getting-started.md
rg -n "DOKPLOY_API_KEY=|GHCR_PASSWORD=|GITHUB_TOKEN=" . --glob '!node_modules/**' --glob '!.git/**'
pnpm exec prettier --check scripts/deployment docs/runbooks AGENTS.md README.md docs/architecture/overview.md docs/getting-started.md
git diff --check
```

Expected:

- no placeholders;
- variable names may appear in docs/tests, but no non-symbolic assigned secret
  values;
- formatting and whitespace PASS.

- [ ] **Step 6: Run the full source gate**

Select pinned tools, then:

```bash
node --version
pnpm --version
pnpm check
```

Expected:

```text
v24.18.0
11.15.1
```

and `pnpm check` PASS.

- [ ] **Step 7: Re-run the OCI regression gate**

Run:

```bash
pnpm oci:check
```

Expected: PASS. The operator code and docs do not alter final image contents or
same-origin HTTP behavior.

- [ ] **Step 8: Review the full operator diff**

Run:

```bash
git status --short
git diff --stat
git diff
```

Verify:

- no live release/evidence files;
- no secrets;
- no backend migration code;
- no automatic deployment workflow;
- no automatic rollback;
- no Dokploy environment/Traefik mutation;
- no generated API drift.

- [ ] **Step 9: Commit the operator documentation**

```bash
git add AGENTS.md README.md docs/architecture/overview.md docs/getting-started.md docs/runbooks/frontend-dokploy-deployment.md docs/runbooks/frontend-dokploy-rollback.md
git commit -m "docs(deployment): document frontend Dokploy operator"
```

- [ ] **Step 10: Record the bounded completion report**

Capture:

```text
Source review: PASS at <local commit>
pnpm check: PASS on Node 24.18.0 / pnpm 11.15.1
pnpm oci:check: PASS
GitHub/GHCR verification adapter: PASS against fakes only
Dokploy adapter/orchestrator: PASS against fakes only
Live GHCR candidate: NOT CREATED BY THIS PLAN
Live Dokploy/VPS mutation: NOT RUN
Hosted smoke/rollback drill: NOT RUN
```

Replace `<local commit>` with fresh `git rev-parse HEAD` output during
execution. Do not convert mock evidence into a hosted PASS claim.
