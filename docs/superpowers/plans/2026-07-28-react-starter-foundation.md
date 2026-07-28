# React Starter Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fresh Vite application into a reproducible React starter with Tailwind, FSD boundaries, generated OpenAPI clients, RFC 9457 error handling, and opaque-cookie authentication against `nest-js-starter`.

**Architecture:** Keep the application as a Vite SPA and use React Router Data Mode for authentication-aware route loaders. OpenAPI is copied from the backend into a committed snapshot, Orval generates Axios/TanStack Query/Zod artifacts, and handwritten FSD modules adapt those artifacts for UI use. Authentication follows the backend cookie and CSRF contracts; no JWT or refresh-token behavior is introduced.

**Tech Stack:** React 19, Vite 8, TypeScript 6, React Router Data Mode, Tailwind CSS 4, TanStack Query 5, Axios, Orval 8, Zod 4, React Hook Form, Vitest, Testing Library, MSW, ESLint, Prettier, Steiger.

## Global Constraints

- Use Node `24.18.0` and pnpm `11.15.1`.
- Keep `stage` as the integration and default branch; implement on a focused branch created from current `origin/stage`.
- Use `../nest-js-starter/docs/api/openapi.json` as the default local OpenAPI source and `openapi/openapi.json` as the committed frontend snapshot.
- Verify current stable package versions with Context7 before installation; if Context7 is unavailable, use the official React Router, Tailwind, Orval, Axios, TanStack Query, Vitest, MSW, and Feature-Sliced/Steiger documentation.
- Install new dependencies with `--save-exact`; commit `pnpm-lock.yaml`.
- Use React Router Data Mode with `createBrowserRouter` and `RouterProvider`; do not introduce Framework Mode or SSR.
- Use only the FSD layers `app`, `pages`, `features`, `entities`, and `shared`; do not create `widgets` without a real reusable page block.
- Generated files live only in `src/shared/api/generated` and `src/shared/api/generated-zod` and are never edited manually.
- UI files must not import generated React Query hooks directly.
- Authentication is an opaque HttpOnly session cookie plus a session-bound CSRF token; never read, persist, serialize, or log the raw session cookie or CSRF token.
- Do not add JWT access tokens, refresh-token interception, refresh retries, or code copied from `admin-codex`.
- Redirect to `/login` only for `AUTHENTICATION_REQUIRED`; do not treat `403`, `503`, network failures, or invalid problem responses as anonymous sessions.
- Drive frontend error behavior from stable backend problem `code` values, not `title` or `detail` string matching.
- Keep the dashboard functionally empty except for the current-user identity and logout control needed to verify the session lifecycle.
- Do not implement any item listed under `Deferred after the first iteration` in the approved design.
- Follow RED → GREEN → REFACTOR for behavioral work and make the commits named in this plan only after the stated verification passes.

## Review amendment (2026-07-28)

- Every authentication decision must fetch `/v1/auth/me` fresh; do not use
  `ensureQueryData` as proof that a cached session is still valid.
- A successful `POST /v1/auth/login` is the session commit. Store its CSRF
  token and navigate; let the protected-route loader own a later `/v1/auth/me`
  failure so a valid new session is not reported as a failed login.
- Invalidating CSRF state must prevent an older in-flight token fetch from
  overwriting newer state or clearing newer request deduplication.
- The documented JSON `503` responses of `/health/ready` and
  `/health/startup` resolve as generated operational data only with
  `application/json`. Other `4xx`/`5xx` responses, including
  `application/problem+json` at those paths, remain RFC 9457-normalized errors.
- Route loaders pass React Router's cancellation signal to `/v1/auth/me`; an
  abandoned navigation must not later clear a newer session or CSRF state.
- A normalized problem `code` must be one of the generated OpenAPI codes;
  unknown values are protocol errors.

---

## File map

The final implementation owns these files and responsibilities:

```text
.
├── .env.example                         # public local API origin only
├── .github/workflows/ci.yml             # frozen install and aggregate check
├── .nvmrc                               # Node 24.18.0
├── .prettierignore                      # generated/build exclusions as needed
├── .prettierrc.json                     # Prettier plus Tailwind class sorting
├── README.md                            # operator-facing setup and contract update flow
├── openapi/openapi.json                 # committed backend contract snapshot
├── orval.config.ts                      # React Query/Axios and Zod generation
├── scripts/openapi/
│   ├── sync-openapi.mjs                 # local/file/HTTP source synchronization
│   └── sync-openapi.test.mjs            # invalid source and required-path tests
├── src/
│   ├── app/
│   │   ├── entrypoint/index.tsx         # React root
│   │   ├── providers/
│   │   │   ├── app-provider.tsx         # provider composition
│   │   │   ├── query-client.ts          # retry policy and singleton
│   │   │   └── query-client.test.ts     # retry-policy tests
│   │   ├── router/
│   │   │   ├── loaders.ts               # public/protected auth loaders
│   │   │   ├── loaders.test.ts          # 401/403/503/network routing behavior
│   │   │   ├── route-error.tsx          # safe route-level error states
│   │   │   ├── route-error.test.tsx     # problem-code rendering behavior
│   │   │   └── router.tsx               # Data Router creation
│   │   └── styles/
│   │       ├── index.css                 # Tailwind import and global base styles
│   │       └── tailwind.test.ts          # compiled utility smoke test
│   ├── pages/
│   │   ├── dashboard/
│   │   │   ├── index.ts
│   │   │   └── ui/dashboard-page.tsx
│   │   └── login/
│   │       ├── index.ts
│   │       └── ui/login-page.tsx
│   ├── features/
│   │   ├── auth-login/
│   │   │   ├── index.ts
│   │   │   ├── model/login-errors.ts
│   │   │   ├── model/login-errors.test.ts
│   │   │   ├── model/use-login.ts
│   │   │   ├── ui/login-form.tsx
│   │   │   └── ui/login-form.test.tsx
│   │   └── auth-logout/
│   │       ├── index.ts
│   │       ├── model/use-logout.ts
│   │       ├── ui/logout-button.tsx
│   │       └── ui/logout-button.test.tsx
│   ├── entities/session/
│   │   ├── index.ts
│   │   ├── api/session.ts
│   │   └── model/session-cache.ts
│   └── shared/
│       ├── api/
│       │   ├── index.ts                 # curated handwritten API public surface
│       │   ├── client/
│       │   │   ├── api-errors.ts        # typed RFC 9457/network/protocol errors
│       │   │   ├── api-errors.test.ts
│       │   │   ├── axios-client.ts      # credentialed clients and CSRF interceptor
│       │   │   ├── axios-client.test.ts
│       │   │   ├── csrf-token.ts        # in-memory token and in-flight deduplication
│       │   │   ├── csrf-token.test.ts
│       │   │   └── orval-mutator.ts     # generated-client transport adapter
│       │   ├── generated/               # Orval React Query/Axios output
│       │   └── generated-zod/           # Orval Zod output
│       ├── config/
│       │   ├── env.ts
│       │   ├── env.test.ts
│       │   └── index.ts
│       ├── routes/
│       │   ├── index.ts
│       │   ├── return-to.ts
│       │   └── return-to.test.ts
│       ├── lib/testing/
│       │   ├── handlers.ts
│       │   ├── server.ts
│       │   └── setup-tests.ts
│       └── ui/
│           ├── error-message.tsx
│           └── index.ts
├── steiger.config.ts                    # recommended FSD rules
├── tsconfig.app.json                    # @ alias and browser types
├── vite.config.ts                       # React, Tailwind, alias, Vitest
└── package.json                         # exact toolchain and aggregate scripts
```

Delete the Vite demo files after the new entrypoint is connected:

```text
src/App.css
src/App.tsx
src/index.css
src/assets/hero.png
src/assets/react.svg
src/assets/vite.svg
```

### Task 1: Toolchain, Tailwind, formatting, and test harness

**Files:**

- Create: `.nvmrc`
- Create: `.env.example`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `src/app/entrypoint/index.tsx`
- Create: `src/app/styles/index.css`
- Create: `src/app/styles/tailwind.test.ts`
- Create: `src/shared/config/env.ts`
- Create: `src/shared/config/env.test.ts`
- Create: `src/shared/config/index.ts`
- Create: `src/shared/lib/testing/setup-tests.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`
- Modify: `src/main.tsx`

**Interfaces:**

- Produces: `parsePublicEnv(input): PublicEnv` and `publicEnv.VITE_API_BASE_URL`.
- Produces: the `@/*` → `src/*` import alias.
- Produces: a jsdom Vitest environment with jest-dom matchers.
- Produces: Tailwind-transformed global CSS and deterministic class ordering.
- Consumes: no application interfaces.

- [ ] **Step 1: Confirm the supported runtime and current library instructions**

Run:

```bash
node --version
pnpm --version
```

Expected:

```text
v24.18.0
11.15.1
```

Use Context7 for React Router, Tailwind CSS, Orval, Axios, TanStack Query,
Vitest, MSW, and Steiger. If Context7 returns a quota or availability error,
use these official sources:

```text
https://reactrouter.com/start/modes
https://tailwindcss.com/docs/installation/using-vite
https://tailwindcss.com/docs/editor-setup
https://orval.dev/docs/guides/custom-axios
https://orval.dev/docs/reference/configuration/output
https://axios-http.com/docs/instance
https://tanstack.com/query/latest/docs/framework/react/overview
https://vitest.dev/guide/
https://mswjs.io/docs/
https://github.com/feature-sliced/steiger
```

- [ ] **Step 2: Install the missing runtime and development dependencies**

Run:

```bash
pnpm add --save-exact react-router@latest axios@latest
pnpm add --save-dev --save-exact orval@latest prettier@latest prettier-plugin-tailwindcss@latest @tanstack/eslint-plugin-query@latest vitest@latest jsdom@latest @testing-library/react@latest @testing-library/user-event@latest @testing-library/jest-dom@latest msw@latest steiger@latest @feature-sliced/steiger-plugin@latest
```

Then add these exact package metadata fields:

```json
{
  "packageManager": "pnpm@11.15.1",
  "engines": {
    "node": "24.18.0",
    "pnpm": "11.15.1"
  }
}
```

Write `24.18.0` followed by a newline to `.nvmrc`.

- [ ] **Step 3: Write failing environment and Tailwind smoke tests**

Create `src/shared/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { parsePublicEnv } from './env'

describe('parsePublicEnv', () => {
  it('accepts an absolute HTTP API URL and removes its trailing slash', () => {
    expect(
      parsePublicEnv({ VITE_API_BASE_URL: 'http://localhost:3000/' }),
    ).toEqual({ VITE_API_BASE_URL: 'http://localhost:3000' })
  })

  it.each(['', '/api', 'ftp://example.com'])(
    'rejects an invalid API URL: %s',
    (VITE_API_BASE_URL) => {
      expect(() => parsePublicEnv({ VITE_API_BASE_URL })).toThrow(
        'VITE_API_BASE_URL',
      )
    },
  )
})
```

