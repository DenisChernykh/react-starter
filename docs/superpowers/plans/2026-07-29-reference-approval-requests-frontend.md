# Reference Approval Requests Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать в `react-starter` первый эталонный business slice
`approval-requests`: синхронизировать backend OpenAPI, добавить FSD entity и три
features, route-driven страницы C1, защищённый app shell с sidebar и
подтверждение необратимого решения D2.

**Architecture:** Generated transport и Zod schemas остаются в `shared/api`.
Handwritten cache, presentation и permission contracts живут в
`entities/approval-request`; create/open/decide use cases — в отдельных
`features`; route surfaces — в `pages`; общий sidebar shell — в
`widgets/app-shell`; session loader и `Outlet` — в `app/router`. Backend не имеет
list endpoint, поэтому UI предлагает только честные действия «создать» и
«открыть по UUID».

**Tech Stack:** React 19, TypeScript 6, React Router Data Mode, TanStack Query v5,
React Hook Form, Zod 4, Axios, Orval, shadcn Base UI/Lyra, Tailwind CSS v4,
Vitest, Testing Library, MSW, Steiger.

**Approved design:**
`docs/superpowers/specs/2026-07-29-reference-approval-requests-frontend-design.md`

## Execution and model strategy

Работу выполнять в ветке `feat/reference-approval-requests-frontend` от
зафиксированного design commit `f3e8e33`.

Каждый implementer получает только один Task из этого плана и делает его в
текущей ветке. Между задачами orchestrator проверяет свежий `git status`,
читает diff и запускает указанный focused gate. На каждом dispatch модель и
reasoning задаются явно:

| Task | Характер работы                                       | Implementer              |
| ---- | ----------------------------------------------------- | ------------------------ |
| 1    | OpenAPI snapshot, Orval, exports                      | `gpt-5.6-terra`, `high`  |
| 2    | Base UI registry, accessibility, shared form contract | `gpt-5.6-terra`, `xhigh` |
| 3    | Entity, query cache, permissions, presentation        | `gpt-5.6-terra`, `xhigh` |
| 4    | Create mutation, validation, navigation               | `gpt-5.6-terra`, `xhigh` |
| 5    | UUID open flow                                        | `gpt-5.6-terra`, `high`  |
| 6    | Decision mutation and AlertDialog                     | `gpt-5.6-terra`, `xhigh` |
| 7    | App shell, sidebar, protected layout                  | `gpt-5.6-terra`, `xhigh` |
| 8    | Pages, nested router, end-to-end component flow       | `gpt-5.6-terra`, `xhigh` |
| 9    | Architecture docs, browser QA, aggregate gates        | `gpt-5.6-terra`, `high`  |
| 10   | Независимый whole-branch review                       | `gpt-5.6-sol`, `xhigh`   |

Для Tasks 1–9 использовать после implementer два последовательных review:

1. spec-compliance reviewer — `gpt-5.6-terra`, `high`;
2. code-quality reviewer — `gpt-5.6-terra`, `xhigh`.

Implementer исправляет замечания и повторно запускает focused gate до перехода
к следующей задаче. Финальный Task 10 выполняется на `gpt-5.6-sol`, `xhigh`, без
контекста объяснений implementer: reviewer получает design, plan, полный diff и
свежие gate outputs. Замечания чинятся адресным `gpt-5.6-terra` worker:
`high` для generated/docs/mechanical проблем и `xhigh` для router/cache/auth/UI.
Если один и тот же класс дефекта пережил три исправления, четвёртый цикл
передаётся `gpt-5.6-sol`, `xhigh`; максимум пять review/fix циклов.

Не запускать несколько implementer одновременно: Tasks меняют пересекающиеся
public barrels, generated snapshot, router и shared UI. Параллелить можно только
read-only review после того, как implementer завершил Task.

## Global constraints

- Node.js `24.18.0`; pnpm `11.15.1`. Перед каждым gate:

  ```bash
  source /Users/denischernykh/.nvm/nvm.sh
  nvm use --silent 24.18.0
  node --version
  pnpm --version
  ```

- Backend source contract:
  `/Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests/docs/api/openapi.json`.
  Это persistent worktree ветки `feat/reference-approval-requests` на
  `df2c98f`; только источник snapshot и real-backend smoke, не frontend runtime
  dependency.
- Не менять backend checkout.
- Не добавлять list endpoint, frontend-only историю UUID, optimistic decision,
  Redux, generic CRUD framework или module manifest.
- Generated файлы в `src/shared/api/generated` и
  `src/shared/api/generated-zod` изменяются только командой `pnpm api:generate`.
- Handwritten UI не импортирует generated React Query hooks напрямую.
- UI ветвится только по stable Problem Details `code` и validation `pointer`;
  server `detail` не показывается как общая ошибка.
- Все private routes проходят через один protected parent loader.
- Условный JSX без альтернативы использует `&&`, слева находится boolean.
- Каждый новый/изменённый exported handwritten API получает содержательный
  русскоязычный TSDoc по `docs/architecture/tsdoc-guidelines.md`.
- Повторяемые control/state contracts сначала реализуются в `src/shared/ui`.
- Не перезаписывать проектные `src/shared/ui/button.tsx`,
  `src/shared/ui/input.tsx` и `src/shared/ui/separator.tsx` registry-версиями:
  они уже содержат принятые starter contracts.
- Существующая untracked `.superpowers/` — визуальный scratch пользователя
  текущего процесса; не добавлять её в commit.
- После каждого Task commit должен включать только перечисленные файлы Task.
- Не push, не создавать PR и не выполнять deployment без отдельного запроса.
- Не заявлять PASS без свежего вывода соответствующей команды.

## Target routes

```text
/login                                  public

/                                       protected parent
├── index                               dashboard
├── approval-requests                   action hub
├── approval-requests/new               create form
├── approval-requests/open              open-by-UUID form
└── approval-requests/:requestId        detail and decision
```

`new` и `open` должны быть объявлены до `:requestId` и оставаться отдельными
route branches.

## Target public boundaries

```text
shared/api
  generated transport, DTO and Zod exports

shared/routes
  approvalRequestsPath
  createApprovalRequestPath
  openApprovalRequestPath
  approvalRequestDetailsPath(requestId)

entities/approval-request
  approvalRequestQueryKey(requestId)
  approvalRequestQueryOptions(requestId)
  useApprovalRequest(requestId)
  setApprovalRequest(queryClient, request)
  getApprovalRequestStatusPresentation(status)
  formatApprovalRequestDate(value, timeZone?)
  getApprovalDecisionAvailability(request, currentUser)

features/create-approval-request
  CreateApprovalRequestForm

features/open-approval-request
  OpenApprovalRequestForm

features/decide-approval-request
  ApprovalRequestDecision

widgets/app-shell
  AppShell
```

## File map

### Contract and shared foundation

- `openapi/openapi.json`
- `scripts/openapi/sync-openapi.mjs`
- `scripts/openapi/sync-openapi.test.mjs`
- `src/shared/api/generated/approval-requests/approval-requests.ts`
- `src/shared/api/generated/model/{approvalRequestResponseDto,approvalRequestResponseDtoStatus,approvalRequestsDecidePathParameters,approvalRequestsGetPathParameters,createApprovalRequestDto,decideApprovalRequestDto,decideApprovalRequestDtoDecision}.ts`
- `src/shared/api/generated-zod/approval-requests/approval-requests.zod.ts`
- `src/shared/api/index.ts`
- `src/shared/routes/approval-requests.ts`
- `src/shared/routes/index.ts`
- `src/shared/ui/{alert-dialog,badge,sheet,sidebar,skeleton,tooltip}.tsx`
- `src/shared/lib/hooks/use-mobile.ts`
- `src/shared/ui/textarea-field.tsx`
- `src/shared/ui/textarea-field.test.tsx`
- `src/shared/ui/index.ts`

### Business slice

