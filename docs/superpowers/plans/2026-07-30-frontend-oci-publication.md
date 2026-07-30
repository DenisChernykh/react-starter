# Frontend OCI Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `react-starter` produce one same-origin, non-root frontend image and publish a scanned, smoke-tested exact GHCR digest after a successful `stage` merge.

**Architecture:** Browser requests stay relative and Vite owns only the local `/v1` and `/health` proxy. A digest-pinned Node build stage produces `dist`, a digest-pinned unprivileged Nginx stage serves it on port `8080`, and a repository-owned smoke tool verifies the same image locally or after a registry pull. Pull requests run source checks only; a separate `push stage` workflow publishes and validates the immutable candidate without any Dokploy access.

**Tech Stack:** Node.js `24.18.0`, pnpm `11.15.1`, TypeScript `6.0.2`, Vite `8.1.1`, Axios `1.18.1`, Vitest `4.1.10`, `tsx` `4.23.1`, Docker Buildx, `nginxinc/nginx-unprivileged`, GitHub Actions, GHCR, Trivy Action `0.36.0`.

## Global Constraints

- Before implementation, run `git status --short --branch`, record branch/HEAD/worktrees, and use `superpowers:using-git-worktrees`; preserve all unrelated and untracked files.
- Run source gates on Node `24.18.0` and pnpm `11.15.1`; do not accept Node 26 evidence.
- Do not push, open a pull request, merge, publish GHCR, access Dokploy/VPS, or claim remote/deployment PASS.
- Keep generated OpenAPI and Orval output untouched.
- Production browser requests must remain relative `/v1/*` or `/health/*`; no API origin may enter the bundle, Docker build arguments, or runtime environment.
- Keep `withCredentials`, in-memory CSRF, Problem Details normalization, React Router behavior, and generated operation paths unchanged.
- Build only `linux/amd64` in this first release.
- Pin the build base to `node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436`.
- Pin the runtime base to `nginxinc/nginx-unprivileged:alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786`.
- Run the final container with non-root user `101`, port `8080`, a read-only root filesystem, and a writable `/tmp` tmpfs only.
- Never create `latest`, `stage-latest`, production tags, or any deployment input based on a tag; deployment identity is always `image@sha256:...`.
- Use only commit-pinned GitHub Actions and job-scoped least privileges.
- Keep `pnpm check` Docker-free; `pnpm oci:check` is the separate container gate.
- Add Russian TSDoc to every new or changed handwritten TypeScript export.
- Follow TDD: observe each focused RED before implementation, then GREEN, then commit the independently reviewable task.

---

## File Structure

Create or change these bounded units:

- `vite.config.ts` — validates the server-only dev proxy target and configures `/v1` and `/health`.
- `vite.config.test.ts` — Node-environment contract tests for the proxy target.
- `src/shared/api/client/axios-client.ts` — same-origin credentialed transport without a browser API origin.
- `src/shared/api/client/axios-client.test.ts` — proves current-origin requests while preserving CSRF/error behavior.
- `src/shared/config/env.ts` and `env.test.ts` — deleted obsolete browser API-origin contract.
- `src/shared/config/index.ts` — deleted after its only public exports disappear; `zod-locale.ts` remains.
- `.env.example` — optional dev proxy target only.
- `Dockerfile` — digest-pinned build/runtime image and OCI labels.
- `.dockerignore` — excludes source artifacts unnecessary to the build context.
- `config/nginx/default.conf` — port, health, API exclusions, SPA fallback and cache policy.
- `config/nginx/security-headers.conf` — reusable static response headers.
- `scripts/lib/command-runner.ts` — bounded `execFile` port shared by OCI and the later deployment operator.
- `scripts/lib/command-runner.test.ts` — process timeout, stdin and redaction-facing result tests.
- `scripts/oci/frontend-http-contract.ts` — pure HTTP assertions over a running frontend.
- `scripts/oci/frontend-http-contract.test.ts` — fake-fetch tests for routes, body and headers.
- `scripts/oci/docker-image-smoke.ts` — container lifecycle, metadata and shutdown checks.
- `scripts/oci/docker-image-smoke.test.ts` — fake command/HTTP orchestration tests.
- `scripts/oci/run-image-smoke.ts` — CLI that either builds the checkout or smokes a supplied digest.
- `scripts/oci/run-image-smoke.test.ts` — strict option grammar tests.
- `scripts/ci/stage-image-workflow.test.ts` — static workflow invariants without live GitHub.
- `.github/workflows/ci.yml` — pull-request-only source gate.
- `.github/workflows/stage-image.yml` — post-merge GHCR publication and exact-digest verification.
- `docs/runbooks/frontend-image-publication.md` — candidate publication and evidence boundary.
- `docs/runbooks/frontend-same-origin-ingress.md` — reverse-proxy contract without live host names.