Create `src/app/styles/tailwind.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import compiledCss from './index.css?inline'

describe('Tailwind Vite integration', () => {
  it('compiles utilities and leaves no Tailwind directives in browser CSS', () => {
    expect(compiledCss).toContain('.min-h-screen')
    expect(compiledCss).not.toMatch(/@(tailwind|theme)\b/)
  })
})
```

- [ ] **Step 4: Run the tests and observe the missing modules**

Run:

```bash
pnpm exec vitest run src/shared/config/env.test.ts src/app/styles/tailwind.test.ts
```

Expected: FAIL because `env.ts` and `app/styles/index.css` do not exist.

- [ ] **Step 5: Configure environment validation, Vite, Tailwind, and tests**

Create `src/shared/config/env.ts`:

```ts
import { z } from 'zod'

const publicEnvSchema = z.object({
  VITE_API_BASE_URL: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .transform((value) => value.replace(/\/+$/, '')),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

export function parsePublicEnv(
  input: Record<string, string | boolean | undefined>,
): PublicEnv {
  return publicEnvSchema.parse(input)
}

export const publicEnv = parsePublicEnv(import.meta.env)
```

Create `src/shared/config/index.ts`:

```ts
export { parsePublicEnv, publicEnv } from './env'
export type { PublicEnv } from './env'
```

Create `src/app/styles/index.css`:

```css
@import 'tailwindcss';

@theme {
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  :root {
    font-family: var(--font-sans);
    color: #18181b;
    background: #fafafa;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
  }

  * {
    box-sizing: border-box;
  }

  body {
    min-width: 320px;
    min-height: 100vh;
    margin: 0;
  }

  button,
  input {
    font: inherit;
  }
}
```

Configure `vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    environment: 'jsdom',
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000',
    },
    setupFiles: ['./src/shared/lib/testing/setup-tests.ts'],
  },
})
```

Create `src/shared/lib/testing/setup-tests.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Add to `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client", "vitest/importMeta"]
  }
}
```

Create `.env.example`:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

Create the ignored local runtime file:

```bash
cp .env.example .env.local
```

- [ ] **Step 6: Connect the temporary entrypoint used by the Tailwind smoke**

Create `src/app/entrypoint/index.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/app/styles/index.css'

function FoundationSmoke() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p>React starter</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoundationSmoke />
  </StrictMode>,
)
```

Replace `src/main.tsx` with:

```ts
import '@/app/entrypoint'
```

- [ ] **Step 7: Configure Prettier and prove class sorting**

Create `.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/app/styles/index.css"
}
```

Create `.prettierignore`:

```text
dist
coverage
```

Add scripts:

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run"
  }
}
```

Temporarily change the smoke class to:

```tsx
<main className="p-6 justify-center min-h-screen flex items-center">
```

Run:

```bash
pnpm format
```

Expected source after formatting:

```tsx
<main className="flex min-h-screen items-center justify-center p-6">
```

- [ ] **Step 8: Run focused and build verification**

Run:

```bash
pnpm test -- src/shared/config/env.test.ts src/app/styles/tailwind.test.ts
pnpm format:check
pnpm build
```

Expected: all commands exit `0`; the build output contains no unresolved
`@theme` or `@tailwind` warning.

- [ ] **Step 9: Commit the foundation**

```bash
git add .nvmrc .env.example .prettierrc.json .prettierignore package.json pnpm-lock.yaml vite.config.ts tsconfig.app.json src/main.tsx src/app src/shared/config src/shared/lib/testing/setup-tests.ts
git commit -m "build: configure frontend toolchain"
```

### Task 2: OpenAPI synchronization and committed snapshot

**Files:**

- Create: `scripts/openapi/sync-openapi.mjs`
- Create: `scripts/openapi/sync-openapi.test.mjs`
- Create: `openapi/openapi.json` through the sync command
- Modify: `package.json`

**Interfaces:**

- Produces: `validateOpenApiDocument(value): object`.
- Produces: `readOpenApiSource(source): Promise<string>` for local paths, `file:` URLs, and HTTP(S) URLs.
- Produces: `syncOpenApi({ source, destination }): Promise<void>`.
- Produces: package script `api:sync`.
- Consumes: the backend document at `../nest-js-starter/docs/api/openapi.json`.

- [ ] **Step 1: Write failing OpenAPI validation tests**

Create `scripts/openapi/sync-openapi.test.mjs`:

```js
// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { syncOpenApi, validateOpenApiDocument } from './sync-openapi.mjs'

const authPaths = {
  '/v1/auth/login': { post: { operationId: 'authLogin' } },
  '/v1/auth/me': { get: { operationId: 'authGetMe' } },
  '/v1/auth/csrf': { get: { operationId: 'authGetCsrfToken' } },
  '/v1/auth/logout': { post: { operationId: 'authLogout' } },
}

describe('OpenAPI synchronization', () => {
  it.each([undefined, '', {}, { openapi: '2.0', paths: authPaths }])(
    'rejects an invalid document',
    (value) => {
      expect(() => validateOpenApiDocument(value)).toThrow()
    },
  )

  it('rejects a document missing a required auth operation', () => {
    const paths = { ...authPaths }
    delete paths['/v1/auth/csrf']

    expect(() => validateOpenApiDocument({ openapi: '3.0.3', paths })).toThrow(
      '/v1/auth/csrf',
    )
  })

  it('writes the source bytes with one normalized trailing newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'react-starter-openapi-'))
    const source = join(directory, 'source.json')
    const destination = join(directory, 'snapshot.json')
    await writeFile(
      source,
      JSON.stringify({ openapi: '3.0.3', paths: authPaths }),
    )

    await syncOpenApi({ source, destination })

    expect(await readFile(destination, 'utf8')).toBe(
      `${JSON.stringify({ openapi: '3.0.3', paths: authPaths })}\n`,
    )
  })
})
```

- [ ] **Step 2: Run the OpenAPI tests and observe the missing module**

Run:

```bash
pnpm test -- scripts/openapi/sync-openapi.test.mjs
```

Expected: FAIL because `sync-openapi.mjs` does not exist.

- [ ] **Step 3: Implement the synchronization script**

Create `scripts/openapi/sync-openapi.mjs` with these exported contracts:

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const requiredOperations = [
  ['/v1/auth/login', 'post'],
  ['/v1/auth/me', 'get'],
  ['/v1/auth/csrf', 'get'],
  ['/v1/auth/logout', 'post'],
]

export function validateOpenApiDocument(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.openapi !== 'string' ||
    !value.openapi.startsWith('3.') ||
    value.paths === null ||
    typeof value.paths !== 'object'
  ) {
    throw new Error('Expected a non-empty OpenAPI 3 JSON document')
  }

  for (const [path, method] of requiredOperations) {
    if (value.paths[path]?.[method] === undefined) {
      throw new Error(
        `OpenAPI document is missing ${method.toUpperCase()} ${path}`,
      )
    }
  }

  return value
}

export async function readOpenApiSource(source) {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`OpenAPI download failed with HTTP ${response.status}`)
    }
    return response.text()
  }

  const path = source.startsWith('file:')
    ? fileURLToPath(source)
    : resolve(process.cwd(), source)
  return readFile(path, 'utf8')
}

export async function syncOpenApi({ source, destination }) {
  const raw = await readOpenApiSource(source)
  if (raw.trim() === '') throw new Error('OpenAPI source is empty')

  const parsed = JSON.parse(raw)
  validateOpenApiDocument(parsed)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, `${raw.trimEnd()}\n`)
}

async function main() {
  const source =
    process.env.OPENAPI_SPEC_SOURCE ??
    '../nest-js-starter/docs/api/openapi.json'
  const destination = resolve(process.cwd(), 'openapi/openapi.json')
  await syncOpenApi({ source, destination })
  process.stdout.write(`OpenAPI snapshot updated from ${source}\n`)
}

if (process.argv[1] !== undefined) {
  const invokedUrl = pathToFileURL(resolve(process.argv[1])).href
  if (import.meta.url === invokedUrl) {
    await main()
  }
}
```

- [ ] **Step 4: Add the sync command and create the real snapshot**

Add:

```json
{
  "scripts": {
    "api:sync": "node scripts/openapi/sync-openapi.mjs"
  }
}
```

Run:

```bash
pnpm api:sync
```

Expected: `openapi/openapi.json` is byte-equivalent to the backend source except
for one normalized trailing newline and contains all four required auth paths.

- [ ] **Step 5: Verify local, file URL, invalid, and HTTP source behavior**

Run:

```bash
pnpm test -- scripts/openapi/sync-openapi.test.mjs
OPENAPI_SPEC_SOURCE=file:///Users/denischernykh/projects/starters/nest-js-starter/docs/api/openapi.json pnpm api:sync
```

For HTTP behavior, serve a temporary directory in one terminal:

```bash
python3 -m http.server 8765 --directory ../nest-js-starter/docs/api
```

Then run in another terminal:

```bash
OPENAPI_SPEC_SOURCE=http://127.0.0.1:8765/openapi.json pnpm api:sync
```

Expected: all valid source forms update the same snapshot; invalid documents
exit non-zero without replacing it.

- [ ] **Step 6: Commit the synchronization boundary**

```bash
git add package.json scripts/openapi openapi/openapi.json
git commit -m "build(api): synchronize backend OpenAPI"
```

### Task 3: RFC 9457 error types and normalization

**Files:**

- Create: `src/shared/api/client/api-errors.ts`
- Create: `src/shared/api/client/api-errors.test.ts`
- Create: `src/shared/api/index.ts`

**Interfaces:**

- Produces: `ProblemDocumentLike`.
- Produces: `ApiProblemError<TProblem>`, `ApiNetworkError`, and `ApiProtocolError`.
- Produces: `normalizeApiError<TProblem>(error, now?): ApiClientError<TProblem>`.
- Produces: `isProblemCode(error, code): boolean`.
- Produces: `retryAfterMs: number | null` without exposing raw invalid payloads.
- Consumes: Axios errors; it does not import or duplicate the backend problem-code enum.

- [ ] **Step 1: Write failing normalization tests**

Create `src/shared/api/client/api-errors.test.ts`:

```ts
import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  normalizeApiError,
} from './api-errors'

