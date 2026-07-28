# React Starter Foundation Design

**Status:** approved in conversation on 2026-07-28  
**Backend source of truth:** `../nest-js-starter/docs/api/openapi.json`  
**Target repository:** private `DenisChernykh/react-starter`, default branch `stage`

## Context

`react-starter` is a fresh React 19 and Vite 8 application intended to be the
frontend foundation for projects backed by `nest-js-starter`.

The initial dependencies are installed but not assembled into a working
application foundation:

- Tailwind CSS 4 is imported, but `@tailwindcss/vite` is not registered, so the
  production build emits unresolved Tailwind at-rule warnings.
- TanStack Query, React Hook Form, Zod, and `@hookform/resolvers` are installed
  but unused.
- There is no router, application architecture, OpenAPI synchronization,
  generated API client, frontend error boundary, or authentication flow.
- The directory initially had no Git repository.

The backend already owns the browser-authentication and error contracts. The
frontend must consume those contracts rather than copy code or assumptions from
`admin-codex`.

## Goals

1. Establish a minimal Feature-Sliced Design structure with enforceable import
   boundaries.
2. Make every existing application dependency serve a real purpose.
3. Configure Tailwind CSS 4 for Vite and deterministic class sorting.
4. Use React Router Data Mode for a public `/login` route and protected `/`.
5. Synchronize the committed backend OpenAPI document into the frontend and
   generate types, request functions, TanStack Query helpers, and selected Zod
   schemas.
6. Implement browser authentication exactly as defined by `nest-js-starter`:
   opaque HttpOnly session cookie plus session-bound CSRF token.
7. Treat the backend RFC 9457 problem catalogue as the frontend error contract
   from the first iteration.
8. Add proportionate automated tests and one aggregate verification command.
9. Initialize Git and publish the approved design and plan to a private GitHub
   repository.

## Non-goals

- Do not copy authentication code, JWT refresh logic, error normalization, UI,
  or domain behavior from `admin-codex`.
- Do not add registration, password reset, OAuth, account administration, role
  editing, or product-domain entities.
- Do not implement backend endpoints or change backend source code.
- Do not expose the OpenAPI snapshot as a public browser asset.
- Do not introduce SSR, React Router Framework Mode, Redux, a UI kit, or a
  generic global state library.
- Do not deploy the application.

## Architecture decisions

### React Router Data Mode

The application remains a Vite SPA and uses `createBrowserRouter` with
`RouterProvider`.

Data Mode is preferred over:

- Declarative Mode, because authentication should redirect before protected UI
  renders and needs first-class pending/error behavior.
- Framework Mode, because the starter does not need SSR, route modules, or a
  second build convention on top of the existing Vite/FSD structure.

The router lives in `app/router`. Route loaders may use the shared
`QueryClient` and generated query options, while route components remain in
`pages`.

### Feature-Sliced Design

Only layers required by the first working slice are created:

```text
src/
├── app/
│   ├── entrypoint/
│   ├── providers/
│   ├── router/
│   └── styles/
├── pages/
│   ├── dashboard/
│   └── login/
├── features/
│   ├── auth-login/
│   └── auth-logout/
├── entities/
│   └── session/
└── shared/
    ├── api/
    ├── config/
    ├── routes/
    └── ui/
```

`widgets` is not created until a large reusable page block exists. Every slice
and shared segment exposes an explicit public API. Application code imports
through those public APIs rather than reaching into slice internals.

Steiger and its Feature-Sliced plugin are added as exact-pinned dev
dependencies. `pnpm architecture` checks the FSD import and public-API rules.
The exact pin limits churn while Steiger remains beta.

## OpenAPI synchronization and generation

### Source ownership

The backend document is authoritative:

```text
../nest-js-starter/docs/api/openapi.json
```

The frontend stores a committed snapshot:

```text
openapi/openapi.json
```

Generated files are never edited manually.

### Synchronization

`scripts/openapi/sync-openapi.mjs` accepts a local path, `file:` URL, or HTTP(S)
URL through `OPENAPI_SPEC_SOURCE`. Its local default is the sibling backend
document.

The sync operation:

1. reads the source without evaluating it;
2. rejects an empty document;
3. parses JSON and verifies an OpenAPI 3 document;
4. verifies that the required auth paths exist;
5. writes a normalized trailing newline to the committed frontend snapshot.

CI validates the committed snapshot and generated output without requiring
cross-repository credentials. Fetching the latest backend document is an
explicit developer operation.

### Generator and transport

Use current stable Orval 8 with:

- `client: "react-query"`;
- `httpClient: "axios"`;
- `mode: "tags-split"`;
- React Query v5;
- abort signals;
- named parameters;
- union enums;
- a custom Axios mutator;
- a second Zod output for request/response schemas.