- `src/entities/approval-request/api/approval-request.ts`
- `src/entities/approval-request/api/approval-request.test.ts`
- `src/entities/approval-request/model/approval-request-presentation.ts`
- `src/entities/approval-request/model/approval-request-presentation.test.ts`
- `src/entities/approval-request/index.ts`
- `src/features/create-approval-request/model/create-approval-request-errors.ts`
- `src/features/create-approval-request/model/create-approval-request-errors.test.ts`
- `src/features/create-approval-request/model/use-create-approval-request.ts`
- `src/features/create-approval-request/ui/create-approval-request-form.tsx`
- `src/features/create-approval-request/ui/create-approval-request-form.test.tsx`
- `src/features/create-approval-request/index.ts`
- `src/features/open-approval-request/ui/open-approval-request-form.tsx`
- `src/features/open-approval-request/ui/open-approval-request-form.test.tsx`
- `src/features/open-approval-request/index.ts`
- `src/features/decide-approval-request/model/decision-errors.ts`
- `src/features/decide-approval-request/model/decision-errors.test.ts`
- `src/features/decide-approval-request/model/use-decide-approval-request.ts`
- `src/features/decide-approval-request/ui/approval-request-decision.tsx`
- `src/features/decide-approval-request/ui/approval-request-decision.test.tsx`
- `src/features/decide-approval-request/index.ts`

### Shell, pages, router and documentation

- `src/widgets/app-shell/ui/app-shell.tsx`
- `src/widgets/app-shell/ui/app-shell.test.tsx`
- `src/widgets/app-shell/index.ts`
- `src/app/router/protected-layout.tsx`
- `src/app/router/router.tsx`
- `src/app/router/router.test.ts`
- `src/pages/dashboard/ui/dashboard-page.tsx`
- `src/pages/approval-requests/ui/approval-requests-page.tsx`
- `src/pages/approval-requests/index.ts`
- `src/pages/approval-request-create/ui/approval-request-create-page.tsx`
- `src/pages/approval-request-create/index.ts`
- `src/pages/approval-request-open/ui/approval-request-open-page.tsx`
- `src/pages/approval-request-open/index.ts`
- `src/pages/approval-request-details/ui/approval-request-details-page.tsx`
- `src/pages/approval-request-details/ui/approval-request-details-page.test.tsx`
- `src/pages/approval-request-details/index.ts`
- `README.md`
- `docs/architecture/business-modules.md`
- `docs/architecture/ui-guidelines.md`

---

## Task 1: Synchronize and expose the approval OpenAPI contract

**Model:** `gpt-5.6-terra`, reasoning `high`.

**Files:**

- Modify: `scripts/openapi/sync-openapi.mjs`
- Modify: `scripts/openapi/sync-openapi.test.mjs`
- Modify: `openapi/openapi.json`
- Regenerate: `src/shared/api/generated/**`
- Regenerate: `src/shared/api/generated-zod/**`
- Modify: `src/shared/api/index.ts`

**Interfaces:**

- Requires exact operations:
  `approvalRequestsCreate`, `approvalRequestsGet`, `approvalRequestsDecide`.
- Produces request functions:

  ```ts
  approvalRequestsCreate(createApprovalRequestDto, options?, signal?)
  approvalRequestsGet({ requestId }, options?, signal?)
  approvalRequestsDecide({ requestId }, decideApprovalRequestDto, options?, signal?)
  ```

- Produces Query helpers:

  ```ts
  getApprovalRequestsGetQueryKey({ requestId })
  getApprovalRequestsGetQueryOptions({ requestId }, options?)
  ```

- Produces schemas:
  `ApprovalRequestsCreateBody`, `ApprovalRequestsGetParams`,
  `ApprovalRequestsDecideBody`, `ApprovalRequestsDecideParams`.

- [ ] **Step 1: Extend the sync validator test and confirm RED**

Rename `authPaths` to `requiredPaths` and add:

```js
const requiredPaths = {
  '/v1/auth/login': { post: { operationId: 'authLogin' } },
  '/v1/auth/me': { get: { operationId: 'authGetMe' } },
  '/v1/auth/csrf': { get: { operationId: 'authGetCsrfToken' } },
  '/v1/auth/logout': { post: { operationId: 'authLogout' } },
  '/v1/approval-requests': {
    post: { operationId: 'approvalRequestsCreate' },
  },
  '/v1/approval-requests/{requestId}': {
    get: { operationId: 'approvalRequestsGet' },
  },
  '/v1/approval-requests/{requestId}/decision': {
    put: { operationId: 'approvalRequestsDecide' },
  },
}
```

Add a failure case that deletes the decision operation and expects the exact
path in the error:

```js
it('rejects a document missing a required approval operation', () => {
  const paths = structuredClone(requiredPaths)
  delete paths['/v1/approval-requests/{requestId}/decision']

  expect(() => validateOpenApiDocument({ openapi: '3.0.3', paths })).toThrow(
    '/v1/approval-requests/{requestId}/decision',
  )
})
```

Run:

```bash
./node_modules/.bin/vitest run scripts/openapi/sync-openapi.test.mjs
```

Expected: FAIL because `validateOpenApiDocument` still accepts the document
without an approval operation.

- [ ] **Step 2: Add the three exact operations to the sync contract**

Append to `requiredOperations` in `scripts/openapi/sync-openapi.mjs`:

```js
['/v1/approval-requests', 'post', 'approvalRequestsCreate'],
['/v1/approval-requests/{requestId}', 'get', 'approvalRequestsGet'],
[
  '/v1/approval-requests/{requestId}/decision',
  'put',
  'approvalRequestsDecide',
],
```

Run the focused test again and require PASS.

- [ ] **Step 3: Sync the approved backend snapshot**

Run:

```bash
OPENAPI_SPEC_SOURCE=/Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests/docs/api/openapi.json \
  pnpm api:sync
pnpm api:generate
```

Do not hand-edit generated files. Inspect:

```bash
rg -n \
  'approvalRequests(Create|Get|Decide)|APPROVAL_REQUEST_(NOT_FOUND|ALREADY_DECIDED)|APPROVAL_SELF_DECISION_FORBIDDEN' \
  openapi/openapi.json src/shared/api/generated src/shared/api/generated-zod
```

Expected generated locations include:

```text
src/shared/api/generated/approval-requests/approval-requests.ts
src/shared/api/generated/model/approvalRequestResponseDto.ts
src/shared/api/generated/model/createApprovalRequestDto.ts
src/shared/api/generated/model/decideApprovalRequestDto.ts
src/shared/api/generated-zod/approval-requests/approval-requests.zod.ts
```

- [ ] **Step 4: Export only the transport contracts needed by handwritten code**

Add to `src/shared/api/index.ts`:

```ts
export {
  approvalRequestsCreate,
  approvalRequestsDecide,
  approvalRequestsGet,
  getApprovalRequestsGetQueryKey,
  getApprovalRequestsGetQueryOptions,
} from './generated/approval-requests/approval-requests'
export type {
  ApprovalRequestResponseDto,
  ApprovalRequestResponseDtoStatus,
  ApprovalRequestsDecidePathParameters,
  ApprovalRequestsGetPathParameters,
  CreateApprovalRequestDto,
  DecideApprovalRequestDto,
  DecideApprovalRequestDtoDecision,
} from './generated/model'
export {
  ApprovalRequestsCreateBody as approvalRequestCreateSchema,
  ApprovalRequestsDecideBody as approvalRequestDecisionSchema,
  ApprovalRequestsGetParams as approvalRequestPathSchema,
} from './generated-zod/approval-requests/approval-requests.zod'
```

Do not export generated React Query hooks.

- [ ] **Step 5: Run contract gates**

```bash
./node_modules/.bin/vitest run scripts/openapi/sync-openapi.test.mjs
pnpm api:check
./node_modules/.bin/tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add \
  scripts/openapi/sync-openapi.mjs \
  scripts/openapi/sync-openapi.test.mjs \
  openapi/openapi.json \
  src/shared/api/generated \
  src/shared/api/generated-zod \
  src/shared/api/index.ts
git commit -m "feat(api): sync approval request contract"
```

---

## Task 2: Add the shared Base UI controls safely

**Model:** `gpt-5.6-terra`, reasoning `xhigh`.

**Files:**