const problem = {
  type: 'https://nest-js-starter.invalid/problems/rate-limit-exceeded',
  title: 'Rate limit exceeded',
  status: 429,
  detail: 'Too many requests.',
  instance: 'urn:request:request-1',
  code: 'RATE_LIMIT_EXCEEDED',
  requestId: 'request-1',
}

function axiosFailure(data: unknown, contentType: string, retryAfter?: string) {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      config: { headers: new AxiosHeaders() },
      data,
      headers: new AxiosHeaders({
        'content-type': contentType,
        'retry-after': retryAfter,
      }),
      status: 429,
      statusText: 'Too Many Requests',
    },
  )
}

describe('normalizeApiError', () => {
  it('preserves the RFC 9457 code, status, request ID, and Retry-After', () => {
    const error = normalizeApiError(
      axiosFailure(problem, 'application/problem+json; charset=utf-8', '12'),
    )

    expect(error).toBeInstanceOf(ApiProblemError)
    expect(error).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429,
      requestId: 'request-1',
      retryAfterMs: 12_000,
    })
  })

  it.each([
    [problem, 'application/json'],
    [{ ...problem, requestId: undefined }, 'application/problem+json'],
  ])('maps an invalid problem response to a protocol error', (data, type) => {
    expect(normalizeApiError(axiosFailure(data, type))).toBeInstanceOf(
      ApiProtocolError,
    )
  })

  it('maps a response-less Axios failure to a network error', () => {
    expect(normalizeApiError(new AxiosError('offline'))).toBeInstanceOf(
      ApiNetworkError,
    )
  })
})
```

- [ ] **Step 2: Run the test and observe the missing error model**

Run:

```bash
pnpm test -- src/shared/api/client/api-errors.test.ts
```

Expected: FAIL because `api-errors.ts` does not exist.

- [ ] **Step 3: Implement structural RFC 9457 validation**

Implement `src/shared/api/client/api-errors.ts` around this public surface:

```ts
import axios from 'axios'
import { z } from 'zod'

const problemDocumentSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
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

export type ProblemDocumentLike = z.infer<typeof problemDocumentSchema>

export class ApiProblemError<
  TProblem extends ProblemDocumentLike = ProblemDocumentLike,