The implementation must check the current stable versions against official
documentation at execution time and commit the resulting pnpm lockfile. The
locally observed `admin-codex` version must not be copied blindly.

Expected generated locations:

```text
src/shared/api/generated/
src/shared/api/generated-zod/
```

UI modules do not import generated hooks directly. `entities/session` adapts
generated operations into application-facing query options, hooks, and cache
operations.

Package scripts:

- `api:sync` — copy the authoritative document;
- `api:generate` — regenerate API and Zod output;
- `api:update` — sync, generate, and format;
- `api:check` — regenerate and fail on a generated diff.

## API transport and RFC 9457 errors

### Axios client

The single shared Axios instance:

- uses the validated `VITE_API_BASE_URL`;
- sends cookies with `withCredentials: true`;
- accepts only generated relative operation URLs;
- delegates request construction to Orval;
- normalizes errors at the transport boundary;
- does not implement JWT refresh or replay-after-refresh behavior.

### Error model

The backend returns `application/problem+json` with:

```ts
type ProblemDocument = {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  code: ProblemCode
  requestId: string
  errors?: Array<{
    pointer: string
    code: string
    detail: string
  }>
}
```

`ProblemCode` is derived from the generated OpenAPI model. The frontend does
not duplicate the backend catalogue.

The transport exposes:

- `ApiProblemError<TProblem>` for a valid RFC 9457 response;
- `ApiNetworkError` for connectivity failures;
- `ApiProtocolError` when an error response violates the declared media type or
  required problem shape.

`ApiProblemError` retains the HTTP status, generated problem body, stable code,
request ID, and parsed `Retry-After` value. Orval's custom mutator must preserve
the operation error union:

```ts
type ErrorType<ErrorData> = ApiProblemError<ErrorData>
```

It must not erase `ErrorData` to an unparameterized common error type.

Frontend behavior is driven by stable `code`, never by matching `title` or
`detail` text:

| Condition                 | First-iteration behavior                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `AUTHENTICATION_REQUIRED` | Clear in-memory auth state and redirect to `/login`.             |
| `AUTHORIZATION_DENIED`    | Render an access-denied state.                                   |
| `VALIDATION_FAILED`       | Map RFC 6901 pointers to React Hook Form field errors.           |
| `RATE_LIMIT_EXCEEDED`     | Render a rate-limit message and retain `Retry-After`.            |
| `DEPENDENCY_UNAVAILABLE`  | Render a retryable service-unavailable state.                    |
| `INTERNAL_ERROR`          | Render a safe generic message with `requestId`.                  |
| Network failure           | Render a retryable connectivity state.                           |
| Invalid problem response  | Render a protocol-error state without exposing raw payload data. |

A failed `/v1/auth/me` request redirects to login only for
`AUTHENTICATION_REQUIRED`. A `503`, network failure, or protocol failure must
not be interpreted as an anonymous session.

## Authentication design

### Backend contract

The first frontend slice consumes:

- `POST /v1/auth/login`;
- `GET /v1/auth/me`;
- `GET /v1/auth/csrf`;
- `POST /v1/auth/logout`.

The backend session cookie is opaque and HttpOnly. The frontend never reads,
stores, mirrors, or serializes the raw session token.

### CSRF handling

The CSRF token returned by login is kept only in module memory. It is never
written to localStorage, sessionStorage, IndexedDB, a persisted query cache, or
logs.

Before an unsafe request:

1. skip CSRF attachment for `/v1/auth/login`;
2. reuse the in-memory token when available;
3. otherwise make one deduplicated `GET /v1/auth/csrf` request using a bare
   credentialed Axios instance that cannot recurse through the unsafe-request
   interceptor;
4. attach `X-CSRF-Token` to the original unsafe request.

Clearing or replacing CSRF state invalidates every older in-flight fetch. An
older response may resolve for its original caller, but it must neither replace
the current token nor remove a newer request's deduplication state.

Login stores the returned token. Logout and authentication loss clear it.
Axios's cookie-based XSRF helper is not used because the backend returns the
token in JSON and keeps the session cookie HttpOnly.

### Session flow

1. The protected route loader fetches the generated `/v1/auth/me` query fresh
   before each authentication decision; it does not accept cached session data
   as proof of a current session.
2. A valid user renders the dashboard.
3. `AUTHENTICATION_REQUIRED` redirects to `/login` while preserving a sanitized
   internal return target.
4. The login feature submits the generated request type through React Hook Form
   and a generated Zod request schema.
5. On success, login stores CSRF and navigates to the sanitized return target
   or `/`; a protected-route loader owns the subsequent fresh `/v1/auth/me`
   check and its unavailable-service state.