- Create: `src/shared/ui/alert-dialog.tsx`
- Create: `src/shared/ui/badge.tsx`
- Create: `src/shared/ui/sheet.tsx`
- Create: `src/shared/ui/sidebar.tsx`
- Create: `src/shared/ui/skeleton.tsx`
- Create: `src/shared/ui/tooltip.tsx`
- Create: `src/shared/lib/hooks/use-mobile.ts`
- Create: `src/shared/ui/textarea-field.tsx`
- Create: `src/shared/ui/textarea-field.test.tsx`
- Modify: `src/shared/ui/index.ts`
- Modify when registry requires it: `package.json`, `pnpm-lock.yaml`
- Must not modify: `src/shared/ui/button.tsx`
- Must not modify: `src/shared/ui/input.tsx`
- Must not modify: `src/shared/ui/separator.tsx`

**Interfaces:**

- Registry exports `AlertDialog*`, `Badge`, `Sheet*`, `Sidebar*`, `Skeleton`,
  `Tooltip*`.
- Project-owned export:

  ```ts
  type TextareaFieldProps = ComponentProps<'textarea'> & {
    label: ReactNode
    description?: ReactNode
    error?: ReactNode
  }

  export function TextareaField(props: TextareaFieldProps): ReactNode
  ```

- [ ] **Step 1: Record the protected shared UI baseline**

Before invoking shadcn:

```bash
git diff --exit-code -- \
  src/shared/ui/button.tsx \
  src/shared/ui/input.tsx \
  src/shared/ui/separator.tsx
shasum -a 256 \
  src/shared/ui/button.tsx \
  src/shared/ui/input.tsx \
  src/shared/ui/separator.tsx
```

Save the three hashes in the Task commentary, not in the repository.

- [ ] **Step 2: Inspect current registry output before writing**

Run:

```bash
./node_modules/.bin/shadcn add sidebar alert-dialog badge --dry-run --yes
./node_modules/.bin/shadcn view sidebar
./node_modules/.bin/shadcn view alert-dialog
./node_modules/.bin/shadcn view badge
```

The current Base UI sidebar declares `button.tsx`, `input.tsx` and
`separator.tsx` as dependencies. Do not accept overwrite prompts for those
files. Materialize only new registry files by copying the current registry
content displayed by `shadcn view`, rewriting registry aliases to the project
aliases from `components.json`.

Required new dependency files are:

```text
badge.tsx
alert-dialog.tsx
sheet.tsx
sidebar.tsx
skeleton.tsx
tooltip.tsx
src/shared/lib/hooks/use-mobile.ts
```

If the current registry adds another dependency, stop and inspect it before
adding. Do not install unrelated controls.

- [ ] **Step 3: Prove existing contracts were preserved**

Run:

```bash
git diff --exit-code -- \
  src/shared/ui/button.tsx \
  src/shared/ui/input.tsx \
  src/shared/ui/separator.tsx
```

Expected: exit 0. Also rerun the three `shasum` commands and compare with Step 1.

- [ ] **Step 4: Write the TextareaField accessibility tests and confirm RED**

Create `src/shared/ui/textarea-field.test.tsx` with these contracts:

```tsx
it('connects label, description and error to the textarea', () => {
  render(
    <TextareaField
      label="Описание"
      description="Опишите предмет согласования"
      error="Описание обязательно"
    />,
  )

  const textarea = screen.getByRole('textbox', { name: 'Описание' })
  expect(textarea).toHaveAccessibleDescription(
    'Опишите предмет согласования Описание обязательно',
  )
  expect(textarea).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('alert')).toHaveTextContent('Описание обязательно')
})

it('preserves native props and the forwarded ref from form registration', () => {
  const ref = vi.fn()
  render(
    <TextareaField
      label="Описание"
      name="description"
      maxLength={2_000}
      ref={ref}
    />,
  )

  expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveAttribute(
    'maxlength',
    '2000',
  )
  expect(ref).toHaveBeenCalled()
})
```

Run:

```bash
./node_modules/.bin/vitest run src/shared/ui/textarea-field.test.tsx
```

Expected: FAIL because `TextareaField` does not exist.

- [ ] **Step 5: Implement TextareaField through the existing field contract**

Create `src/shared/ui/textarea-field.tsx` by composing `Field`, `FieldLabel`,
`FieldDescription`, `FieldError`, existing `Textarea`, and `useFieldA11y`.
Match the `TextField` behavior exactly:

```tsx
export function TextareaField({
  label,
  description,
  error,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...textareaProps
}: TextareaFieldProps) {
  const metadata = useFieldA11y({
    id,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    description,
    error,
  })
  const hasDescription = description !== undefined && description !== null
  const hasError = Boolean(error)

  return (
    <Field data-invalid={metadata.isInvalid || undefined}>
      <FieldLabel htmlFor={metadata.inputId}>{label}</FieldLabel>
      <Textarea
        {...textareaProps}
        id={metadata.inputId}
        aria-describedby={metadata.describedBy}
        aria-invalid={metadata.ariaInvalid}
      />
      {hasDescription && (
        <FieldDescription id={metadata.descriptionId}>
          {description}
        </FieldDescription>
      )}
      {hasError && (
        <FieldError id={metadata.errorId} role="alert">
          {error}
        </FieldError>
      )}
    </Field>
  )
}
```

Add Russian TSDoc that documents native props/ref and ARIA composition.

- [ ] **Step 6: Update the shared barrel**

Export the registry primitives and `TextareaField` from
`src/shared/ui/index.ts`. Keep the low-level `Textarea` private to the shared UI
folder until a second legitimate consumer needs it. Do not export internal
sidebar constants.

- [ ] **Step 7: Run shared UI gates**

```bash
./node_modules/.bin/vitest run \
  src/shared/ui/button.test.tsx \
  src/shared/ui/text-field.test.tsx \
  src/shared/ui/password-field.test.tsx \
  src/shared/ui/textarea-field.test.tsx
./node_modules/.bin/eslint src/shared/ui src/shared/lib/hooks/use-mobile.ts
./node_modules/.bin/tsc -b
git diff --exit-code -- \
  src/shared/ui/button.tsx \
  src/shared/ui/input.tsx \
  src/shared/ui/separator.tsx
```

- [ ] **Step 8: Commit**

Stage only the new shared files, barrel, and actual dependency metadata:

```bash
git add \
  package.json pnpm-lock.yaml \
  src/shared/lib/hooks/use-mobile.ts \
  src/shared/ui/alert-dialog.tsx \
  src/shared/ui/badge.tsx \
  src/shared/ui/sheet.tsx \
  src/shared/ui/sidebar.tsx \
  src/shared/ui/skeleton.tsx \
  src/shared/ui/tooltip.tsx \
  src/shared/ui/textarea-field.tsx \
  src/shared/ui/textarea-field.test.tsx \
  src/shared/ui/index.ts
git commit -m "feat(ui): add approval workflow primitives"
```

Omit `package.json`/lockfile from `git add` if the registry needed no new
dependencies and they are unchanged.

---

## Task 3: Build the approval request entity and route contracts

**Model:** `gpt-5.6-terra`, reasoning `xhigh`.

**Files:**

- Create: `src/shared/routes/approval-requests.ts`
- Create: `src/shared/routes/index.ts`
- Create: `src/entities/approval-request/api/approval-request.ts`
- Create: `src/entities/approval-request/api/approval-request.test.ts`
- Create: `src/entities/approval-request/model/approval-request-presentation.ts`
- Create: `src/entities/approval-request/model/approval-request-presentation.test.ts`
- Create: `src/entities/approval-request/index.ts`

**Interfaces:**

```ts
export const approvalRequestsPath = '/approval-requests'
export const createApprovalRequestPath = '/approval-requests/new'
export const openApprovalRequestPath = '/approval-requests/open'
export function approvalRequestDetailsPath(requestId: string): string

export const approvalRequestQueryKey
export const approvalRequestQueryOptions
export function useApprovalRequest(requestId: string)
export function setApprovalRequest(
  queryClient: QueryClient,
  request: ApprovalRequestResponseDto,
): void

export type ApprovalDecisionAvailability =
  'available' | 'terminal' | 'own-request' | 'missing-permission'
```

- [ ] **Step 1: Add route helper tests inside the entity presentation test**

The details path must encode a caller-provided segment:

```ts
expect(approvalRequestDetailsPath('id/with/slash')).toBe(
  '/approval-requests/id%2Fwith%2Fslash',
)
```

Although normal callers pass validated UUIDs, encoding keeps the exported helper
safe by contract.

- [ ] **Step 2: Add presentation and permission tests and confirm RED**

Use a fixed request and current user. Cover:

```ts
it.each([
  ['pending', 'Ожидает решения', 'secondary'],
  ['approved', 'Одобрен', 'default'],
  ['rejected', 'Отклонён', 'destructive'],
] as const)('maps %s to a Russian badge contract', (status, label, variant) => {
  expect(getApprovalRequestStatusPresentation(status)).toEqual({
    label,
    variant,
  })
})

expect(formatApprovalRequestDate('2026-07-29T06:15:00.000Z', 'UTC')).toBe(
  '29.07.2026, 06:15',
)

expect(getApprovalDecisionAvailability(pending, reviewer)).toBe('available')
expect(getApprovalDecisionAvailability(approved, reviewer)).toBe('terminal')
expect(getApprovalDecisionAvailability(pending, author)).toBe('own-request')
expect(getApprovalDecisionAvailability(pending, userWithoutPermission)).toBe(
  'missing-permission',
)
```

Run:

```bash
./node_modules/.bin/vitest run \
  src/entities/approval-request/model/approval-request-presentation.test.ts
```

Expected: FAIL because the entity does not exist.

- [ ] **Step 3: Add query identity and cache tests**

Create `src/entities/approval-request/api/approval-request.test.ts`. Assert that:

```ts
expect(approvalRequestQueryKey(request.id)).toEqual(
  getApprovalRequestsGetQueryKey({ requestId: request.id }),
)
expect(approvalRequestQueryOptions(request.id).queryKey).toEqual(
  approvalRequestQueryKey(request.id),
)

const queryClient = new QueryClient()
setApprovalRequest(queryClient, request)
expect(queryClient.getQueryData(approvalRequestQueryKey(request.id))).toEqual(
  request,
)
```

These tests protect create, detail and decide from silently using different
cache keys.

- [ ] **Step 4: Implement route constants**

`src/shared/routes/approval-requests.ts`:

```ts
/** Путь к центру действий согласования. */
export const approvalRequestsPath = '/approval-requests'
/** Путь к форме создания запроса. */
export const createApprovalRequestPath = '/approval-requests/new'
/** Путь к форме открытия запроса по UUID. */
export const openApprovalRequestPath = '/approval-requests/open'

/** Строит безопасный путь к конкретному запросу согласования. */
export function approvalRequestDetailsPath(requestId: string) {
  return `${approvalRequestsPath}/${encodeURIComponent(requestId)}`
}
```

Re-export from `src/shared/routes/index.ts`.

- [ ] **Step 5: Implement the entity query adapter**

`src/entities/approval-request/api/approval-request.ts`:

```ts
export function approvalRequestQueryKey(requestId: string) {
  return getApprovalRequestsGetQueryKey({ requestId })
}

export function approvalRequestQueryOptions(requestId: string) {
  return getApprovalRequestsGetQueryOptions({ requestId })
}

export function useApprovalRequest(requestId: string) {
  return useQuery({
    ...approvalRequestQueryOptions(requestId),
    throwOnError: (error) => isProblemCode(error, 'AUTHENTICATION_REQUIRED'),
  })
}

export function setApprovalRequest(
  queryClient: QueryClient,
  request: ApprovalRequestResponseDto,
) {
  queryClient.setQueryData(approvalRequestQueryKey(request.id), request)
}
```

Do not replace the generated query function: it already passes TanStack Query's
`AbortSignal` to the mutator.

- [ ] **Step 6: Implement presentation and decision availability**

Use generated `ApprovalRequestResponseDto`,
`ApprovalRequestResponseDtoStatus`, and `CurrentUserResponseDto`; do not define a
second DTO.

`getApprovalRequestStatusPresentation` returns Russian label and one existing
Badge variant:

```ts
type ApprovalRequestStatusPresentation = {
  label: string
  variant: 'default' | 'secondary' | 'destructive'
}
```

`formatApprovalRequestDate` uses one module-level
`Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })` for
normal runtime and creates a formatter with the optional `timeZone` only when a
test/consumer explicitly supplies it. Null dates are handled by the page, not
this helper.

`getApprovalDecisionAvailability` checks in this order:

1. non-`pending` → `terminal`;
2. current user is `createdByUserId` → `own-request`;
3. `permissions` does not include `approval.requests.decide` →
   `missing-permission`;
4. otherwise → `available`.

This order guarantees that a terminal request never exposes a permission-based
action.

- [ ] **Step 7: Export the entity public API and run gates**

```bash
./node_modules/.bin/vitest run \
  src/entities/approval-request/api/approval-request.test.ts \
  src/entities/approval-request/model/approval-request-presentation.test.ts
./node_modules/.bin/eslint \
  src/entities/approval-request \
  src/shared/routes
./node_modules/.bin/tsc -b
pnpm architecture
```

- [ ] **Step 8: Commit**

```bash
git add src/shared/routes src/entities/approval-request
git commit -m "feat(approval): add request entity"
```

---

## Task 4: Implement the create request feature

**Model:** `gpt-5.6-terra`, reasoning `xhigh`.

**Files:**

- Create: `src/features/create-approval-request/model/create-approval-request-errors.ts`
- Create: `src/features/create-approval-request/model/create-approval-request-errors.test.ts`
- Create: `src/features/create-approval-request/model/use-create-approval-request.ts`
- Create: `src/features/create-approval-request/ui/create-approval-request-form.tsx`
- Create: `src/features/create-approval-request/ui/create-approval-request-form.test.tsx`
- Create: `src/features/create-approval-request/index.ts`

**Interfaces:**

- Form fields are generated `CreateApprovalRequestDto`.
- Runtime resolver is generated `approvalRequestCreateSchema`.
- Success writes the returned DTO under the detail key and navigates to its
  details route.
- No list invalidation.

- [ ] **Step 1: Write error mapping tests and confirm RED**

Cover `/title` and `/description`, first error wins, unknown pointer ignored,
and safe general messages:

```ts
expect(
  mapCreateApprovalRequestValidationErrors({
    errors: [
      { pointer: '/title', code: 'too_small', detail: 'Введите название' },
      {
        pointer: '/description',
        code: 'too_small',
        detail: 'Введите описание',
      },
      { pointer: '/unknown', code: 'invalid', detail: 'Не показывать' },
    ],
  }),
).toEqual({
  title: 'Введите название',
  description: 'Введите описание',
})
```

`getCreateApprovalRequestError` must distinguish network, protocol,
dependency unavailable and fallback with request id, but never return raw
`problem.detail`.

- [ ] **Step 2: Write the form integration tests and confirm RED**

Render with `QueryClientProvider` and a memory router. MSW scenarios:

1. empty submit is rejected locally and POST is not called;
2. POST carries title/description and CSRF, response is cached, route becomes
   `/approval-requests/{id}`;
3. `VALIDATION_FAILED` maps `/title` and `/description`;
4. 503 shows safe alert, not server `detail`;
5. pending submit uses `Button isLoading`, is disabled and prevents duplicate
   POST.

Use the backend response DTO exactly:

```ts
const createdRequest = {
  id: 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184',
  title: 'Публикация релиза',
  description: 'Проверить релиз перед публикацией',
  status: 'pending',
  createdByUserId: '401deac1-f230-4926-961e-d4c3ac510cec',
  decidedByUserId: null,
  createdAt: '2026-07-29T06:15:00.000Z',
  decidedAt: null,
}
```

- [ ] **Step 3: Implement the mutation hook**

`useCreateApprovalRequest` uses `useMutation`, `useQueryClient` and
`useNavigate`:

```ts
export function useCreateApprovalRequest() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (input: CreateApprovalRequestDto) =>
      approvalRequestsCreate(input),
    onSuccess: (request) => {
      setApprovalRequest(queryClient, request)
      void navigate(approvalRequestDetailsPath(request.id))
    },
  })
}
```

Do not pre-populate a synthetic list.