> extends Error {
  public readonly name = 'ApiProblemError'

  public constructor(
    public readonly problem: TProblem,
    public readonly retryAfterMs: number | null,
  ) {
    super(problem.title)
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

export class ApiNetworkError extends Error {
  public readonly name = 'ApiNetworkError'

  public constructor() {
    super('The API could not be reached')
  }
}

export class ApiProtocolError extends Error {
  public readonly name = 'ApiProtocolError'

  public constructor() {
    super('The API returned an invalid error response')
  }
}

export type ApiClientError<TProblem extends ProblemDocumentLike> =
  ApiProblemError<TProblem> | ApiNetworkError | ApiProtocolError
```

Complete `normalizeApiError` with these rules:

```ts
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
```

`parseRetryAfter` must return milliseconds for an integer delta-seconds value,
return the positive difference for a valid HTTP date, and return `null` for a
missing, negative, expired, or invalid value.

Add:

```ts
export function isProblemCode(
  error: unknown,
  code: string,
): error is ApiProblemError {
  return error instanceof ApiProblemError && error.code === code
}
```

- [ ] **Step 4: Verify runtime and generic type preservation**

Run:

```bash
pnpm test -- src/shared/api/client/api-errors.test.ts
pnpm exec tsc -b
```

Also add this compile-time assertion to the test file:

```ts
type GeneratedProblem = ProblemDocumentLike & {
  code: 'AUTHENTICATION_REQUIRED' | 'DEPENDENCY_UNAVAILABLE'
}

const preserveProblemType = (error: ApiProblemError<GeneratedProblem>) =>
  error.problem.code

expectTypeOf(preserveProblemType).returns.toEqualTypeOf<
  'AUTHENTICATION_REQUIRED' | 'DEPENDENCY_UNAVAILABLE'
>()
```

Expected: runtime tests and typecheck pass; no backend code catalogue is copied
into frontend source.

- [ ] **Step 5: Export the curated API error surface and commit**

Create `src/shared/api/index.ts`:

```ts
export {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  isProblemCode,
  normalizeApiError,
} from './client/api-errors'
export type { ApiClientError, ProblemDocumentLike } from './client/api-errors'
```

Commit:

```bash
git add src/shared/api
git commit -m "feat(api): normalize problem responses"
```

### Task 4: Credentialed Axios transport and session-bound CSRF

**Files:**

- Create: `src/shared/api/client/csrf-token.ts`
- Create: `src/shared/api/client/csrf-token.test.ts`
- Create: `src/shared/api/client/axios-client.ts`
- Create: `src/shared/api/client/axios-client.test.ts`
- Create: `src/shared/api/client/orval-mutator.ts`
- Create: `src/shared/lib/testing/handlers.ts`
- Create: `src/shared/lib/testing/server.ts`
- Modify: `src/shared/lib/testing/setup-tests.ts`
- Modify: `src/shared/api/index.ts`

**Interfaces:**

- Produces: `setCsrfToken(token)`, `clearCsrfToken()`, `peekCsrfToken()`, and `getOrFetchCsrfToken(fetcher)`.
- Produces: `API_AXIOS_INSTANCE` with `withCredentials: true`.
- Produces: an internal bare credentialed client used only by CSRF acquisition.
- Produces: `apiMutator<T>(config, options?): Promise<T>`.
- Produces: `ErrorType<ErrorData>` that retains the generated error union.
- Produces: `BodyType<BodyData> = BodyData`.
- Consumes: `publicEnv`, `normalizeApiError`, and the JSON `{ csrfToken }` response shape.

- [ ] **Step 1: Write failing in-memory CSRF tests**

Create `src/shared/api/client/csrf-token.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCsrfToken,
  getOrFetchCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from './csrf-token'

describe('CSRF token memory', () => {
  beforeEach(clearCsrfToken)

  it('keeps and clears the current token in module memory', () => {
    setCsrfToken('token-1')
    expect(peekCsrfToken()).toBe('token-1')
    clearCsrfToken()
    expect(peekCsrfToken()).toBeNull()
  })

  it('deduplicates concurrent token fetches', async () => {
    const fetcher = vi.fn(async () => 'token-1')

    await expect(
      Promise.all([
        getOrFetchCsrfToken(fetcher),
        getOrFetchCsrfToken(fetcher),
        getOrFetchCsrfToken(fetcher),
      ]),
    ).resolves.toEqual(['token-1', 'token-1', 'token-1'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not cache a rejected fetch', async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('token-2')

    await expect(getOrFetchCsrfToken(fetcher)).rejects.toThrow('offline')
    await expect(getOrFetchCsrfToken(fetcher)).resolves.toBe('token-2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run the CSRF tests and observe the missing module**

Run:

```bash
pnpm test -- src/shared/api/client/csrf-token.test.ts
```

Expected: FAIL because `csrf-token.ts` does not exist.

- [ ] **Step 3: Implement the in-memory token state**

Create `src/shared/api/client/csrf-token.ts`:

```ts
let csrfToken: string | null = null
let pendingCsrfToken: Promise<string> | null = null

export function peekCsrfToken() {
  return csrfToken
}

export function setCsrfToken(token: string) {
  csrfToken = token
}

export function clearCsrfToken() {
  csrfToken = null
  pendingCsrfToken = null
}

export async function getOrFetchCsrfToken(
  fetcher: () => Promise<string>,
): Promise<string> {
  if (csrfToken !== null) return csrfToken
  if (pendingCsrfToken !== null) return pendingCsrfToken

  pendingCsrfToken = fetcher()
    .then((token) => {
      csrfToken = token
      return token
    })
    .finally(() => {
      pendingCsrfToken = null
    })

  return pendingCsrfToken
}
```

Run the focused test and expect PASS.

- [ ] **Step 4: Write failing Axios/MSW transport tests**

Configure `src/shared/lib/testing/server.ts`:

```ts
import { setupServer } from 'msw/node'

import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

Create `src/shared/lib/testing/handlers.ts` with an empty default:

```ts
import type { RequestHandler } from 'msw'

export const handlers: RequestHandler[] = []
```

Extend `setup-tests.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Create `src/shared/api/client/axios-client.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/shared/lib/testing/server'

import { ApiProblemError } from './api-errors'
import { clearCsrfToken } from './csrf-token'
import { apiMutator } from './orval-mutator'

const apiOrigin = 'http://localhost:3000'

describe('credentialed Axios transport', () => {
  beforeEach(clearCsrfToken)

  it('sends credentials and exempts login from CSRF fetching', async () => {
    let csrfRequests = 0
    let credentials: RequestCredentials | undefined
    let csrfHeader: string | null = 'unexpected'

    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-from-endpoint' })
      }),
      http.post(`${apiOrigin}/v1/auth/login`, ({ request }) => {
        credentials = request.credentials
        csrfHeader = request.headers.get('X-CSRF-Token')
        return HttpResponse.json({
          csrfToken: 'A'.repeat(43),
          session: {
            publicId: 'AbCdEfGhIjKlMnOpQrStUv',
            absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
          },
        })
      }),
    )

    await apiMutator({
      url: '/v1/auth/login',
      method: 'POST',
      data: { email: 'admin@example.com', password: 'secret' },
    })

    expect(credentials).toBe('include')
    expect(csrfHeader).toBeNull()
    expect(csrfRequests).toBe(0)
  })

  it('fetches CSRF once and attaches JSON headers to unsafe requests', async () => {
    let csrfRequests = 0
    const csrfHeaders: Array<string | null> = []
    const contentTypes: Array<string | null> = []

    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-from-endpoint' })
      }),
      http.post(`${apiOrigin}/v1/auth/logout`, ({ request }) => {
        csrfHeaders.push(request.headers.get('X-CSRF-Token'))
        contentTypes.push(request.headers.get('Content-Type'))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await Promise.all([
      apiMutator<void>({ url: '/v1/auth/logout', method: 'POST' }),
      apiMutator<void>({ url: '/v1/auth/logout', method: 'POST' }),
    ])

    expect(csrfRequests).toBe(1)
    expect(csrfHeaders).toEqual(['csrf-from-endpoint', 'csrf-from-endpoint'])
    expect(contentTypes).toEqual([
      expect.stringContaining('application/json'),
      expect.stringContaining('application/json'),
    ])
  })

  it('does not fetch or attach CSRF for safe requests', async () => {
    let csrfRequests = 0
    let csrfHeader: string | null = 'unexpected'

    server.use(
      http.get(`${apiOrigin}/v1/auth/csrf`, () => {
        csrfRequests += 1
        return HttpResponse.json({ csrfToken: 'csrf-from-endpoint' })
      }),
      http.get(`${apiOrigin}/v1/auth/me`, ({ request }) => {
        csrfHeader = request.headers.get('X-CSRF-Token')
        return HttpResponse.json({
          userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
          normalizedEmail: 'admin@example.com',
          roleKeys: ['admin'],
          permissions: [],
        })
      }),
    )

    await apiMutator({ url: '/v1/auth/me', method: 'GET' })

    expect(csrfRequests).toBe(0)
    expect(csrfHeader).toBeNull()
  })

  it('throws the normalized problem instead of a raw Axios error', async () => {
    server.use(
      http.get(`${apiOrigin}/v1/auth/me`, () =>
        HttpResponse.json(
          {
            type: 'https://nest-js-starter.invalid/problems/dependency-unavailable',
            title: 'Dependency unavailable',
            status: 503,
            detail: 'Redis details must not reach the UI.',
            instance: 'urn:request:request-503',
            code: 'DEPENDENCY_UNAVAILABLE',
            requestId: 'request-503',
          },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    const failure = apiMutator({ url: '/v1/auth/me', method: 'GET' })

    await expect(failure).rejects.toBeInstanceOf(ApiProblemError)
    await expect(failure).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      requestId: 'request-503',
    })
  })
})
```

- [ ] **Step 5: Run transport tests and observe the missing client**

Run:

```bash
pnpm test -- src/shared/api/client/axios-client.test.ts
```

Expected: FAIL because the Axios transport does not exist.

- [ ] **Step 6: Implement the isolated credentialed clients**

Create `src/shared/api/client/axios-client.ts`:

```ts
import axios from 'axios'
import { z } from 'zod'

import { publicEnv } from '@/shared/config'

import { getOrFetchCsrfToken } from './csrf-token'

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const csrfResponseSchema = z.object({ csrfToken: z.string().min(1) })

const clientDefaults = {
  baseURL: publicEnv.VITE_API_BASE_URL,
  withCredentials: true,
}

export const API_AXIOS_INSTANCE = axios.create(clientDefaults)
const csrfAxios = axios.create(clientDefaults)

function isLoginRequest(url: string | undefined) {
  return url === '/v1/auth/login'
}

async function fetchCsrfToken() {
  const response = await csrfAxios.get<unknown>('/v1/auth/csrf')
  return csrfResponseSchema.parse(response.data).csrfToken
}

API_AXIOS_INSTANCE.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase() ?? 'GET'
  if (!unsafeMethods.has(method)) return config

  config.headers.set('Content-Type', 'application/json')
  if (isLoginRequest(config.url)) return config

  config.headers.set('X-CSRF-Token', await getOrFetchCsrfToken(fetchCsrfToken))
  return config
})
```

The internal `csrfAxios` must not be exported and must not receive the unsafe
request interceptor.

- [ ] **Step 7: Implement the Orval mutator without erasing error generics**

Create `src/shared/api/client/orval-mutator.ts`:

```ts
import type { AxiosRequestConfig } from 'axios'

import {
  type ApiClientError,
  type ProblemDocumentLike,
  normalizeApiError,
} from './api-errors'
import { API_AXIOS_INSTANCE } from './axios-client'

export type ErrorType<ErrorData> = ApiClientError<
  ErrorData & ProblemDocumentLike
>

export type BodyType<BodyData> = BodyData

export async function apiMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await API_AXIOS_INSTANCE.request<T>({
      ...config,
      ...options,
      headers: {
        ...config.headers,
        ...options?.headers,
      },
    })
    return response.data
  } catch (error) {
    throw normalizeApiError(error)
  }
}
```

- [ ] **Step 8: Verify transport behavior and no persistent storage use**

Run:

```bash
pnpm test -- src/shared/api/client/csrf-token.test.ts src/shared/api/client/axios-client.test.ts
rg -n "localStorage|sessionStorage|indexedDB|Authorization|refresh" src/shared/api
```

Expected: all tests pass; the search returns no authentication persistence,
Bearer header, or refresh behavior.

- [ ] **Step 9: Export only handwritten transport primitives and commit**

Extend `src/shared/api/index.ts`:

```ts
export {
  clearCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from './client/csrf-token'
```

Commit:

```bash
git add src/shared/api src/shared/lib/testing
git commit -m "feat(auth): add credentialed CSRF transport"
```

### Task 5: Orval React Query, Axios, and Zod generation

**Files:**

- Create: `orval.config.ts`
- Generate: `src/shared/api/generated/**`
- Generate: `src/shared/api/generated-zod/**`
- Modify: `src/shared/api/client/api-errors.ts`
- Modify: `src/shared/api/index.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces generated operations `authLogin`, `authGetMe`,
  `authGetCsrfToken`, and `authLogout`.
- Produces generated helpers `getAuthGetMeQueryKey`,
  `getAuthGetMeQueryOptions`, and auth mutation options/hooks.
- Produces generated TypeScript models `LoginRequestDto`,
  `LoginResponseDto`, `CurrentUserResponseDto`, and backend problem unions.
- Produces `ProblemCode` from generated `ProblemResponseDto['code']`.
- Produces Zod operation schema `AuthLoginBody`.
- Produces curated handwritten exports from `shared/api`; upper layers do not
  reach into generated directory internals.
- Consumes: `openapi/openapi.json` and `apiMutator`.

- [ ] **Step 1: Write the final Orval configuration**

Create `orval.config.ts`:

```ts
import { defineConfig } from 'orval'

const openApiSnapshot = './openapi/openapi.json'

export default defineConfig({
  api: {
    input: {
      target: openApiSnapshot,
    },
    output: {
      target: './src/shared/api/generated/index.ts',
      schemas: './src/shared/api/generated/model',
      operationSchemas: './src/shared/api/generated/operation',
      client: 'react-query',
      httpClient: 'axios',
      mode: 'tags-split',
      clean: true,
      urlEncodeParameters: true,
      override: {
        mutator: {
          path: './src/shared/api/client/orval-mutator.ts',
          name: 'apiMutator',
        },
        useNamedParameters: true,
        useTypeOverInterfaces: true,
        enumGenerationType: 'union',
        query: {
          version: 5,
          signal: true,
          useQuery: true,
          useMutation: true,
        },
      },
    },
  },
  apiZod: {
    input: {
      target: openApiSnapshot,
    },
    output: {
      target: './src/shared/api/generated-zod/index.ts',
      client: 'zod',
      mode: 'tags-split',
      fileExtension: '.zod.ts',
      clean: true,
      override: {
        zod: {
          version: 4,
          strict: {
            response: true,
            body: true,
            query: true,
            param: true,
            header: true,
          },
          generate: {
            response: true,
            body: true,
            query: true,
            param: true,
            header: true,
          },
          generateEachHttpStatus: true,
        },
      },
    },
  },
})
```

- [ ] **Step 2: Add reproducible generation commands**

Add:

```json
{
  "scripts": {
    "api:generate": "orval && prettier --write src/shared/api/generated src/shared/api/generated-zod",
    "api:update": "pnpm api:sync && pnpm api:generate",
    "api:check": "pnpm api:generate && git diff --exit-code -- openapi/openapi.json src/shared/api/generated src/shared/api/generated-zod"
  }
}
```

- [ ] **Step 3: Generate from the committed snapshot**

Run:

```bash
pnpm api:generate
```

Expected:

```text
src/shared/api/generated/auth/auth.ts
src/shared/api/generated/model/loginRequestDto.ts
src/shared/api/generated/model/loginResponseDto.ts
src/shared/api/generated/model/currentUserResponseDto.ts
src/shared/api/generated-zod/auth/auth.zod.ts
```

Verify exact exports:

```bash
rg -n "export const (authLogin|authGetMe|authGetCsrfToken|authLogout|getAuthGetMeQueryKey|getAuthGetMeQueryOptions|AuthLoginBody)" src/shared/api/generated src/shared/api/generated-zod
```

Expected: every named export is present. If Orval changes only the generated
case convention in a newer stable release, update the handwritten imports in
Tasks 6–9 to the actual generated names while retaining the four backend
`operationId` values unchanged.

- [ ] **Step 4: Bind problem-code typing to the generated backend model**

Add to `src/shared/api/client/api-errors.ts`:

```ts
import type { ProblemResponseDto } from '../generated/model'

export type ProblemCode = ProblemResponseDto['code']
```

Replace the string parameter of `isProblemCode` with the generated union:

```ts
export function isProblemCode<TCode extends ProblemCode>(
  error: unknown,
  code: TCode,
): error is ApiProblemError<ProblemDocumentLike & { code: TCode }> {
  return error instanceof ApiProblemError && error.code === code
}
```

Export `ProblemCode` from `src/shared/api/index.ts`:

```ts
export type { ProblemCode } from './client/api-errors'
```

Also add the generated operations, models, and Zod schema that handwritten
upper-layer adapters are allowed to consume:

```ts
export {
  authGetCsrfToken,
  authGetMe,
  authLogin,
  authLogout,
  getAuthGetMeQueryKey,
  getAuthGetMeQueryOptions,
} from './generated/auth/auth'
export type {
  CurrentUserResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  ProblemResponseDto,
  ValidationProblemResponseDto,
} from './generated/model'
export { AuthLoginBody as authLoginSchema } from './generated-zod/auth/auth.zod'
```

Run:

```bash
pnpm exec tsc -b
```

Expected: PASS. The frontend contains no handwritten union of backend problem
codes.

- [ ] **Step 5: Prove the generated error union reaches the mutator**

Inspect the generated `auth.ts` and verify its auth helpers use:

```ts
ErrorType<ProblemResponseDto | ValidationProblemResponseDto>
```

The generated code must not collapse operation failures into `ErrorType<unknown>`
or a non-generic `ApiClientError`.

- [ ] **Step 6: Prove generation is deterministic**

Run:

```bash
pnpm api:check
```

Expected: exit `0` with an empty generated diff.

- [ ] **Step 7: Commit the generator and output**

```bash
git add orval.config.ts package.json pnpm-lock.yaml src/shared/api/client/api-errors.ts src/shared/api/index.ts src/shared/api/generated src/shared/api/generated-zod
git commit -m "build(api): generate OpenAPI clients"
```

### Task 6: Query provider and session entity

**Files:**

- Create: `src/app/providers/query-client.ts`
- Create: `src/app/providers/query-client.test.ts`
- Create: `src/app/providers/app-provider.tsx`
- Create: `src/entities/session/api/session.ts`
- Create: `src/entities/session/model/session-cache.ts`
- Create: `src/entities/session/index.ts`

**Interfaces:**

- Produces: `shouldRetryQuery(failureCount, error): boolean`.
- Produces: singleton `queryClient`.
- Produces: `AppProvider`.
- Produces: `currentSessionQueryOptions()`, `currentSessionQueryKey()`,
  `useCurrentSession()`, `refreshCurrentSession(queryClient)`, and
  `clearCurrentSession(queryClient)`.
- Consumes: generated `/v1/auth/me` query helpers and the in-memory CSRF state.

- [ ] **Step 1: Write failing retry-policy tests**

Create `src/app/providers/query-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

import { shouldRetryQuery } from './query-client'

const problem = (status: number, code: string) =>
  new ApiProblemError(
    {
      type: 'https://example.test/problem',
      title: 'Problem',
      status,
      detail: 'Problem',
      instance: 'urn:request:1',
      code,
      requestId: '1',
    },
    null,
  )

describe('query retry policy', () => {
  it('never retries 4xx problem responses or protocol failures', () => {
    expect(shouldRetryQuery(0, problem(401, 'AUTHENTICATION_REQUIRED'))).toBe(
      false,
    )
    expect(shouldRetryQuery(0, new ApiProtocolError())).toBe(false)
  })

  it('retries network and 5xx failures at most twice', () => {
    expect(shouldRetryQuery(0, new ApiNetworkError())).toBe(true)
    expect(shouldRetryQuery(1, problem(503, 'DEPENDENCY_UNAVAILABLE'))).toBe(
      true,
    )
    expect(shouldRetryQuery(2, new ApiNetworkError())).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and observe the missing query client**

Run:

```bash
pnpm test -- src/app/providers/query-client.test.ts
```

Expected: FAIL because `query-client.ts` does not exist.

- [ ] **Step 3: Implement Query Client defaults**

Create `src/app/providers/query-client.ts`:

```ts
import { QueryClient } from '@tanstack/react-query'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2 || error instanceof ApiProtocolError) return false
  if (error instanceof ApiNetworkError) return true
  return error instanceof ApiProblemError && error.status >= 500
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
```

Create `src/app/providers/app-provider.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { queryClient } from './query-client'

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

- [ ] **Step 4: Implement the session entity adapter**

Create `src/entities/session/api/session.ts`:

```ts
import { getAuthGetMeQueryKey, getAuthGetMeQueryOptions } from '@/shared/api'
import { useSuspenseQuery } from '@tanstack/react-query'

export const currentSessionQueryKey = getAuthGetMeQueryKey
export const currentSessionQueryOptions = getAuthGetMeQueryOptions

export function useCurrentSession() {
  return useSuspenseQuery(currentSessionQueryOptions())
}
```

Create `src/entities/session/model/session-cache.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query'

import { clearCsrfToken } from '@/shared/api'

import {
  currentSessionQueryKey,
  currentSessionQueryOptions,
} from '../api/session'

export async function refreshCurrentSession(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: currentSessionQueryKey() })
  return queryClient.fetchQuery(currentSessionQueryOptions())
}

export function clearCurrentSession(queryClient: QueryClient) {
  clearCsrfToken()
  queryClient.removeQueries({ queryKey: currentSessionQueryKey() })
}
```

Create `src/entities/session/index.ts`:

```ts
export {
  currentSessionQueryKey,
  currentSessionQueryOptions,
  useCurrentSession,
} from './api/session'
export {
  clearCurrentSession,
  refreshCurrentSession,
} from './model/session-cache'
export type { CurrentUserResponseDto } from '@/shared/api'
```

- [ ] **Step 5: Verify the provider and public API**

Run:

```bash
pnpm test -- src/app/providers/query-client.test.ts
pnpm exec tsc -b
```

Expected: PASS. Search the UI directories and confirm there are still no
generated-hook imports:

```bash
rg -n "shared/api/generated" src/pages src/features --glob "*.tsx"
```

Expected: no matches.

- [ ] **Step 6: Commit providers and the session entity**

```bash
git add src/app/providers src/entities/session
git commit -m "feat(session): add query-backed session model"
```

### Task 7: Data Router, protected route, and safe route errors

**Files:**

- Create: `src/shared/routes/return-to.ts`
- Create: `src/shared/routes/return-to.test.ts`
- Create: `src/shared/routes/index.ts`
- Create: `src/app/router/loaders.ts`
- Create: `src/app/router/loaders.test.ts`
- Create: `src/app/router/route-error.tsx`
- Create: `src/app/router/route-error.test.tsx`
- Create: `src/app/router/router.tsx`
- Create: `src/pages/dashboard/ui/dashboard-page.tsx`
- Create: `src/pages/dashboard/index.ts`
- Create: `src/pages/login/ui/login-page.tsx`
- Create: `src/pages/login/index.ts`
- Create: `src/shared/ui/error-message.tsx`
- Create: `src/shared/ui/index.ts`

**Interfaces:**

- Produces: `sanitizeReturnTo(value): string`.
- Produces: `createRequireSessionLoader(dependencies)` and
  `createRedirectAuthenticatedLoader(dependencies)`.
- Produces: `RouteError`.
- Produces: `router`.
- Produces: temporary page shells that Tasks 8 and 9 complete.
- Consumes: session query options, query cache clearing, and stable problem
  codes.

- [ ] **Step 1: Write failing return-target tests**

Create `src/shared/routes/return-to.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { sanitizeReturnTo } from './return-to'

describe('sanitizeReturnTo', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['https://evil.test/path', '/'],
    ['//evil.test/path', '/'],
    ['/login', '/'],
    ['/settings?tab=profile#name', '/settings?tab=profile#name'],
  ])('maps %s to %s', (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected)
  })
})
```

Create `src/app/router/loaders.test.ts` with injected loader dependencies:

```ts
import { describe, expect, it, vi } from 'vitest'

import { ApiNetworkError, ApiProblemError } from '@/shared/api'

import { createRequireSessionLoader } from './loaders'

const request = new Request('http://localhost/private?tab=1')

describe('protected route loader', () => {
  it('redirects only AUTHENTICATION_REQUIRED and clears auth memory', async () => {
    const clear = vi.fn()
    const load = vi.fn().mockRejectedValue(
      new ApiProblemError(
        {
          type: 'https://example.test/problem',
          title: 'Authentication required',
          status: 401,
          detail: 'Authentication required',
          instance: 'urn:request:1',
          code: 'AUTHENTICATION_REQUIRED',
          requestId: '1',
        },
        null,
      ),
    )
    const loader = createRequireSessionLoader({ load, clear })

    const response = await Promise.resolve(
      loader({
        request,
        params: {},
        context: undefined,
      }),
    ).catch((error: unknown) => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
    expect((response as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fprivate%3Ftab%3D1',
    )
    expect(clear).toHaveBeenCalledOnce()
  })

  it.each([
    new ApiNetworkError(),
    new ApiProblemError(
      {
        type: 'https://example.test/problem',
        title: 'Forbidden',
        status: 403,
        detail: 'Forbidden',
        instance: 'urn:request:3',
        code: 'AUTHORIZATION_DENIED',
        requestId: '3',
      },
      null,
    ),
    new ApiProblemError(
      {
        type: 'https://example.test/problem',
        title: 'Unavailable',
        status: 503,
        detail: 'Unavailable',
        instance: 'urn:request:2',
        code: 'DEPENDENCY_UNAVAILABLE',
        requestId: '2',
      },
      null,
    ),
  ])('rethrows a non-authentication failure', async (error) => {
    const clear = vi.fn()
    const loader = createRequireSessionLoader({
      load: vi.fn().mockRejectedValue(error),
      clear,
    })

    await expect(
      loader({ request, params: {}, context: undefined }),
    ).rejects.toBe(error)
    expect(clear).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run route utility tests and observe missing modules**

Run:

```bash
pnpm test -- src/shared/routes/return-to.test.ts src/app/router/loaders.test.ts
```

Expected: FAIL because the route utilities do not exist.

- [ ] **Step 3: Implement return-target sanitization**

Create `src/shared/routes/return-to.ts`:

```ts
export function sanitizeReturnTo(value: string | null | undefined) {
  if (value === undefined || value === null || !value.startsWith('/'))
    return '/'
  if (value.startsWith('//')) return '/'

  const target = new URL(value, 'http://local.invalid')
  const normalized = `${target.pathname}${target.search}${target.hash}`
  return target.pathname === '/login' ? '/' : normalized
}
```

Export it from `src/shared/routes/index.ts`.

- [ ] **Step 4: Implement loader factories with the 401-only redirect rule**

Create `src/app/router/loaders.ts`:

```ts
import type { LoaderFunction } from 'react-router'
import { redirect } from 'react-router'

import { isProblemCode } from '@/shared/api'

type SessionLoaderDependencies = {
  load: () => Promise<unknown>
  clear: () => void
}

export function createRequireSessionLoader({
  load,
  clear,
}: SessionLoaderDependencies): LoaderFunction {
  return async ({ request }) => {
    try {
      await load()
      return null
    } catch (error) {
      if (!isProblemCode(error, 'AUTHENTICATION_REQUIRED')) throw error
      clear()
      const url = new URL(request.url)
      const returnTo = `${url.pathname}${url.search}${url.hash}`
      throw redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    }
  }
}

export function createRedirectAuthenticatedLoader({
  load,
}: Pick<SessionLoaderDependencies, 'load'>): LoaderFunction {
  return async () => {
    let authenticated = false
    try {
      await load()
      authenticated = true
    } catch (error) {
      if (!isProblemCode(error, 'AUTHENTICATION_REQUIRED')) throw error
    }
    return authenticated ? redirect('/') : null
  }
}
```

- [ ] **Step 5: Implement safe route-level error rendering**

Create `src/shared/ui/error-message.tsx`:

```tsx
import type { ReactNode } from 'react'

type ErrorMessageProps = {
  children: ReactNode
  id?: string
}

export function ErrorMessage({ children, id }: ErrorMessageProps) {
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-red-700">
      {children}
    </p>
  )
}
```

Export it through `src/shared/ui/index.ts` and reuse it in route and form error
states.

Create `src/app/router/route-error.tsx`:

```tsx
import { useEffect } from 'react'
import {
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteError,
} from 'react-router'

import { clearCurrentSession } from '@/entities/session'
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  isProblemCode,
} from '@/shared/api'
import { ErrorMessage } from '@/shared/ui'

import { queryClient } from '../providers/query-client'

type ErrorPresentation = {
  message: string
  requestId?: string
  retryable: boolean
}

export function getRouteErrorPresentation(error: unknown): ErrorPresentation {
  if (error instanceof ApiNetworkError) {
    return {
      message: 'Не удалось подключиться к серверу.',
      retryable: true,
    }
  }
  if (error instanceof ApiProtocolError) {
    return {
      message: 'Сервер вернул некорректный ответ.',
      retryable: false,
    }
  }
  if (error instanceof ApiProblemError) {
    switch (error.code) {
      case 'AUTHORIZATION_DENIED':
        return { message: 'Недостаточно прав', retryable: false }
      case 'RATE_LIMIT_EXCEEDED':
        return {
          message: 'Слишком много запросов. Повторите попытку позже.',
          retryable: false,
        }
      case 'DEPENDENCY_UNAVAILABLE':
        return {
          message: 'Сервис временно недоступен.',
          retryable: true,
        }
      case 'INTERNAL_ERROR':
        return {
          message: 'Не удалось выполнить запрос.',
          requestId: error.requestId,
          retryable: true,
        }
    }
  }
  return {
    message: 'Произошла непредвиденная ошибка.',
    retryable: false,
  }
}

function AuthenticationRedirect() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    clearCurrentSession(queryClient)
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, {
      replace: true,
    })
  }, [location.hash, location.pathname, location.search, navigate])

  return <p>Перенаправляем на страницу входа…</p>
}

export function RouteError() {
  const error = useRouteError()
  const revalidator = useRevalidator()

  if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
    return <AuthenticationRedirect />
  }

  const presentation = getRouteErrorPresentation(error)
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="max-w-md text-center">
        <ErrorMessage>{presentation.message}</ErrorMessage>
        {presentation.requestId ? (
          <p className="mt-2 text-sm text-zinc-600">
            Код запроса: {presentation.requestId}
          </p>
        ) : null}
        {presentation.retryable ? (
          <button
            type="button"
            onClick={() => revalidator.revalidate()}
            className="mt-4 rounded-md border border-zinc-300 px-3 py-2"
          >
            Повторить
          </button>
        ) : null}
      </section>
    </main>
  )
}
```

This closes the background-refetch case without putting navigation into the
Axios interceptor. Raw response bodies, `detail`, stack traces, and
infrastructure data are never rendered.

Create `src/app/router/route-error.test.tsx`. Test the pure presentation mapper
with this table:

```ts
it.each([
  [
    new ApiNetworkError(),
    {
      message: 'Не удалось подключиться к серверу.',
      retryable: true,
    },
  ],
  [
    new ApiProtocolError(),
    {
      message: 'Сервер вернул некорректный ответ.',
      retryable: false,
    },
  ],
  [
    problem(403, 'AUTHORIZATION_DENIED', 'request-403'),
    { message: 'Недостаточно прав', retryable: false },
  ],
  [
    problem(503, 'DEPENDENCY_UNAVAILABLE', 'request-503'),
    { message: 'Сервис временно недоступен.', retryable: true },
  ],
  [
    problem(500, 'INTERNAL_ERROR', 'request-500'),
    {
      message: 'Не удалось выполнить запрос.',
      requestId: 'request-500',
      retryable: true,
    },
  ],
])('maps route errors without raw backend detail', (error, expected) => {
  expect(getRouteErrorPresentation(error)).toEqual(expected)
  expect(JSON.stringify(getRouteErrorPresentation(error))).not.toContain(
    'Raw backend detail',
  )
})
```

Use this helper in the test:

```ts
function problem(status: number, code: string, requestId: string) {
  return new ApiProblemError(
    {
      type: 'https://example.test/problem',
      title: 'Text not used',
      status,
      detail: 'Raw backend detail',
      instance: `urn:request:${requestId}`,
      code,
      requestId,
    },
    null,
  )
}
```

Add one memory-router test whose `/` loader throws
`problem(401, 'AUTHENTICATION_REQUIRED', 'request-401')`. Seed the singleton
`queryClient` at `currentSessionQueryKey()`, seed CSRF memory, render
`RouteError` as `errorElement`, and define `/login` as `<p>Login route</p>`.
After `findByText('Login route')`, assert:

```ts
expect(router.state.location.pathname).toBe('/login')
expect(peekCsrfToken()).toBeNull()
expect(queryClient.getQueryData(currentSessionQueryKey())).toBeUndefined()
```

- [ ] **Step 6: Compose the Data Router**

Create `src/app/router/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router'

import { clearCurrentSession, currentSessionQueryKey } from '@/entities/session'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'
import { authGetMe } from '@/shared/api'

import { queryClient } from '../config/query-client'
import {
  createRedirectAuthenticatedLoader,
  createRequireSessionLoader,
} from './loaders'
import { RouteError } from './route-error'

async function loadSession(signal: AbortSignal) {
  const session = await authGetMe(undefined, signal)
  if (signal.aborted) {
    throw new DOMException('The session request was aborted', 'AbortError')
  }
  queryClient.setQueryData(currentSessionQueryKey(), session)
  return session
}

export const router = createBrowserRouter([
  {
    path: '/',
    loader: createRequireSessionLoader({
      load: loadSession,
      clear: () => clearCurrentSession(queryClient),
    }),
    element: <DashboardPage />,
    errorElement: <RouteError />,
  },
  {
    path: '/login',
    loader: createRedirectAuthenticatedLoader({ load: loadSession }),
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
])
```

The page imports will become valid in Tasks 8 and 9. Keep this task uncommitted
until temporary page shells exist:

```tsx
export function DashboardPage() {
  return null
}
```

```tsx
export function LoginPage() {
  return <main>Вход</main>
}
```

Export each shell through its slice `index.ts`.

- [ ] **Step 7: Run routing behavior tests**

Run:

```bash
pnpm test -- src/shared/routes/return-to.test.ts src/app/router/loaders.test.ts src/app/router/route-error.test.tsx
pnpm exec tsc -b
```

Expected: PASS. The 401 test redirects to an encoded internal target; 403,
503, network, and protocol errors remain route errors.

- [ ] **Step 8: Commit the router boundary**

```bash
git add src/app/router src/shared/routes src/shared/ui src/pages/dashboard src/pages/login
git commit -m "feat(router): protect authenticated routes"
```

### Task 8: Login feature and page

**Files:**

- Create: `src/features/auth-login/model/login-errors.ts`
- Create: `src/features/auth-login/model/login-errors.test.ts`
- Create: `src/features/auth-login/model/use-login.ts`
- Create: `src/features/auth-login/ui/login-form.tsx`
- Create: `src/features/auth-login/ui/login-form.test.tsx`
- Create: `src/features/auth-login/index.ts`
- Modify: `src/pages/login/ui/login-page.tsx`
- Modify: `src/pages/login/index.ts`

**Interfaces:**

- Produces: `mapLoginValidationErrors(problem): Partial<Record<LoginField, string>>`.
- Produces: `useLogin(returnTo)`.
- Produces: `LoginForm`.
- Consumes: generated `authLoginSchema`, `authLogin`, generated
  request/response types, `setCsrfToken`, and `sanitizeReturnTo`.

- [ ] **Step 1: Write failing validation-pointer mapping tests**

Create `src/features/auth-login/model/login-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

import { getLoginFormError, mapLoginValidationErrors } from './login-errors'

describe('mapLoginValidationErrors', () => {
  it('maps only known RFC 6901 login pointers', () => {
    expect(
      mapLoginValidationErrors({
        errors: [
          { pointer: '/email', code: 'invalid_email', detail: 'Email invalid' },
          {
            pointer: '/password',
            code: 'too_short',
            detail: 'Password invalid',
          },
          { pointer: '/role', code: 'forbidden', detail: 'Must be ignored' },
        ],
      }),
    ).toEqual({
      email: 'Email invalid',
      password: 'Password invalid',
    })
  })

  it.each([
    [new ApiNetworkError(), 'Не удалось подключиться к серверу.'],
    [new ApiProtocolError(), 'Сервер вернул некорректный ответ.'],
    [
      new ApiProblemError(
        {
          type: 'https://example.test/problem',
          title: 'Rate limited',
          status: 429,
          detail: 'Do not render this text',
          instance: 'urn:request:429',
          code: 'RATE_LIMIT_EXCEEDED',
          requestId: '429',
        },
        10_000,
      ),
      'Слишком много запросов. Повторите попытку позже.',
    ],
  ])('maps a transport error to safe form copy', (error, expected) => {
    expect(getLoginFormError(error)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run the mapping test and observe the missing function**

Run:

```bash
pnpm test -- src/features/auth-login/model/login-errors.test.ts
```

Expected: FAIL because `login-errors.ts` does not exist.

- [ ] **Step 3: Implement the allowlisted pointer mapper**

Create `src/features/auth-login/model/login-errors.ts`:

```ts
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

export type LoginField = 'email' | 'password'

type ValidationProblem = {
  errors?: ReadonlyArray<{
    pointer: string
    detail: string
  }>
}

const fieldByPointer: Readonly<Record<string, LoginField>> = {
  '/email': 'email',
  '/password': 'password',
}

export function mapLoginValidationErrors(problem: ValidationProblem) {
  const result: Partial<Record<LoginField, string>> = {}
  for (const error of problem.errors ?? []) {
    const field = fieldByPointer[error.pointer]
    if (field !== undefined && result[field] === undefined) {
      result[field] = error.detail
    }
  }
  return result
}

export function getLoginFormError(error: unknown) {
  if (
    error instanceof ApiProblemError &&
    error.code === 'AUTHENTICATION_REQUIRED'
  ) {
    return 'Неверный email или пароль'
  }
  if (
    error instanceof ApiProblemError &&
    error.code === 'RATE_LIMIT_EXCEEDED'
  ) {
    return 'Слишком много запросов. Повторите попытку позже.'
  }
  if (
    error instanceof ApiProblemError &&
    error.code === 'DEPENDENCY_UNAVAILABLE'
  ) {
    return 'Сервис временно недоступен.'
  }
  if (error instanceof ApiNetworkError) {
    return 'Не удалось подключиться к серверу.'
  }
  if (error instanceof ApiProtocolError) {
    return 'Сервер вернул некорректный ответ.'
  }
  if (error instanceof ApiProblemError) {
    return `Не удалось выполнить вход. Код запроса: ${error.requestId}`
  }
  return 'Не удалось выполнить вход.'
}
```

- [ ] **Step 4: Write the login interaction test before the hook and form**

Create `src/features/auth-login/ui/login-form.test.tsx`:

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import {
  createMemoryRouter,
  RouterProvider,
} from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearCsrfToken,
  peekCsrfToken,
} from '@/shared/api'
import { server } from '@/shared/lib/testing/server'

import { LoginForm } from './login-form'

const apiOrigin = 'http://localhost:3000'
const loginResponse = {
  csrfToken: 'A'.repeat(43),
  session: {
    publicId: 'AbCdEfGhIjKlMnOpQrStUv',
    absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
  },
}

const currentUser = {
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
  normalizedEmail: 'admin@example.com',
  roleKeys: ['admin'],
  permissions: ['system.docs.read'],
}

function renderLogin(returnTo = '/private') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <LoginForm returnTo={returnTo} />,
      },
      {
        path: '/private',
        element: <p>Private route</p>,
      },
    ],
    { initialEntries: ['/login'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

async function fillValidCredentials() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'admin@example.com')
  await user.type(screen.getByLabelText('Пароль'), 'correct password')
  return user
}

function problem(
  status: number,
  code: string,
  errors?: Array<{ pointer: string; code: string; detail: string }>,
) {
  return HttpResponse.json(
    {
      type: `https://example.test/problems/${code.toLowerCase()}`,
      title: 'Text not used for behavior',
      status,
      detail: 'Raw detail must stay hidden',
      instance: `urn:request:${status}`,
      code,
      requestId: String(status),
      ...(errors === undefined ? {} : { errors }),
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  )
}

describe('LoginForm', () => {
  beforeEach(clearCsrfToken)

  it('rejects an invalid email through the generated schema without HTTP', async () => {
    let loginRequests = 0
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () => {
        loginRequests += 1
        return HttpResponse.json(loginResponse)
      }),
    )
    renderLogin()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Пароль'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(loginRequests).toBe(0)
  })

  it('maps only backend login validation pointers to fields', async () => {
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () =>
        problem(422, 'VALIDATION_FAILED', [
          { pointer: '/email', code: 'invalid_email', detail: 'Email invalid' },
          {
            pointer: '/password',
            code: 'invalid_password',
            detail: 'Password invalid',
          },
          { pointer: '/role', code: 'ignored', detail: 'Must stay hidden' },
        ]),
      ),
    )
    renderLogin()
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Email invalid')).toBeVisible()
    expect(screen.getByText('Password invalid')).toBeVisible()
    expect(screen.queryByText('Must stay hidden')).not.toBeInTheDocument()
  })

  it.each([
    [401, 'AUTHENTICATION_REQUIRED', 'Неверный email или пароль'],
    [
      429,
      'RATE_LIMIT_EXCEEDED',
      'Слишком много запросов. Повторите попытку позже.',
    ],
  ])('renders safe form copy for %s', async (status, code, expected) => {
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () => problem(status, code)),
    )
    renderLogin()
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText(expected)).toBeVisible()
    expect(screen.queryByText('Raw detail must stay hidden')).not.toBeInTheDocument()
  })

  it('navigates after session creation when the following profile request is unavailable', async () => {
    let meRequests = 0
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, () =>
        HttpResponse.json(loginResponse),
      ),
      http.get(`${apiOrigin}/v1/auth/me`, () => {
        meRequests += 1
        return HttpResponse.json(
          { code: 'DEPENDENCY_UNAVAILABLE' },
          { status: 503 },
        )
      }),
    )
    const { router } = renderLogin('/private')
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Private route')).toBeVisible()
    expect(router.state.location.pathname).toBe('/private')
    expect(peekCsrfToken()).toBe(loginResponse.csrfToken)
    expect(meRequests).toBe(0)
  })

  it('disables submit while login is pending', async () => {
    let releaseLogin!: () => void
    const loginGate = new Promise<void>((resolve) => {
      releaseLogin = () => resolve()
    })
    server.use(
      http.post(`${apiOrigin}/v1/auth/login`, async () => {
        await loginGate
        return HttpResponse.json(loginResponse)
      }),
      http.get(`${apiOrigin}/v1/auth/me`, () => HttpResponse.json(currentUser)),
    )
    renderLogin()
    const user = await fillValidCredentials()

    await user.click(screen.getByRole('button', { name: 'Войти' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Входим…' })).toBeDisabled(),
    )
    releaseLogin()
    expect(await screen.findByText('Private route')).toBeVisible()
  })
})
```

- [ ] **Step 5: Run the login form test and observe missing UI**

Run:

```bash
pnpm test -- src/features/auth-login
```

Expected: FAIL because `use-login.ts` and `login-form.tsx` do not exist.

- [ ] **Step 6: Implement the login mutation adapter**

Create `src/features/auth-login/model/use-login.ts`:

```ts
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { authLogin, setCsrfToken, type LoginRequestDto } from '@/shared/api'
import { sanitizeReturnTo } from '@/shared/routes'

export function useLogin(returnTo: string | null) {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credentials: LoginRequestDto) => {
      const response = await authLogin(credentials)
      setCsrfToken(response.csrfToken)
      return response
    },
    onSuccess: () => {
      navigate(sanitizeReturnTo(returnTo), { replace: true })
    },
  })
}
```

Do not add a mutation retry or refresh-token fallback.

- [ ] **Step 7: Implement the accessible React Hook Form**

Create `src/features/auth-login/ui/login-form.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  ApiProblemError,
  authLoginSchema,
  type LoginRequestDto,
} from '@/shared/api'
import { ErrorMessage } from '@/shared/ui'