6. The login route redirects an already authenticated user to `/`.
7. Logout sends the required CSRF header, clears session cache and CSRF state,
   and navigates to `/login`.

The dashboard content remains empty. A minimal current-user/logout control is
allowed because it is required to exercise and verify the session lifecycle.

## Tailwind CSS and formatting

`@tailwindcss/vite` is registered in `vite.config.ts`. The existing
`@import "tailwindcss"` moves into the application global stylesheet under
`app/styles`.

Prettier 3 and `prettier-plugin-tailwindcss` are installed. The Tailwind plugin
is last in the Prettier plugin array and receives the Tailwind 4 stylesheet
through `tailwindStylesheet`.

Scripts:

- `format` — write formatting;
- `format:check` — verify formatting.

The production build must no longer emit unresolved `@theme` or `@tailwind`
warnings.

No class-merging helper or Tailwind component library is introduced until
conditional class composition appears in real application code.

## Providers and existing libraries

`app/providers` owns a stable `QueryClientProvider`. Query defaults:

- no retry for client or problem-contract `4xx` errors;
- no automatic retry for mutations;
- bounded retry for retryable queries only;
- no persistence of authentication or CSRF data.

React Hook Form and the Zod resolver implement login form state and
client-side validation. Generated OpenAPI models remain the wire authority;
additional UI-only validation may refine presentation but must not weaken or
contradict the generated contract.

`@tanstack/eslint-plugin-query` is enabled through its recommended flat
configuration.

## Local backend integration

The frontend development origin is `http://localhost:5173`. The backend runs at
`http://localhost:3000`.

The frontend `.env.example` contains only:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

No secrets are stored in frontend environment files. For local integration the
backend operator configures the exact frontend origin in `CORS_ORIGINS`.
Frontend requests use credentialed CORS rather than rewriting the browser
origin through a development-only proxy.

## Verification

Add Vitest, Testing Library, user-event, jest-dom, and MSW.

Required coverage:

- OpenAPI sync rejects empty/invalid/missing-auth-path documents.
- Generated output is reproducible.
- Axios sends credentials.
- Login is exempt from CSRF attachment.
- Unsafe requests fetch CSRF once and attach it.
- Concurrent unsafe requests share one CSRF request.
- RFC 9457 responses preserve code, status, request ID, and `Retry-After`.
- Invalid error payloads become protocol errors.
- Documented `503` JSON bodies for readiness and startup checks resolve as
  their generated operational response models; unrelated error responses still
  use RFC 9457 normalization.
- Validation pointers map only to known login fields.
- The protected route distinguishes `401`, `403`, `503`, and network failure.
- Successful login stores CSRF and navigates; logout clears cache and CSRF
  state before navigation.
- `/login` redirects an already authenticated session.
- Tailwind utilities compile without unresolved at-rule warnings.

The aggregate `check` script runs, in order:

```text
api:check
format:check
lint
architecture
test
build
```

## Git and publication

The repository uses `stage` as its initial and default branch to match the
paired backend starter. The baseline source, approved design, and implementation
plan are separate commits. The remote repository is private and uses an SSH
`origin`.

No pull request is required for the initial repository bootstrap. Later feature
work starts from `stage` and is integrated through focused pull requests.

## Deferred after the first iteration

The following work is intentionally recorded but excluded from the first
implementation plan:

- dedicated polished screens for every backend problem code;
- a global toast/notification system;
- Sentry or another hosted frontend telemetry integration;
- localization of the complete problem catalogue;
- advanced exponential backoff and cross-tab retry coordination;
- session-management UI for listing and revoking other sessions;
- password-change UI;
- role and permission administration;
- registration, password reset, and OAuth;
- persisted Query Client cache;
- SSR or migration to React Router Framework Mode;
- deployment and production hosting configuration.

These items must not be implemented opportunistically while building the
foundation. They require separate product or operational decisions.

## Acceptance criteria

The design is complete when implementation can demonstrate all of the
following:

1. A fresh install uses the declared Node/pnpm toolchain and passes `pnpm check`.
2. The OpenAPI snapshot can be updated from `nest-js-starter` with one command.
3. A generated diff is required whenever the backend contract changes.
4. Tailwind utilities render and class order is deterministic.
5. Anonymous navigation to `/` reaches `/login` without rendering dashboard
   content.
6. Valid login creates the backend cookie session and opens `/`.
7. Reloading `/` restores the session through `/v1/auth/me`.
8. Logout uses CSRF correctly and returns to `/login`.
9. Backend problem codes drive deterministic UI behavior without string
   matching or raw payload leakage.
10. The implementation contains no copied `admin-codex` auth or refresh logic.