- [ ] **Step 4: Implement the form**

Follow `LoginForm` conventions:

- `useForm<CreateApprovalRequestDto>` with
  `zodResolver(approvalRequestCreateSchema)`;
- `TextField` for `title`;
- `TextareaField` for `description`;
- `setError` for server validation pointers;
- `Alert` for safe form-level error;
- submit `Button isLoading`, `loadingLabel="Создаём запрос"`;
- on `AUTHENTICATION_REQUIRED`, call `useRevalidator().revalidate()` and do not
  render a stale-session business error.

The form contains only user-visible business fields. IDs/status/timestamps come
from the server.

- [ ] **Step 5: Export and run focused gates**

```bash
./node_modules/.bin/vitest run \
  src/features/create-approval-request/model/create-approval-request-errors.test.ts \
  src/features/create-approval-request/ui/create-approval-request-form.test.tsx
./node_modules/.bin/eslint src/features/create-approval-request
./node_modules/.bin/tsc -b
pnpm architecture
```

- [ ] **Step 6: Commit**

```bash
git add src/features/create-approval-request
git commit -m "feat(approval): add create request flow"
```

---

## Task 5: Implement the open-by-UUID feature

**Model:** `gpt-5.6-terra`, reasoning `high`.

**Files:**

- Create: `src/features/open-approval-request/ui/open-approval-request-form.tsx`
- Create: `src/features/open-approval-request/ui/open-approval-request-form.test.tsx`
- Create: `src/features/open-approval-request/index.ts`

**Interfaces:**

- Form field type is generated `ApprovalRequestsGetPathParameters`.
- Runtime validation is generated `approvalRequestPathSchema`.
- Successful submit only navigates; the detail page owns the GET.

- [ ] **Step 1: Write tests and confirm RED**

Cover:

1. empty UUID and malformed UUID show local validation;
2. malformed value does not navigate and does not issue GET;
3. valid UUID navigates to details path;
4. no API request is issued by the form itself.

Use:

```ts
const requestId = 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184'
await userEvent.type(
  screen.getByRole('textbox', { name: 'ID запроса' }),
  requestId,
)
await userEvent.click(screen.getByRole('button', { name: 'Открыть запрос' }))
expect(router.state.location.pathname).toBe(`/approval-requests/${requestId}`)
```

- [ ] **Step 2: Implement the form**

Use `useForm<ApprovalRequestsGetPathParameters>`,
`zodResolver(approvalRequestPathSchema)`, `TextField`, and `useNavigate`.
Preserve the generated schema result exactly:

```ts
const submit = handleSubmit(({ requestId }) => {
  void navigate(approvalRequestDetailsPath(requestId))
})
```

Do not trim, lowercase, rewrite or fetch the UUID.

- [ ] **Step 3: Export and run focused gates**

```bash
./node_modules/.bin/vitest run \
  src/features/open-approval-request/ui/open-approval-request-form.test.tsx
./node_modules/.bin/eslint src/features/open-approval-request
./node_modules/.bin/tsc -b
pnpm architecture
```

- [ ] **Step 4: Commit**

```bash
git add src/features/open-approval-request
git commit -m "feat(approval): add open request flow"
```

---

## Task 6: Implement confirmed approve/reject decisions

**Model:** `gpt-5.6-terra`, reasoning `xhigh`.

**Files:**

- Create: `src/features/decide-approval-request/model/decision-errors.ts`
- Create: `src/features/decide-approval-request/model/decision-errors.test.ts`
- Create: `src/features/decide-approval-request/model/use-decide-approval-request.ts`
- Create: `src/features/decide-approval-request/ui/approval-request-decision.tsx`
- Create: `src/features/decide-approval-request/ui/approval-request-decision.test.tsx`
- Create: `src/features/decide-approval-request/index.ts`

**Interfaces:**

- Props:

  ```ts
  type ApprovalRequestDecisionProps = {
    request: ApprovalRequestResponseDto
    currentUser: CurrentUserResponseDto
  }
  ```

- Mutation input is generated `DecideApprovalRequestDtoDecision`.
- Decision controls render only for `available`.
- Both approve and reject require D2 `AlertDialog` confirmation.

- [ ] **Step 1: Write safe error presentation tests and confirm RED**

`getApprovalDecisionError` maps:

```text
APPROVAL_REQUEST_ALREADY_DECIDED -> Запрос уже обработан. Данные обновлены.
APPROVAL_SELF_DECISION_FORBIDDEN -> Нельзя принять решение по собственному запросу.
APPROVAL_REQUEST_NOT_FOUND       -> Запрос недоступен или не существует.
AUTHORIZATION_DENIED             -> Недостаточно прав для принятия решения.
DEPENDENCY_UNAVAILABLE           -> Сервис временно недоступен.
ApiNetworkError                  -> Не удалось подключиться к серверу.
ApiProtocolError                 -> Сервер вернул некорректный ответ.
other ApiProblemError            -> Не удалось сохранить решение. Код запроса: …
unknown                          -> Не удалось сохранить решение.
```

Never return `problem.detail`.

- [ ] **Step 2: Write interaction tests and confirm RED**

Cover:

1. author sees no decision buttons and sees the neutral own-request note;
2. user without permission sees no decision buttons and sees the neutral
   permission note;
3. terminal request sees no decision buttons;
4. eligible reviewer sees «Одобрить» and «Отклонить»;
5. clicking either button opens a correctly worded dialog but does not call PUT;
6. confirming sends `{ decision: 'approved' }` or `{ decision: 'rejected' }`;
7. pending confirm uses `isLoading`, disables cancel/repeated confirmation;
8. success writes returned server DTO to the detail cache and closes dialog;
9. `APPROVAL_REQUEST_ALREADY_DECIDED` invalidates/refetches the detail query and
   shows the safe message;
10. `APPROVAL_REQUEST_NOT_FOUND` invalidates/refetches detail into its
    unavailable state;
11. auth failure triggers route revalidation;
12. cancel returns focus to the exact approve/reject trigger;
13. raw server detail is absent.

Use accessible queries by button/dialog/title names; do not assert Base UI
implementation classes.

- [ ] **Step 3: Implement the mutation hook**

`useDecideApprovalRequest(requestId)`:

```ts
export function useDecideApprovalRequest(requestId: string) {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()

  return useMutation({
    mutationFn: (decision: DecideApprovalRequestDtoDecision) =>
      approvalRequestsDecide({ requestId }, { decision }),
    onSuccess: (request) => {
      setApprovalRequest(queryClient, request)
    },
    onError: async (error) => {
      if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
        await revalidator.revalidate()
        return
      }
      const requiresRefresh =
        isProblemCode(error, 'APPROVAL_REQUEST_ALREADY_DECIDED') ||
        isProblemCode(error, 'APPROVAL_REQUEST_NOT_FOUND')
      if (requiresRefresh) {
        await queryClient.invalidateQueries({
          queryKey: approvalRequestQueryKey(requestId),
        })
        await queryClient.refetchQueries({
          queryKey: approvalRequestQueryKey(requestId),
          type: 'active',
        })
      }
    },
  })
}
```

Do not optimistically change status.

- [ ] **Step 4: Implement trigger-backed controlled AlertDialogs**

Create a private `DecisionDialog` and render it twice: once for `approved`, once
for `rejected`. Each instance owns its `open` state and uses a real
`AlertDialogTrigger`, so Base UI can restore focus to the exact trigger:

```tsx
<DecisionDialog
  request={request}
  decision="approved"
  mutation={decisionMutation}
/>
<DecisionDialog
  request={request}
  decision="rejected"
  mutation={decisionMutation}
/>
```

Derive the presentation state once:

```tsx
const availability = getApprovalDecisionAvailability(request, currentUser)
```

Render through an exhaustive `switch`:

- `available` → action buttons and controlled AlertDialog;
- `own-request` → «Собственный запрос должен одобрить другой пользователь.»;
- `missing-permission` → «У вас нет права принимать решение по этому запросу.»;
- `terminal` → safe conflict `Alert` only when the preceding mutation returned
  `APPROVAL_REQUEST_ALREADY_DECIDED`, otherwise `null`; the details page shows
  the recorded terminal status and decision metadata.