import {
  getLoginFormError,
  mapLoginValidationErrors,
} from '../model/login-errors'
import { useLogin } from '../model/use-login'

type LoginFormProps = {
  returnTo: string | null
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const login = useLogin(returnTo)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginRequestDto>({
    resolver: zodResolver(authLoginSchema),
  })

  const submit = handleSubmit(async (credentials) => {
    setFormError(null)
    try {
      await login.mutateAsync(credentials)
    } catch (error) {
      if (
        error instanceof ApiProblemError &&
        error.code === 'VALIDATION_FAILED'
      ) {
        const fieldErrors = mapLoginValidationErrors(error.problem)
        for (const [field, message] of Object.entries(fieldErrors)) {
          setError(field as keyof LoginRequestDto, {
            type: 'server',
            message,
          })
        }
        if (Object.keys(fieldErrors).length > 0) return
      }
      setFormError(getLoginFormError(error))
    }
  })

  return (
    <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          {...register('email')}
        />
        {errors.email?.message ? (
          <ErrorMessage id="email-error">{errors.email.message}</ErrorMessage>
        ) : null}
      </div>

      <div>
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password !== undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          {...register('password')}
        />
        {errors.password?.message ? (
          <ErrorMessage id="password-error">
            {errors.password.message}
          </ErrorMessage>
        ) : null}
      </div>

      {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}

      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-md bg-zinc-950 px-4 py-2 text-white disabled:opacity-50"
      >
        {login.isPending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  )
}
```

Never display backend `detail` outside the allowlisted field mapping.

- [ ] **Step 8: Compose the login page**

Replace the login shell with:

```tsx
import { useSearchParams } from 'react-router'

import { LoginForm } from '@/features/auth-login'

export function LoginPage() {
  const [searchParams] = useSearchParams()

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-950">Вход</h1>
        <LoginForm returnTo={searchParams.get('returnTo')} />
      </section>
    </main>
  )
}
```

Export `LoginForm` and `LoginPage` through their slice public APIs.

- [ ] **Step 9: Verify login behavior**

Run:

```bash
pnpm test -- src/features/auth-login src/shared/routes/return-to.test.ts
pnpm exec tsc -b
pnpm format:check
```

Expected: PASS and no generated hook import exists in the TSX file:

```bash
rg -n "shared/api/generated/.+useAuth" src/features/auth-login/ui src/pages/login
```

Expected: no matches.

- [ ] **Step 10: Commit the login slice**

```bash
git add src/features/auth-login src/pages/login
git commit -m "feat(auth): add login flow"
```

### Task 9: Logout and the protected empty dashboard

**Files:**

- Create: `src/features/auth-logout/model/use-logout.ts`
- Create: `src/features/auth-logout/ui/logout-button.tsx`
- Create: `src/features/auth-logout/ui/logout-button.test.tsx`
- Create: `src/features/auth-logout/index.ts`
- Modify: `src/pages/dashboard/ui/dashboard-page.tsx`
- Modify: `src/pages/dashboard/index.ts`
- Modify: `src/app/entrypoint/index.tsx`

**Interfaces:**

- Produces: `useLogout()` and `LogoutButton`.
- Produces: final `DashboardPage`.
- Consumes: generated `authLogout`, `clearCurrentSession`, current route loader
  data/cache, `AppProvider`, and `router`.

- [ ] **Step 1: Write the failing logout lifecycle test**

Create `src/features/auth-logout/ui/logout-button.test.tsx`:

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import {
  clearCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from '@/shared/api'
import { server } from '@/shared/lib/testing/server'

import { LogoutButton } from './logout-button'

const apiOrigin = 'http://localhost:3000'
const currentUser = {
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
  normalizedEmail: 'admin@example.com',
  roleKeys: ['admin'],
  permissions: [],
}

function renderLogout() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(currentSessionQueryKey(), currentUser)
  const router = createMemoryRouter(
    [
      { path: '/', element: <LogoutButton /> },
      { path: '/login', element: <p>Login route</p> },
    ],
    { initialEntries: ['/'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

describe('LogoutButton', () => {
  beforeEach(() => {
    clearCsrfToken()
    setCsrfToken('csrf-before-logout')
  })

  it('sends CSRF, clears local auth state, and replaces the route', async () => {
    let csrfHeader: string | null = null
    server.use(
      http.post(`${apiOrigin}/v1/auth/logout`, ({ request }) => {
        csrfHeader = request.headers.get('X-CSRF-Token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { queryClient, router } = renderLogout()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Login route')).toBeVisible()
    expect(csrfHeader).toBe('csrf-before-logout')
    expect(peekCsrfToken()).toBeNull()
    expect(queryClient.getQueryData(currentSessionQueryKey())).toBeUndefined()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('preserves the session and offers retry for a 503', async () => {
    server.use(
      http.post(`${apiOrigin}/v1/auth/logout`, () =>
        HttpResponse.json(
          {
            type: 'https://example.test/problems/dependency-unavailable',
            title: 'Dependency unavailable',
            status: 503,
            detail: 'Raw infrastructure detail',
            instance: 'urn:request:503',
            code: 'DEPENDENCY_UNAVAILABLE',
            requestId: '503',
          },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    const { queryClient, router } = renderLogout()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(
      await screen.findByText('Не удалось выйти. Повторите попытку.'),
    ).toBeVisible()
    expect(queryClient.getQueryData(currentSessionQueryKey())).toEqual(
      currentUser,
    )
    expect(peekCsrfToken()).toBe('csrf-before-logout')
    expect(router.state.location.pathname).toBe('/')
    expect(
      screen.queryByText('Raw infrastructure detail'),
    ).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and observe the missing logout feature**

Run:

```bash
pnpm test -- src/features/auth-logout
```

Expected: FAIL because the logout hook and button do not exist.

- [ ] **Step 3: Implement logout without refresh behavior**

Create `src/features/auth-logout/model/use-logout.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { clearCurrentSession } from '@/entities/session'
import { authLogout, isProblemCode } from '@/shared/api'

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => authLogout(),
    onSuccess: () => {
      clearCurrentSession(queryClient)
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
        clearCurrentSession(queryClient)
        navigate('/login', { replace: true })
      }
    },
  })
}
```

Create `src/features/auth-logout/ui/logout-button.tsx`:

```tsx
import { isProblemCode } from '@/shared/api'
import { ErrorMessage } from '@/shared/ui'