The later Dokploy plan consumes `scripts/lib/command-runner.ts`, the four OCI
labels, `pnpm oci:check`, and the exact-digest publication contract.

---

### Task 1: Same-origin browser transport and dev proxy

**Files:**

- Modify: `src/shared/api/client/axios-client.ts`
- Modify: `src/shared/api/client/axios-client.test.ts`
- Delete: `src/shared/config/env.ts`
- Delete: `src/shared/config/env.test.ts`
- Delete: `src/shared/config/index.ts`
- Modify: `vite.config.ts`
- Create: `vite.config.test.ts`
- Modify: `tsconfig.node.json`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces:

```ts
export function parseDevApiProxyTarget(value: string | undefined): string
```

- `parseDevApiProxyTarget(undefined)` returns `http://localhost:3000`.
- The returned value is an absolute HTTP(S) origin without credentials, path,
  query, fragment or trailing slash.
- `API_AXIOS_INSTANCE.defaults.baseURL` and the private CSRF client's base URL
  are `undefined`.
- Vite proxies both `/v1` and `/health` to the parsed target.
- Consumers: local `pnpm dev`, all generated API operations, and Task 5 docs.

- [ ] **Step 1: Write the failing same-origin transport assertion**

In `src/shared/api/client/axios-client.test.ts`, replace the fixed origin with
the jsdom origin and add this assertion to the login test:

```ts
const apiOrigin = window.location.origin

let observedOrigin: string | undefined

http.post(`${apiOrigin}/v1/auth/login`, ({ request }) => {
  observedOrigin = new URL(request.url).origin
  // keep the existing response and CSRF assertions
})

expect(API_AXIOS_INSTANCE.defaults.baseURL).toBeUndefined()
expect(observedOrigin).toBe(window.location.origin)
```

Import `API_AXIOS_INSTANCE` from `./axios-client`. Keep every existing
credential, JSON-body, health and normalized-error assertion.

- [ ] **Step 2: Write failing proxy-target tests**

Create `vite.config.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { parseDevApiProxyTarget } from './vite.config'

describe('parseDevApiProxyTarget', () => {
  it('defaults to the local backend origin', () => {
    expect(parseDevApiProxyTarget(undefined)).toBe('http://localhost:3000')
  })

  it('normalizes an explicit HTTP(S) origin', () => {
    expect(parseDevApiProxyTarget('https://api.example.com/')).toBe(
      'https://api.example.com',
    )
  })

  it.each([
    '/api',
    'ftp://api.example.com',
    'https://user:secret@api.example.com',
    'https://api.example.com/v1',
    'https://api.example.com?token=secret',
  ])('rejects an unsafe proxy target: %s', (value) => {
    expect(() => parseDevApiProxyTarget(value)).toThrow('DEV_API_PROXY_TARGET')
  })
})
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/shared/api/client/axios-client.test.ts vite.config.test.ts
```

Expected:

- Axios test fails because `baseURL` is still `http://localhost:3000`;
- Vite config test fails because `parseDevApiProxyTarget` does not exist.

- [ ] **Step 4: Implement the relative Axios clients**

Change `src/shared/api/client/axios-client.ts` to remove the
`@/shared/config` import and use:

```ts
const clientDefaults = {
  withCredentials: true,
}
```