Inside JSX, optional alerts use boolean `&&`.

Inside `DecisionDialog`:

```tsx
<AlertDialog open={open} onOpenChange={handleOpenChange}>
  <AlertDialogTrigger
    render={
      <Button variant={decision === 'rejected' ? 'destructive' : 'default'} />
    }
  >
    {copy.action}
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{copy.title}</AlertDialogTitle>
      <AlertDialogDescription>
        «{request.title}». Решение нельзя отменить.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={mutation.isPending}>
        Отмена
      </AlertDialogCancel>
      <AlertDialogAction
        isLoading={mutation.isPending}
        loadingLabel={copy.loadingLabel}
        onClick={confirm}
      >
        {copy.action}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

`handleOpenChange` ignores close requests while mutation is pending and calls
`mutation.reset()` before opening a new dialog. `confirm` uses `mutateAsync`; it
calls `setOpen(false)` only after success and keeps the dialog open with a safe
`Alert` after failure.

Decision copy:

```text
approved:
  title: Одобрить запрос?
  action: Одобрить
  loadingLabel: Одобряем запрос

rejected:
  title: Отклонить запрос?
  action: Отклонить
  loadingLabel: Отклоняем запрос
```

`AlertDialogAction` wraps the existing project `Button`, so pass
`isLoading={mutation.isPending}` and the decision-specific `loadingLabel`.
Disable cancel while pending. On success set the dialog's `open` state to
`false`; on error keep it open and show a safe `Alert`.

- [ ] **Step 5: Export and run focused gates**

```bash
./node_modules/.bin/vitest run \
  src/features/decide-approval-request/model/decision-errors.test.ts \
  src/features/decide-approval-request/ui/approval-request-decision.test.tsx
./node_modules/.bin/eslint src/features/decide-approval-request
./node_modules/.bin/tsc -b
pnpm architecture
```

- [ ] **Step 6: Commit**

```bash
git add src/features/decide-approval-request
git commit -m "feat(approval): add confirmed decision flow"
```

---

## Task 7: Add the protected app shell and responsive sidebar

**Model:** `gpt-5.6-terra`, reasoning `xhigh`.

**Files:**

- Create: `src/widgets/app-shell/ui/app-shell.tsx`
- Create: `src/widgets/app-shell/ui/app-shell.test.tsx`
- Create: `src/widgets/app-shell/index.ts`
- Create: `src/app/router/protected-layout.tsx`
- Modify: `src/pages/dashboard/ui/dashboard-page.tsx`

**Interfaces:**

```ts
export function AppShell({ children }: PropsWithChildren): ReactNode
export function ProtectedLayout(): ReactNode
```

- `AppShell` owns shell/sidebar/header/footer.
- `ProtectedLayout` owns `<Outlet />`.
- Dashboard no longer owns full viewport container or logout header.

- [ ] **Step 1: Add app shell tests and confirm RED**

Render the shell in a memory router with current session cache. Provide
`window.matchMedia` in the test so `useIsMobile` has deterministic desktop/mobile
results. Cover:

1. desktop renders links «Обзор» and «Согласование»;
2. exact `/` marks only overview active;
3. `/approval-requests/new` marks approval navigation active;
4. session email and existing `LogoutButton` are in sidebar footer;
5. trigger has accessible name «Открыть навигацию»;
6. children render inside main content;
7. mobile trigger opens the Sheet navigation and a link closes it.

- [ ] **Step 2: Implement the app shell**

Compose:

```text
SidebarProvider
├── Sidebar
│   ├── SidebarHeader        starter name
│   ├── SidebarContent
│   │   └── SidebarMenu      NavLink: Обзор, Согласование
│   └── SidebarFooter        email, LogoutButton
└── SidebarInset
    ├── header               SidebarTrigger
    └── Container as="main"  children
```

Use `useMatch({ path: '/', end: true })` for overview and
`useMatch('/approval-requests/*')` for the business slice. Convert matches to
booleans before passing `isActive`.

For Base UI registry composition use:

```tsx
<SidebarMenuButton
  isActive={Boolean(overviewMatch)}
  render={<NavLink to="/" end />}
>
  <LayoutDashboard aria-hidden="true" />
  <span>Обзор</span>
</SidebarMenuButton>
```

Current `SidebarMenuButton` uses Base UI `useRender`; it does not accept Radix
`asChild` and does not require the project `Button.nativeButton` prop. Do not
invent either prop.

Use the `ClipboardCheck` icon for «Согласование». Icons are decorative and have
`aria-hidden="true"`.

The nav component runs inside `SidebarProvider` and reads
`isMobile`/`setOpenMobile` from `useSidebar`. Attach the same click handler to
both `NavLink` elements:

```ts
function closeMobileNavigation() {
  if (isMobile) setOpenMobile(false)
}
```

This makes the drawer close after a mobile navigation without changing desktop
collapsed state.

- [ ] **Step 3: Add the protected layout**

`src/app/router/protected-layout.tsx`:

```tsx
/** Соединяет защищённый app shell с дочерними маршрутами приложения. */
export function ProtectedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
```

- [ ] **Step 4: Reduce DashboardPage to page-owned content**

Keep `useCurrentSession` only if dashboard visibly shows user-specific content.
The minimal target:

```tsx
export function DashboardPage() {
  const { data: user } = useCurrentSession()

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Обзор</h1>
      <p className="text-muted-foreground">
        Вы вошли как {user.normalizedEmail}
      </p>
    </section>
  )
}
```

Remove page-owned `<main>`, `min-h-screen`, header and `LogoutButton`.

- [ ] **Step 5: Run focused gates**

```bash
./node_modules/.bin/vitest run \
  src/widgets/app-shell/ui/app-shell.test.tsx
./node_modules/.bin/eslint \
  src/widgets/app-shell \
  src/app/router/protected-layout.tsx \
  src/pages/dashboard/ui/dashboard-page.tsx
./node_modules/.bin/tsc -b
pnpm architecture
```

- [ ] **Step 6: Commit**

```bash
git add \
  src/widgets/app-shell \
  src/app/router/protected-layout.tsx \
  src/pages/dashboard/ui/dashboard-page.tsx
git commit -m "feat(app): add protected sidebar shell"
```

---

## Task 8: Assemble approval pages and nested routes

**Model:** `gpt-5.6-terra`, reasoning `xhigh`.

**Files:**

- Create: `src/pages/approval-requests/ui/approval-requests-page.tsx`
- Create: `src/pages/approval-requests/index.ts`
- Create: `src/pages/approval-request-create/ui/approval-request-create-page.tsx`
- Create: `src/pages/approval-request-create/index.ts`
- Create: `src/pages/approval-request-open/ui/approval-request-open-page.tsx`
- Create: `src/pages/approval-request-open/index.ts`
- Create: `src/pages/approval-request-details/ui/approval-request-details-page.tsx`
- Create: `src/pages/approval-request-details/ui/approval-request-details-page.test.tsx`
- Create: `src/pages/approval-request-details/index.ts`
- Modify: `src/app/router/router.tsx`
- Modify: `src/app/router/router.test.ts`

**Interfaces:**

- Hub links to `/approval-requests/new` and `/approval-requests/open`.
- Detail parses params before mounting the query component.
- Detail GET runs only after protected parent loader succeeded.
- 401 query errors reach `RouteError`; concealed access/not-found and retryable
  errors are inline.

- [ ] **Step 1: Add detail page tests and confirm RED**

Use `QueryClientProvider`, memory router and MSW. Cover:

1. malformed route param renders «Запрос недоступен» and issues no GET;
2. pending GET shows accessible spinner/loading text;
3. successful GET renders title, UUID, description, status badge, author id and
   formatted timestamps;
4. null decision values render «Решение ещё не принято»;
5. `APPROVAL_REQUEST_NOT_FOUND` renders inline not-found copy and request id;
6. network/503 renders safe inline error and «Повторить»;
7. retry calls `query.refetch`;
8. eligible user receives `ApprovalRequestDecision`;
9. author/terminal/permissionless user does not receive decision controls;
10. raw server detail is absent.

- [ ] **Step 2: Implement the action hub**

`ApprovalRequestsPage` renders:

```text
Согласование
Создавайте запросы или открывайте существующие по ID.