import { useLogout } from '../model/use-logout'

export function LogoutButton() {
  const logout = useLogout()
  const visibleFailure =
    logout.error !== null &&
    !isProblemCode(logout.error, 'AUTHENTICATION_REQUIRED')

  return (
    <div>
      <button
        type="button"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
        className="rounded-md border border-zinc-300 px-3 py-2 disabled:opacity-50"
      >
        {logout.isPending ? 'Выходим…' : 'Выйти'}
      </button>
      {visibleFailure ? (
        <ErrorMessage>Не удалось выйти. Повторите попытку.</ErrorMessage>
      ) : null}
    </div>
  )
}
```

Export it through `src/features/auth-logout/index.ts`. It must not clear the
cache or CSRF token before the backend confirms logout.

- [ ] **Step 4: Render only the required dashboard lifecycle controls**

The dashboard loader has already populated the session query. Call the
`useCurrentSession()` adapter exported by `entities/session`; the page must not
import generated options.

Replace `src/pages/dashboard/ui/dashboard-page.tsx` with:

```tsx
import { useCurrentSession } from '@/entities/session'
import { LogoutButton } from '@/features/auth-logout'

export function DashboardPage() {
  const { data: user } = useCurrentSession()

  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between">
        <span>{user.normalizedEmail}</span>
        <LogoutButton />
      </header>
    </main>
  )
}
```

Export `DashboardPage` through `src/pages/dashboard/index.ts`.

Do not add dashboard cards, navigation, charts, metrics, or sample
product-domain content.

- [ ] **Step 5: Replace the smoke entrypoint with providers and RouterProvider**

Replace `src/app/entrypoint/index.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { AppProvider } from '@/app/providers/app-provider'
import { router } from '@/app/router/router'
import '@/app/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
)
```

- [ ] **Step 6: Verify the complete session lifecycle**

Run:

```bash
pnpm test -- src/features/auth-logout src/features/auth-login src/app/router
pnpm exec tsc -b
pnpm build
```

Expected: PASS. Build output contains the `/login` and dashboard bundles and no
Tailwind at-rule warning.

- [ ] **Step 7: Commit logout and dashboard**

```bash
git add src/features/auth-logout src/pages/dashboard src/app/entrypoint
git commit -m "feat(auth): add logout lifecycle"
```

### Task 10: FSD enforcement, aggregate verification, CI, and cleanup

**Files:**

- Create: `steiger.config.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `eslint.config.js`
- Modify: `package.json`
- Modify: `README.md`
- Delete: `src/App.css`
- Delete: `src/App.tsx`
- Delete: `src/index.css`
- Delete: `src/assets/hero.png`
- Delete: `src/assets/react.svg`
- Delete: `src/assets/vite.svg`