Do not change interceptors, login exemption, unsafe-method policy or CSRF token
fetching. Delete `env.ts`, `env.test.ts` and the now-empty `config/index.ts`.
Keep `src/shared/config/zod-locale.ts`.

- [ ] **Step 5: Implement the Vite server-only proxy**

Use `loadEnv` only for the dev server and keep Vitest's typed `defineConfig`:

```ts
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/** Проверяет server-only origin локального backend для Vite proxy. */
export function parseDevApiProxyTarget(value: string | undefined): string {
  const candidate = value ?? 'http://localhost:3000'
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error('DEV_API_PROXY_TARGET must be an absolute HTTP(S) origin')
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('DEV_API_PROXY_TARGET must be an absolute HTTP(S) origin')
  }

  return url.origin
}

export default defineConfig(({ command, mode }) => {
  const server =
    command === 'serve'
      ? (() => {
          const env = loadEnv(mode, process.cwd(), '')
          const target = parseDevApiProxyTarget(env.DEV_API_PROXY_TARGET)

          return {
            proxy: {
              '/v1': { target, changeOrigin: true },
              '/health': { target, changeOrigin: true },
            },
          }
        })()
      : undefined

  return {
    // preserve plugins, alias and test setup
    server,
  }
})
```

Preserve all existing React, Tailwind, alias and Vitest settings, but remove
the `test.env.VITE_API_BASE_URL` block. Production `vite build` must not read or
validate `DEV_API_PROXY_TARGET`. Extend `tsconfig.node.json` include to:

```json
["vite.config.ts", "vite.config.test.ts", "scripts/**/*.ts"]
```

Set `.env.example` to:

```dotenv
DEV_API_PROXY_TARGET=http://localhost:3000
```

Remove the `VITE_API_BASE_URL` job environment from `ci.yml`; do not change its
event triggers yet.

- [ ] **Step 6: Run focused and regression tests**

Run:

```bash
pnpm exec vitest run vite.config.test.ts src/shared/api/client/axios-client.test.ts src/app/router/router.test.ts src/features/auth-login/ui/login-form.test.tsx
pnpm exec tsc -b --pretty false
```

Expected: PASS with relative request URLs resolved against jsdom and no
`VITE_API_BASE_URL` requirement.

- [ ] **Step 7: Prove the old runtime variable is gone from active code**

Run:

```bash
rg -n "VITE_API_BASE_URL|publicEnv|parsePublicEnv" src vite.config.ts .env.example .github/workflows
```

Expected: no matches. Historical `docs/superpowers/**` matches are allowed and
must not be edited.

- [ ] **Step 8: Commit the same-origin cutover**

```bash
git add .env.example .github/workflows/ci.yml vite.config.ts vite.config.test.ts tsconfig.node.json src/shared/api/client/axios-client.ts src/shared/api/client/axios-client.test.ts
git add -u src/shared/config
git commit -m "refactor(api): use same-origin browser transport"
```

---

### Task 2: Digest-pinned non-root static runtime

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `config/nginx/default.conf`
- Create: `config/nginx/security-headers.conf`
- Create: `scripts/oci/container-files.test.ts`

**Interfaces:**

- Container port: `8080`.
- Health: `GET /_frontend/health` returns `200`, `text/plain`, body `ok\n`,
  and `Cache-Control: no-store`.
- UI paths use SPA fallback.
- `/v1`, `/v1/*`, `/health`, `/health/*` return frontend-container `404`.
- `index.html` uses `no-cache`; hashed assets use
  `public, max-age=31536000, immutable`.
- Labels:

```text
org.opencontainers.image.source
org.opencontainers.image.revision
org.opencontainers.image.created
io.github.actions.workflow-run-url
```

- Consumers: Task 3 OCI smoke and Task 4 publication workflow.

- [ ] **Step 1: Write the failing container-file contract**

Create `scripts/oci/container-files.test.ts`:

```ts
// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('frontend container files', () => {
  it('pins build/runtime images and the non-root runtime contract', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')

    expect(dockerfile).toContain(
      'node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436',
    )
    expect(dockerfile).toContain(
      'nginxinc/nginx-unprivileged:alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786',
    )
    expect(dockerfile).toContain('USER 101')
    expect(dockerfile).toContain('EXPOSE 8080')
    expect(dockerfile).toContain('io.github.actions.workflow-run-url')
  })

  it('keeps backend paths out of the SPA fallback', async () => {
    const nginx = await readFile('config/nginx/default.conf', 'utf8')

    expect(nginx).toMatch(/location ~ \^\/\(\?:v1\|health\)/u)
    expect(nginx).toContain('return 404;')
    expect(nginx).toContain('try_files $uri $uri/ /index.html;')
    expect(nginx).toContain('/_frontend/health')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run scripts/oci/container-files.test.ts
```

Expected: FAIL because `Dockerfile` and Nginx configuration do not exist.

- [ ] **Step 3: Add the security-header include**

Create `config/nginx/security-headers.conf`:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Frame-Options "DENY" always;
```

Do not add HSTS inside the HTTP-only container.

- [ ] **Step 4: Add the Nginx routing and cache configuration**

Create `config/nginx/default.conf` with one `server`:

```nginx
server {
    listen 8080;
    listen [::]:8080;
    server_name _;
    server_tokens off;

    root /usr/share/nginx/html;
    index index.html;

    include /etc/nginx/snippets/security-headers.conf;

    location = /_frontend/health {
        default_type text/plain;
        add_header Cache-Control "no-store" always;
        include /etc/nginx/snippets/security-headers.conf;
        return 200 "ok\n";
    }

    location ~ ^/(?:v1|health)(?:/|$) {
        return 404;
    }

    location ~* \.(?:css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        include /etc/nginx/snippets/security-headers.conf;
    }

    location = /index.html {
        expires -1;
        try_files $uri =404;
    }

    location / {
        expires -1;
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 5: Add the multi-stage Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm@11.15.1 install --frozen-lockfile
COPY . .
RUN corepack pnpm@11.15.1 run build

FROM nginxinc/nginx-unprivileged:alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786 AS runtime
ARG BUILD_SOURCE
ARG BUILD_REVISION
ARG BUILD_CREATED
ARG BUILD_WORKFLOW_RUN_URL
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      io.github.actions.workflow-run-url="${BUILD_WORKFLOW_RUN_URL}"
COPY config/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY config/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/_frontend/health || exit 1
```

Do not copy `package.json`, source, OpenAPI or build dependencies into
`runtime`.

- [ ] **Step 6: Add the bounded Docker build context**

Create `.dockerignore`:

```text
.git
.github
.superpowers
.env
.env.*
!.env.example
node_modules
dist
coverage
docs
openapi
scripts
*.log
```

`src`, generated source, public assets, TypeScript/Vite config, lockfile and
`config/nginx` remain available to the build.

- [ ] **Step 7: Run the contract test and build image**

Run:

```bash
pnpm exec vitest run scripts/oci/container-files.test.ts
docker build --platform linux/amd64 --build-arg BUILD_SOURCE=https://github.com/example/react-starter --build-arg BUILD_REVISION=1111111111111111111111111111111111111111 --build-arg BUILD_CREATED=2026-07-30T00:00:00Z --build-arg BUILD_WORKFLOW_RUN_URL=https://github.com/example/react-starter/actions/runs/1/attempts/1 --tag react-starter:container-contract .
```

Expected: test PASS and Docker build succeeds. This local tag is not release
evidence.

- [ ] **Step 8: Inspect final contents and non-root metadata**

Run:

```bash
docker image inspect react-starter:container-contract --format '{{json .Config.User}} {{json .Config.ExposedPorts}} {{json .Config.Labels}}'
docker run --rm --entrypoint sh react-starter:container-contract -c 'test ! -e /app && test ! -e /usr/share/nginx/html/openapi'
```

Expected: user `"101"`, port `8080/tcp`, all four labels, and no source/OpenAPI
paths.

- [ ] **Step 9: Commit the static runtime**

```bash
git add Dockerfile .dockerignore config/nginx scripts/oci/container-files.test.ts
git commit -m "feat(oci): add non-root frontend image"
```

---

### Task 3: Reusable local and exact-digest OCI smoke

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `eslint.config.js`
- Create: `scripts/lib/command-runner.ts`
- Create: `scripts/lib/command-runner.test.ts`
- Create: `scripts/oci/frontend-http-contract.ts`
- Create: `scripts/oci/frontend-http-contract.test.ts`
- Create: `scripts/oci/docker-image-smoke.ts`
- Create: `scripts/oci/docker-image-smoke.test.ts`
- Create: `scripts/oci/run-image-smoke.ts`
- Create: `scripts/oci/run-image-smoke.test.ts`

**Interfaces:**

- Produces:

```ts
export interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface CommandOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly stdin?: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export interface CommandPort {
  run(
    executable: string,
    arguments_: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult>
}

export class ExecFileCommandRunner implements CommandPort {}

export async function verifyFrontendHttpContract(
  baseUrl: URL,
  fetchImplementation?: typeof fetch,
): Promise<void>

export interface DockerImageSmokeInput {
  readonly imageRef: string
  readonly expectedRevision: string
  readonly expectedSource?: string
  readonly expectedWorkflowRunUrl?: string
}

export async function smokeDockerImage(
  input: DockerImageSmokeInput,
  dependencies?: {
    readonly commands?: CommandPort
    readonly fetchImplementation?: typeof fetch
  },
): Promise<void>

export type OciSmokeOptions =
  | { readonly buildLocal: true }
  | ({ readonly buildLocal: false } & DockerImageSmokeInput)

export function parseOciSmokeOptions(
  arguments_: readonly string[],
): OciSmokeOptions
```

- `pnpm oci:check` builds the checkout when `--image` is absent.
- `pnpm oci:check -- --image <exact-ref> --revision <sha> ...` never rebuilds.
- Consumers: Task 4 and the later deployment operator.

- [ ] **Step 1: Add the exact script runtime dependency**

Run:

```bash
pnpm add --save-dev --save-exact tsx@4.23.1
```

Add:

```json
"oci:check": "tsx scripts/oci/run-image-smoke.ts"
```

Do not add a Docker call to `pnpm check`.

- [ ] **Step 2: Write failing command-runner tests**

Cover successful stdout, non-zero exit, stdin delivery, timeout and abort:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { ExecFileCommandRunner } from './command-runner'

it('captures one bounded child process result', async () => {
  const result = await new ExecFileCommandRunner().run(
    process.execPath,
    ['-e', 'process.stdout.write("ok")'],
    { timeoutMs: 1_000 },
  )

  expect(result).toEqual({ exitCode: 0, stdout: 'ok', stderr: '' })
})
```

Do not put secret test values in thrown error messages.

- [ ] **Step 3: Run command-runner test and verify RED**

Run:

```bash
pnpm exec vitest run scripts/lib/command-runner.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the bounded `execFile` adapter**

Use `spawn`, array arguments only, optional stdin, `AbortSignal.any` with
`AbortSignal.timeout`, bounded stdout/stderr accumulation of 1 MiB each, and a
single resolved `CommandResult`. Reject spawn/timeout/abort with a fixed
`CommandExecutionError` containing executable, exit category and no stdin/env.

Update `eslint.config.js` with Node globals for:

```js
{
  files: ['scripts/**/*.ts', 'vite.config.ts', 'vite.config.test.ts'],
  languageOptions: { globals: globals.node },
}
```

- [ ] **Step 5: Write failing pure HTTP-contract tests**

Use an injected fake `fetch` and cover:

- health `ok\n`, `text/plain`, `no-store`;
- `/`, `/login`, `/approval-requests/<uuid>` return HTML with the app root;
- a hashed asset from `index.html` has immutable cache;
- `/v1/__frontend_deployment_probe__` and `/health/unknown` are `404` and not
  HTML;
- all responses have `nosniff`, `no-referrer` and `DENY`;
- a wrong body, header, status or redirect rejects.

Representative assertion:

```ts
await expect(
  verifyFrontendHttpContract(new URL('http://127.0.0.1:8080'), fakeFetch),
).resolves.toBeUndefined()
```

- [ ] **Step 6: Run HTTP-contract tests and verify RED**

Run:

```bash
pnpm exec vitest run scripts/oci/frontend-http-contract.test.ts
```

Expected: FAIL because the verifier does not exist.

- [ ] **Step 7: Implement the pure HTTP verifier**

Use `redirect: 'error'` and a per-request 5-second timeout. Parse one
`/assets/<hashed-name>` URL from `index.html`; do not hard-code Vite's hash.
Require the exact response contracts listed in Step 5. Throw
`FrontendHttpContractError` with only `path` and a fixed `rule`.

- [ ] **Step 8: Write failing Docker orchestration tests**

With fake `CommandPort` and fake fetch, verify this exact sequence:

```text
docker image inspect
docker run --detach --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m
docker port
HTTP readiness and full contract
docker stop --time 10
docker inspect exit code
docker rm --force in finally when still present
```

Also verify:

- `.Config.User` is `101`;
- expected revision/source/workflow labels match;
- a mismatched label fails before `docker run`;
- every generated container name begins `react-starter-oci-smoke-`;
- failure still attempts cleanup;
- caller-supplied image is never removed.

- [ ] **Step 9: Implement container lifecycle and metadata checks**

`smokeDockerImage` must:

1. inspect `.Config.User`, exposed port and labels as JSON;
2. create a unique owned container name;
3. run the image on an ephemeral loopback port with read-only root and `/tmp`;
4. obtain the host port from `docker port`;
5. retry only health connection failures for at most 20 seconds;
6. run `verifyFrontendHttpContract`;
7. issue `docker stop --time 10`;
8. require exit code `0`;
9. remove only its own container in `finally`.

No shell interpolation or `docker system prune` is allowed.

- [ ] **Step 10: Write failing CLI grammar tests**

Cover:

```ts
expect(parseOciSmokeOptions([])).toMatchObject({ buildLocal: true })

expect(
  parseOciSmokeOptions([
    '--image',
    'ghcr.io/example/react-starter@sha256:' + 'a'.repeat(64),
    '--revision',
    '1'.repeat(40),
    '--source',
    'https://github.com/example/react-starter',
    '--workflow-run-url',
    'https://github.com/example/react-starter/actions/runs/1/attempts/1',
  ]),
).toMatchObject({ buildLocal: false })
```

Reject tags, mixed-case GHCR coordinates, missing revision, unknown flags and
credential-bearing URLs.

- [ ] **Step 11: Implement local build and supplied-image CLI modes**

When no image is supplied:

1. read `git rev-parse HEAD`;
2. read commit ISO time;
3. normalize the GitHub origin URL or use
   `https://github.com/local/react-starter`;
4. use workflow URL
   `https://github.com/local/react-starter/actions/runs/0/attempts/0`;
5. build a unique local `linux/amd64` tag with all four build arguments;
6. smoke it;
7. remove only that owned local tag in `finally`.

When `--image` is supplied, call `smokeDockerImage` directly and never run
`docker build` or `docker image rm`.

- [ ] **Step 12: Run focused tests and the real container gate**

Run:

```bash
pnpm exec vitest run scripts/lib/command-runner.test.ts scripts/oci
pnpm oci:check
```

Expected: all unit tests PASS; a real `linux/amd64` image passes metadata,
read-only, route, cache, header and SIGTERM checks with no leftover container.

- [ ] **Step 13: Commit the OCI smoke tool**

```bash
git add package.json pnpm-lock.yaml eslint.config.js scripts/lib scripts/oci
git commit -m "test(oci): verify frontend image contract"
```

---

### Task 4: Stage GHCR publication workflow

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/stage-image.yml`
- Create: `scripts/ci/stage-image-workflow.test.ts`

**Interfaces:**

- PR workflow: `pull_request` to `stage`, `contents: read`, `pnpm check`.
- Publication workflow: `push` to `stage`.
- Candidate image:

```text
ghcr.io/<lowercase-owner>/<lowercase-repository>
tag: sha-<full-sha>-run-<run-id>-attempt-<run-attempt>
identity: ghcr.io/...@sha256:<digest>
```

- Workflow-run label and summary use:

```text
https://github.com/<owner>/<repo>/actions/runs/<run-id>/attempts/<run-attempt>
```

- Consumers: later GitHub workflow verifier and Dokploy manifest.

- [ ] **Step 1: Write the failing workflow contract test**

Read both YAML files as text and assert:

```ts
// @vitest-environment node

expect(ci).toContain('pull_request:')
expect(ci).not.toContain('push:')
expect(stageImage).toContain('push:')
expect(stageImage).toContain('branches: [stage]')
expect(stageImage).toContain('packages: write')
expect(stageImage).toContain('${{ steps.build.outputs.digest }}')
expect(stageImage).toContain('severity: HIGH,CRITICAL')
expect(stageImage).toContain('ignore-unfixed: true')
expect(stageImage).toContain('pnpm oci:check')
expect(stageImage).not.toMatch(/DOKPLOY|VPS|SSH_PRIVATE_KEY/u)
expect(stageImage).not.toMatch(/latest|stage-latest/u)
```

Also assert the exact action pins from Step 3.

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```bash
pnpm exec vitest run scripts/ci/stage-image-workflow.test.ts
```

Expected: FAIL because `stage-image.yml` does not exist and `ci.yml` still has
a `push` trigger.

- [ ] **Step 3: Split PR and publication workflows**

Remove only the `push` trigger from `ci.yml`.

Create `stage-image.yml` with:

```yaml
name: Stage image

on:
  push:
    branches: [stage]

permissions:
  contents: read
```

Use these exact verified action pins:

```text
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c
docker/login-action@af1e73f918a031802d376d3c8bbc3fe56130a9b0
docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a
aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25
```

The `gate` job has only `contents: read`, installs the locked dependencies and
runs one `pnpm check`.

The `publish` job:

1. needs `gate`;
2. adds job-scoped `packages: write`;
3. derives a lowercase image name, commit time, unique tag and attempt URL;
4. logs in to GHCR using `${{ github.actor }}` and
   `${{ secrets.GITHUB_TOKEN }}`;
5. builds/pushes `linux/amd64` with all four labels;
6. scans `${image}@${digest}` with Trivy:

```yaml
scanners: vuln
severity: HIGH,CRITICAL
ignore-unfixed: true
exit-code: 1
```

7. pulls `${image}@${digest}`;
8. runs:

```bash
pnpm oci:check -- \
  --image "${IMAGE_NAME}@${DIGEST}" \
  --revision "${GITHUB_SHA}" \
  --source "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}" \
  --workflow-run-url "${WORKFLOW_RUN_URL}"
```

9. writes image, digest, revision, attempt URL and gate results to
   `$GITHUB_STEP_SUMMARY`.

Do not add `workflow_dispatch`, environment secrets or deployment calls.

- [ ] **Step 4: Run workflow and formatting checks**

Run:

```bash
pnpm exec vitest run scripts/ci/stage-image-workflow.test.ts
pnpm exec prettier --check .github/workflows/ci.yml .github/workflows/stage-image.yml scripts/ci/stage-image-workflow.test.ts
git diff --check
```

Expected: PASS. This is source validation only; do not claim that GitHub parsed
or executed the workflow.

- [ ] **Step 5: Commit the publication workflow**

```bash
git add .github/workflows/ci.yml .github/workflows/stage-image.yml scripts/ci/stage-image-workflow.test.ts
git commit -m "ci(oci): publish verified stage image"
```

---

### Task 5: Active documentation and final local evidence

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/getting-started.md`
- Create: `docs/runbooks/frontend-image-publication.md`
- Create: `docs/runbooks/frontend-same-origin-ingress.md`

**Interfaces:**

- Active docs describe commands that now exist.
- They distinguish source, local OCI, remote CI, GHCR and deployment evidence.
- They do not claim Dokploy operator availability; that belongs to the second
  plan.

- [ ] **Step 1: Update the architecture and agent contracts**

In `AGENTS.md`:

- add a deployment task route to both new runbooks;
- replace the `VITE_API_BASE_URL` rule with relative same-origin `/v1`;
- document `DEV_API_PROXY_TARGET` as dev-server-only;
- add `pnpm oci:check` as a Docker-dependent gate separate from `pnpm check`;
- state that merge publishes a candidate but does not deploy.

In `docs/architecture/overview.md`:

- replace the runtime env paragraph and Axios bullet;
- add the browser → same-origin ingress → backend happy path;
- add the PR/source and stage/image evidence flow;
- add the OCI runtime ownership boundary.

- [ ] **Step 2: Update bootstrap and README**

In `docs/getting-started.md` and `README.md`:

- keep `cp .env.example .env.local` optional only when overriding the default
  local backend;
- document `DEV_API_PROXY_TARGET`;
- remove production API-origin build instructions;
- explain that backend still validates the real browser `Origin`;
- add `pnpm oci:check`;
- add GHCR package/repository permissions and integration-branch
  personalization;
- state that a copied public frontend and admin each publish their own image.

Do not edit historical `docs/superpowers/specs/**` or plans.

- [ ] **Step 3: Write the same-origin ingress runbook**

`docs/runbooks/frontend-same-origin-ingress.md` must contain:

```text
public host /v1/* and /health/*  → backend
public host all remaining paths → public frontend:8080
admin host /v1/* and /health/*   → backend
admin host all remaining paths  → admin frontend:8080
api host all paths               → backend
```

Document path-router priority, `/_frontend/health`, the API misrouting probe,
TLS/HSTS ownership at ingress, and the fact that no host is baked into image.
Mark all Dokploy/VPS examples as preparation, not live evidence.

- [ ] **Step 4: Write the publication runbook**

`docs/runbooks/frontend-image-publication.md` must explain:

1. PR `pnpm check`;
2. merge-generated `push stage` event;
3. gate → build → GHCR digest → Trivy → pull → smoke;
4. where to copy the exact digest and attempt URL;
5. why the SHA/run tag is only a locator;
6. why a failed scan/smoke digest is not approved;
7. required GHCR package linkage and Actions permissions;
8. that no Dokploy secret belongs in this workflow;
9. that publication is not deployment.

Link the official GitHub container registry and publishing documentation:

- `https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images`
- `https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry`

- [ ] **Step 5: Run documentation and source gates**

Select Node 24 first, then run:

```bash
node --version
pnpm --version
pnpm exec prettier --check AGENTS.md README.md docs .github scripts src vite.config.ts
pnpm check
git diff --check
```

Expected versions:

```text
v24.18.0
11.15.1
```

Expected gates: PASS.

- [ ] **Step 6: Run the final real OCI gate**

Run:

```bash
pnpm oci:check
docker ps --filter name=react-starter-oci-smoke-
```

Expected: `pnpm oci:check` PASS and no owned smoke container remains.

- [ ] **Step 7: Review the full delivery boundary**

Run:

```bash
rg -n "VITE_API_BASE_URL|latest|stage-latest|DOKPLOY_API_KEY" AGENTS.md README.md docs/architecture docs/getting-started.md docs/runbooks .github src scripts vite.config.ts
git status --short
git diff --stat
git diff
```

Expected:

- no active `VITE_API_BASE_URL`;
- no mutable release tag;
- no Dokploy secret in publication files;
- only intended OCI/publication changes;
- no claim of GHCR publication or deployment.

- [ ] **Step 8: Commit the active documentation**

```bash
git add AGENTS.md README.md docs/architecture/overview.md docs/getting-started.md docs/runbooks/frontend-image-publication.md docs/runbooks/frontend-same-origin-ingress.md
git commit -m "docs(oci): document frontend publication flow"
```

- [ ] **Step 9: Record completion evidence without remote claims**

Record in the implementation report:

```text
Source review: PASS at <local commit>
pnpm check: PASS on Node 24.18.0 / pnpm 11.15.1
pnpm oci:check: PASS for locally built linux/amd64 image
Remote CI: NOT RUN
GHCR publication: NOT RUN
Dokploy/VPS deployment: OUT OF SCOPE
```

Replace `<local commit>` with the actual `git rev-parse HEAD` output when
executing this step.