[Создать запрос] [Открыть по ID]
```

Use existing `Card` compositions and the existing Base UI Button contract:

```tsx
<Button
  nativeButton={false}
  render={<Link to={createApprovalRequestPath} />}
>
  Создать запрос
</Button>
<Button
  variant="outline"
  nativeButton={false}
  render={<Link to={openApprovalRequestPath} />}
>
  Открыть по ID
</Button>
```

Render the two Cards as a vertical action-row stack, not a dashboard grid. Do
not use `asChild`.

- [ ] **Step 3: Implement create and open route pages**

Each page owns heading/help copy and composes exactly one feature:

```tsx
<section className="mx-auto max-w-2xl space-y-6">
  <header className="space-y-2">
    <h1 className="text-2xl font-semibold">Создать запрос</h1>
    <p className="text-muted-foreground">
      Опишите действие, для которого требуется решение.
    </p>
  </header>
  <CreateApprovalRequestForm />
</section>
```

and the equivalent `OpenApprovalRequestForm`. Do not duplicate feature form
logic in the page. Both page headers include a visible «К согласованию» link to
`approvalRequestsPath`.

- [ ] **Step 4: Implement a param boundary before the detail query**

Split the page so hook order stays valid:

```tsx
export function ApprovalRequestDetailsPage() {
  const params = useParams()
  const parsed = approvalRequestPathSchema.safeParse(params)

  return parsed.success ? (
    <ApprovalRequestDetails requestId={parsed.data.requestId} />
  ) : (
    <ApprovalRequestUnavailable />
  )
}
```

`ApprovalRequestDetails` is a private component and is the only component that
calls `useApprovalRequest`.

- [ ] **Step 5: Implement explicit detail states**

Order:

1. `query.isPending` → spinner and «Загружаем запрос»;
2. `query.isError`:
   - `APPROVAL_REQUEST_NOT_FOUND` → inline unavailable state;
   - network/503/internal → safe alert and retry button;
   - protocol → safe non-retryable alert;
   - authentication is already thrown by entity hook to `RouteError`;
3. success → detail card and decision feature.

Render:

```text
К согласованию
title
id
status badge
description
createdByUserId
createdAt
decidedByUserId or Решение ещё не принято
decidedAt or Решение ещё не принято
```

Use `formatApprovalRequestDate` for non-null timestamps. Read
`useCurrentSession()` only in the success component that passes `currentUser`
to `ApprovalRequestDecision`.

- [ ] **Step 6: Convert the router to a protected parent**

Keep `loadSession` and the existing loader factories. Replace the flat private
route with:

```tsx
{
  path: '/',
  loader: createRequireSessionLoader({
    load: loadSession,
    clear: () => clearCurrentSession(queryClient),
  }),
  element: <ProtectedLayout />,
  errorElement: <RouteError />,
  children: [
    { index: true, element: <DashboardPage /> },
    {
      path: 'approval-requests',
      element: <ApprovalRequestsPage />,
    },
    {
      path: 'approval-requests/new',
      element: <ApprovalRequestCreatePage />,
    },
    {
      path: 'approval-requests/open',
      element: <ApprovalRequestOpenPage />,
    },
    {
      path: 'approval-requests/:requestId',
      element: <ApprovalRequestDetailsPage />,
    },
  ],
}
```

Keep `/login` as a sibling route with
`createRedirectAuthenticatedLoader`.

- [ ] **Step 7: Expand router tests**

In addition to the existing cached-session revalidation test, cover:

1. unauthenticated deep link
   `/approval-requests/{id}` redirects to
   `/login?returnTo=%2Fapproval-requests%2F{id}`;
2. authenticated deep link first calls `/v1/auth/me`, then details GET;
3. session 401 clears cached session and CSRF before redirect;
4. `/approval-requests/new` and `/approval-requests/open` resolve to static
   pages, not the dynamic detail page;
5. parent loader runs once per navigation/revalidation boundary, not once per
   child component.

Dispose router after every test and clear the shared `queryClient`.

- [ ] **Step 8: Run focused and slice gates**

```bash
./node_modules/.bin/vitest run \
  src/pages/approval-request-details/ui/approval-request-details-page.test.tsx \
  src/app/router/router.test.ts \
  src/app/router/loaders.test.ts \
  src/app/router/route-error.test.tsx
./node_modules/.bin/eslint \
  src/pages/approval-requests \
  src/pages/approval-request-create \
  src/pages/approval-request-open \
  src/pages/approval-request-details \
  src/app/router
./node_modules/.bin/tsc -b
pnpm architecture
```

- [ ] **Step 9: Commit**

```bash
git add \
  src/pages/approval-requests \
  src/pages/approval-request-create \
  src/pages/approval-request-open \
  src/pages/approval-request-details \
  src/app/router/router.tsx \
  src/app/router/router.test.ts
git commit -m "feat(approval): add routed request workspace"
```

---

## Task 9: Document the extension path and verify the whole slice

**Model:** `gpt-5.6-terra`, reasoning `high`.

**Files:**

- Create: `docs/architecture/business-modules.md`
- Modify: `docs/architecture/ui-guidelines.md`
- Modify: `README.md`
- Source/test fixes found by gates are committed separately before the
  documentation commit.

- [ ] **Step 1: Write the business module guide**

`docs/architecture/business-modules.md` must explain the concrete happy path
before abstractions:

```text
Nest ApprovalRequestsModule
→ docs/api/openapi.json
→ frontend openapi/openapi.json
→ Orval shared/api
→ entity query/cache/presentation adapter
→ create/open/decide features
→ route pages
→ protected app shell
```

Include:

- backend contract ownership and `OPENAPI_SPEC_SOURCE`;
- exact commands `pnpm api:sync`, `pnpm api:generate`, `pnpm api:check`;
- FSD ownership table with real approval files;
- why generated hooks are hidden behind entity/feature APIs;
- query key ownership and create/decide cache writes;
- session loader, CSRF and permission behavior;
- stable error-code/pointer policy;
- a checklist for adding the next business module;
- explicit warning not to invent frontend capabilities absent from OpenAPI.

- [ ] **Step 2: Update README and UI policy**

README adds a short «Эталонный бизнес-модуль» section linking the guide and
listing the five private routes.

`docs/architecture/ui-guidelines.md` adds:

- app-wide layout belongs in `widgets`;
- route composition belongs in `pages`/`app`;
- irreversible shared action confirmation uses `AlertDialog`;
- multiline form input uses `TextareaField`;
- Base UI composition uses `render`, never Radix `asChild`.

- [ ] **Step 3: Run a focused full test pass**

```bash
./node_modules/.bin/vitest run \
  scripts/openapi/sync-openapi.test.mjs \
  src/shared/ui/textarea-field.test.tsx \
  src/entities/approval-request/api/approval-request.test.ts \
  src/entities/approval-request/model/approval-request-presentation.test.ts \
  src/features/create-approval-request/model/create-approval-request-errors.test.ts \
  src/features/create-approval-request/ui/create-approval-request-form.test.tsx \
  src/features/open-approval-request/ui/open-approval-request-form.test.tsx \
  src/features/decide-approval-request/model/decision-errors.test.ts \
  src/features/decide-approval-request/ui/approval-request-decision.test.tsx \
  src/widgets/app-shell/ui/app-shell.test.tsx \
  src/pages/approval-request-details/ui/approval-request-details-page.test.tsx \
  src/app/router/router.test.ts
```

- [ ] **Step 4: Run aggregate gates**

Run each command separately and preserve its output:

```bash
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
git diff --check
```

Then run the aggregate gate:

```bash
pnpm check
```

Do not substitute an older focused PASS for a failed aggregate gate.

- [ ] **Step 5: Run browser QA against the frontend**

Start:

```bash
VITE_API_BASE_URL=http://localhost:3000 \
  pnpm dev -- --host 127.0.0.1 --port 5173