**Interfaces:**

- Produces: `pnpm architecture`.
- Produces: ordered aggregate `pnpm check`.
- Produces: CI verification of frozen install, generated drift, formatting,
  lint, architecture, tests, and build.
- Consumes: every prior task.

- [ ] **Step 1: Configure the Query ESLint plugin and generated exclusions**

Update `eslint.config.js` so the TypeScript block extends:

```js
tanstackQuery.configs['flat/recommended']
```

and import:

```js
import tanstackQuery from '@tanstack/eslint-plugin-query'
```

Use:

```js
globalIgnores([
  'coverage',
  'dist',
  'src/shared/api/generated',
  'src/shared/api/generated-zod',
])
```

Do not disable React Hooks or TanStack Query recommended rules to make the
first run pass; fix violations at their source.

- [ ] **Step 2: Configure Steiger recommended FSD rules**

Create `steiger.config.ts`:

```ts
import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([...fsd.configs.recommended])
```

Add:

```json
{
  "scripts": {
    "architecture": "steiger ./src"
  }
}
```

Run:

```bash
pnpm architecture
```

Expected: PASS. Fix public API and layer-direction violations by changing
imports or slice exports. Do not globally disable `fsd/public-api` or
`fsd/forbidden-imports`.

- [ ] **Step 3: Add the ordered aggregate check**