```

With MSW/test doubles only if the normal dev setup already provides them;
otherwise connect the real reference backend in Step 6. Verify at desktop and
mobile widths:

1. `/login` has no protected sidebar;
2. authenticated `/` shows app shell;
3. desktop nav active states are correct;
4. mobile trigger opens/closes the navigation drawer;
5. create form local validation and loading state;
6. open form rejects malformed UUID;
7. detail loading, success, not-found and retry states;
8. approve/reject require confirmation;
9. focus moves into dialog and returns to trigger after cancel;
10. pending decision cannot be submitted twice;
11. logout still clears session and navigates to login;
12. reload and browser back/forward preserve the C1 route-driven flow.

Record browser QA separately from automated gates.

- [ ] **Step 6: Attempt the real-backend smoke without changing backend**

Use the clean persistent worktree:

```text
/Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests
```

First verify it still points to the reviewed backend:

```bash
git -C /Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests \
  status --short --branch
git -C /Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests \
  rev-parse HEAD
```

Expected branch is `feat/reference-approval-requests`; reviewed HEAD is
`df2c98f1f7cf932660712930f590a10155a0f9e1`. If HEAD moved, re-run the OpenAPI
and runtime contract inspection before smoke.

Start infrastructure without creating or editing backend `.env`:

```bash
cd /Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests
docker compose --env-file .env.example up -d --wait postgres redis-coordination
DOTENV_CONFIG_PATH=.env.example pnpm start:migrate
```

Provision two distinct users. Enter strong test passwords through the hidden
prompt; never place them in the command, plan, logs or Task commentary:

```bash
DOTENV_CONFIG_PATH=.env.example \
  pnpm auth:create-user -- --email=requester.frontend.20260729@example.com
DOTENV_CONFIG_PATH=.env.example \
  pnpm auth:create-user -- \
    --email=reviewer.frontend.20260729@example.com \
    --role=approval.reviewer
```

If either address already exists, do not delete or overwrite the user. Use an
unused local-only address and record only the non-secret email in smoke notes.

Start the API in its own terminal with the exact frontend origin:

```bash
cd /Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests
CORS_ORIGINS=http://localhost:5173 \
  DOTENV_CONFIG_PATH=.env.example \
  pnpm dev
```

Start the frontend in another terminal:

```bash
cd /Users/denischernykh/projects/starters/react-starter
VITE_API_BASE_URL=http://localhost:3000 \
  pnpm dev -- --host 127.0.0.1 --port 5173
```

Do not weaken auth, CSRF, permissions or seed guards to make smoke pass.

Required happy path:

1. sign in as author;
2. create a request;
3. copy returned UUID;
4. open the UUID directly;
5. verify author has no decision actions;
6. sign in as a distinct user with `approval.requests.decide`;
7. open the same UUID;
8. approve or reject through D2 confirmation;
9. verify returned server state and terminal UI;
10. retry the other decision and verify already-decided handling.

If Docker, database, seed users or runtime permissions are unavailable, report
the exact environment boundary. Do not claim real-backend PASS. If this Task
started the Compose services, stop them without deleting volumes:

```bash
cd /Users/denischernykh/projects/starters/nest-js-starter-worktrees/reference-approval-requests
docker compose --env-file .env.example stop postgres redis-coordination
```

Finish with a second backend `git status --short --branch`; source must remain
unchanged.

- [ ] **Step 7: TSDoc and scope audit**

List all changed exported handwritten APIs:

```bash
git diff f3e8e33 -- \
  'src/**/*.ts' 'src/**/*.tsx' \
  | rg '^\\+export (const|function|class|type|interface|enum)'
```

For each, verify Russian TSDoc against
`docs/architecture/tsdoc-guidelines.md`. Exclude Orval generated files and
unchanged upstream registry exports from manual documentation edits.

Confirm no accidental list/history/framework:

```bash
rg -n 'localStorage|recent.*request|approval.*list|asChild' src docs README.md
```

Review each match; approved non-business uses must be explained in Task notes.

- [ ] **Step 8: Commit documentation**

```bash
git add README.md docs/architecture/business-modules.md docs/architecture/ui-guidelines.md
git commit -m "docs(approval): explain business module integration"
```

If a fresh gate found a source defect, first fix it test-first and create a
separate narrowly scoped commit such as
`fix(approval): preserve detail cache identity`, containing only the exact
affected files. The documentation commit always contains documentation only.

---

## Task 10: Independent whole-branch review and final evidence

**Model:** `gpt-5.6-sol`, reasoning `xhigh`.

**Files:** Read all files changed since `f3e8e33`; modify only through
subsequent targeted fix workers.

- [ ] **Step 1: Prepare a bounded review packet**

```bash
git status --short --branch
git log --oneline f3e8e33..HEAD
git diff --stat f3e8e33..HEAD
git diff --check f3e8e33..HEAD
```

Include:

- approved design;
- this plan;
- full branch diff excluding `.superpowers/`;
- outputs from Task 9 aggregate gates;
- browser QA evidence;
- real-backend smoke evidence or explicit boundary.

- [ ] **Step 2: Ask the independent reviewer to check**

The `gpt-5.6-sol`, `xhigh` review must check:

1. exact backend operation/DTO/error contract;
2. no invented list capability;
3. generated/handwritten/FSD boundaries;
4. session-before-business request ordering;
5. query key identity and server-response cache writes;
6. auth revalidation and CSRF behavior;
7. permission plus self-decision rules;
8. no optimistic terminal state;
9. D2 confirmation and double-submit prevention;
10. safe Problem Details presentation;
11. Base UI `render` composition;
12. mobile/sidebar accessibility;
13. route deep links and static-vs-dynamic precedence;
14. conditional JSX rules;
15. Russian TSDoc coverage;
16. tests that prove behavior instead of implementation details;
17. generated drift and aggregate gates;
18. unintended edits/untracked files.

Reviewer returns findings ordered by severity with exact file/line references.
No finding-free statement is accepted without mentioning the reviewed diff and
gate evidence.

- [ ] **Step 3: Fix findings through the model escalation policy**

For every valid finding:

1. add or adjust a failing regression test;
2. run it and confirm RED when applicable;
3. implement the minimal fix;
4. rerun focused gate;
5. rerun affected aggregate gate;
6. commit with `git commit -m "fix(approval): address independent review"`;
7. send the new diff back to the same whole-branch reviewer.

Do not fold unrelated refactors into review fixes.

- [ ] **Step 4: Run the final fresh gates**

After the final reviewer returns no actionable findings:

```bash
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
pnpm check
git diff --check f3e8e33..HEAD
git status --short --branch
```

Expected final status contains no tracked changes. The pre-existing
`.superpowers/` may remain untracked and must be reported, not committed or
deleted.

- [ ] **Step 5: Final handoff**

Report separately:

- implemented routes and business actions;
- focused test evidence;
- aggregate local gates;
- browser QA;
- real-backend smoke;
- unresolved environment boundaries;
- branch/commit range;
- untracked `.superpowers/`;
- confirmation that no push/PR/deployment was performed.

## Acceptance criteria

- Frontend snapshot contains the exact three approval operations and committed
  generated clients/schemas.
- Sync validation fails if any approval operation or operationId drifts.
- UI uses generated DTO/Zod contracts and hides generated hooks.
- C1 routes work with direct URLs, reload and back/forward.
- Protected parent verifies session before any detail GET.
- Sidebar works on desktop and as a mobile drawer.
- Existing custom Button/Input/Separator contracts are preserved byte-for-byte
  during registry addition.
- Create validates locally, maps server pointers, writes detail cache and
  navigates without list invalidation.
- Open validates UUID and navigates without issuing a request itself.
- Detail exposes explicit loading/success/not-found/retry states.
- Permissionless users, authors and terminal requests have no decision actions.
- Eligible reviewers confirm approve/reject through D2 AlertDialog.
- Decision is non-optimistic, uses returned server DTO, prevents duplicate
  submission, and refetches after already-decided conflict.
- Auth failures re-enter the existing loader/session-clear path.
- UI never exposes arbitrary server `detail`.
- New exported handwritten APIs have meaningful Russian TSDoc.
- Steiger, tests, build, API drift and formatting gates pass on fresh output.
- Business-module guide explains how to repeat the pattern for the next module.
- Browser QA and real-backend smoke are reported independently.
- No backend modification, push, PR or deployment occurs.