Set:

```json
{
  "scripts": {
    "check": "pnpm api:check && pnpm format:check && pnpm lint && pnpm architecture && pnpm test && pnpm build"
  }
}
```

The order is part of the contract because generated drift must fail before
application verification.

- [ ] **Step 4: Add frozen CI verification**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [stage]
  push:
    branches: [stage]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      VITE_API_BASE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 11.15.1
          run_install: false
      - uses: actions/setup-node@v5
        with:
          node-version: 24.18.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
```

- [ ] **Step 5: Replace the Vite README with operator instructions**

Document:

```text
Requirements: Node 24.18.0, pnpm 11.15.1
Install: pnpm install --frozen-lockfile
Frontend: http://localhost:5173
Backend: http://localhost:3000
Backend requirement: CORS_ORIGINS contains http://localhost:5173
Environment: cp .env.example .env.local
Update contract: pnpm api:update
Check generated drift: pnpm api:check
Run all gates: pnpm check
Auth: opaque HttpOnly cookie and in-memory CSRF, no frontend token storage
```

State explicitly that `openapi/openapi.json` is a build-time committed snapshot,
not a browser asset, and generated directories are never edited manually.

- [ ] **Step 6: Delete demo assets and scan for forbidden behavior**

Delete the listed Vite demo files, then run:

```bash
rg -n "localStorage|sessionStorage|indexedDB|Bearer|refreshToken|/auth/refresh|admin-codex" src scripts README.md
rg -n "shared/api/generated" src/pages src/features --glob "*.tsx"
rg -n "title.*===|detail.*===" src
```

Expected:

- no auth token persistence, bearer token, refresh route, or copied admin code;
- no generated-hook imports in UI modules;
- no problem behavior driven by title/detail matching.

- [ ] **Step 7: Run the complete local gate from a clean generated state**

Run:

```bash
pnpm install --frozen-lockfile
pnpm api:generate
git status --short
pnpm check
git diff --check
```

Expected:

- frozen install succeeds;
- generation produces no diff;
- `pnpm check` exits `0`;
- no unresolved Tailwind directives appear;
- `git diff --check` exits `0`.

- [ ] **Step 8: Perform a real backend browser smoke**

Start `nest-js-starter` at `http://localhost:3000` with
`CORS_ORIGINS=http://localhost:5173` and its required local PostgreSQL/Redis
dependencies. Start the frontend:

```bash
pnpm dev
```

Verify in a real browser:

```text
anonymous / -> /login before dashboard content
valid login -> backend Set-Cookie accepted -> /
reload / -> GET /v1/auth/me restores current user
logout -> X-CSRF-Token sent -> /login
backend 503 on /v1/auth/me -> service error, not /login
```

Record browser smoke separately from automated local gates. If backend
infrastructure is unavailable, do not claim this smoke passed; report the exact
environment boundary while retaining the automated MSW evidence.

- [ ] **Step 9: Commit the completed starter foundation**

```bash
git add .github .env.example .nvmrc .prettierignore .prettierrc.json README.md eslint.config.js package.json pnpm-lock.yaml steiger.config.ts tsconfig.app.json vite.config.ts openapi orval.config.ts scripts src
git commit -m "chore: certify react starter foundation"
```

- [ ] **Step 10: Publish for review**

Run:

```bash
git push -u origin feat/react-starter-foundation
```

If the real-backend smoke passed, create the PR with:

```bash
gh pr create --base stage --head feat/react-starter-foundation --title "feat: build React starter foundation" --body $'## Summary\n- configure Tailwind, FSD boundaries, and the frontend toolchain\n- synchronize OpenAPI and generate Axios, TanStack Query, and Zod contracts\n- implement RFC 9457 errors and opaque-cookie login/session/CSRF logout\n\n## Verification\n- `pnpm check`: PASS\n- real-backend browser smoke: PASS for anonymous redirect, login, reload, logout, and 503 handling'
```

If backend infrastructure was unavailable, use:

```bash
gh pr create --base stage --head feat/react-starter-foundation --title "feat: build React starter foundation" --body $'## Summary\n- configure Tailwind, FSD boundaries, and the frontend toolchain\n- synchronize OpenAPI and generate Axios, TanStack Query, and Zod contracts\n- implement RFC 9457 errors and opaque-cookie login/session/CSRF logout\n\n## Verification\n- `pnpm check`: PASS\n- real-backend browser smoke: UNVERIFIED because the required local backend infrastructure was unavailable; auth behavior is covered by MSW tests'
```

Wait for CI and report local checks, remote CI, merge state, and browser smoke
as separate statuses. Do not merge unless the user explicitly authorizes merge
for the implementation task.

## Plan self-review

### Spec coverage

- Working existing libraries: Tasks 1, 6, 8, and 9.
- Tailwind Vite integration and class sorting: Task 1.
- React Router Data Mode, `/login`, protected `/`: Task 7.
- Minimal FSD and public APIs: file map plus Task 10.
- OpenAPI availability, synchronization, generated Axios/React Query/Zod:
  Tasks 2 and 5.
- Backend-defined opaque-cookie and CSRF authentication: Tasks 4, 6, 8, and 9.
- RFC 9457/network/protocol error behavior: Tasks 3, 7, and 8.
- Reproducible generation and CI drift protection: Tasks 5 and 10.
- Empty dashboard with lifecycle controls only: Task 9.
- Git bootstrap is already complete; implementation publication is Task 10.
- Deferred work remains excluded.

### Type consistency

- `ApiProblemError<TProblem>` retains the generated operation error body.
- The Axios mutator returns `Promise<T>` and preserves `ErrorType<ErrorData>`.
- The session entity is the only handwritten adapter around generated `/me`
  query options and keys.
- Login uses generated `LoginRequestDto` and the `authLoginSchema` alias of
  generated `AuthLoginBody`.
- CSRF token state is owned only by `shared/api/client/csrf-token.ts`.
- Route loaders receive injectable `load` and `clear` functions and redirect
  only on `AUTHENTICATION_REQUIRED`.

### Completion evidence

Implementation is complete only when:

```text
pnpm install --frozen-lockfile
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
git diff --check
```

all pass from the implementation branch and the real-backend browser smoke is
either freshly demonstrated or explicitly reported as environment-unverified.
