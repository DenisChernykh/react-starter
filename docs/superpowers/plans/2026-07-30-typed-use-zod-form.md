# Typed `useZodForm` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить типизированный UI-agnostic `useZodForm`, перевести на него три существующие формы и опубликовать проверенный PR в `stage`.

**Architecture:** Новый `src/shared/lib/form` владеет только связкой React Hook Form и Zod resolver. Hook сохраняет `z.input<TSchema>` для form state и `z.output<TSchema>` для успешного submit, а feature-consumers продолжают владеть mutation, navigation, reset и server errors.

**Tech Stack:** React 19, TypeScript 6, React Hook Form 7.83.0, `@hookform/resolvers` 5.5.7, Zod 4.4.3, Vitest 4, Testing Library.

## Global Constraints

- Выполнять команды на Node `24.18.0` и pnpm `11.15.1`.
- Не добавлять и не обновлять зависимости.
- Не использовать `any`, type assertion или widened resolver.
- Не редактировать `src/shared/api/generated/**` и `src/shared/api/generated-zod/**`.
- Сохранить существующий global `z.config(ru())`.
- Не задавать shared defaults для validation mode, default values, reset или server-error policy.
- Не добавлять UI adapter, schema factory, новый form framework или e2e-тесты.
- Новый и изменённый handwritten export должен иметь содержательный русский TSDoc.
- Условный JSX без альтернативной ветки использует булево условие и `&&`.
- Финальное доказательство source-готовности — свежий `pnpm check`.
- Доставка: ready PR из `feat/typed-use-zod-form` в `stage` с `Closes #7`; merge не выполнять.

---

## File Map

| File                                                                       | Responsibility                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/lib/form/use-zod-form.ts`                                      | Типизированная связка Zod schema с React Hook Form.                    |
| `src/shared/lib/form/index.ts`                                             | Public API shared form library.                                        |
| `src/shared/lib/form/use-zod-form.test.tsx`                                | Runtime и type evidence для input/output transform и generated schema. |
| `src/features/auth-login/ui/login-form.tsx`                                | Consumer login schema и существующей login policy.                     |
| `src/features/create-approval-request/ui/create-approval-request-form.tsx` | Consumer create schema и существующих mutation/error invariants.       |
| `src/features/open-approval-request/ui/open-approval-request-form.tsx`     | Consumer generated path schema и navigation policy.                    |

## Task 1: Добавить typed shared hook через RED/GREEN

**Files:**

- Create: `src/shared/lib/form/use-zod-form.test.tsx`
- Create: `src/shared/lib/form/use-zod-form.ts`
- Create: `src/shared/lib/form/index.ts`

**Interfaces:**

- Consumes:
  - `zodResolver<Input, unknown, Output>(schema)`
  - `useForm<TFieldValues, unknown, TTransformedValues>(options)`
  - `approvalRequestPathSchema` из `@/shared/api`
- Produces:
  - `useZodForm<TSchema>(schema, options?): UseFormReturn<ZodFormInput<TSchema>, unknown, z.output<TSchema>>`
  - public import `@/shared/lib/form`

- [ ] **Step 1: Написать failing focused tests**

Создать `src/shared/lib/form/use-zod-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'

import { approvalRequestPathSchema } from '@/shared/api'

import { useZodForm } from '.'

const transformedSchema = z.strictObject({
  amount: z
    .string()
    .trim()
    .transform((value) => Number(value)),
})

function TransformedForm({
  onSubmit,
}: {
  onSubmit: (value: z.output<typeof transformedSchema>) => void
}) {
  const form = useZodForm(transformedSchema, {
    defaultValues: { amount: '' },
  })
  const rawAmount = form.watch('amount')

  expectTypeOf(rawAmount).toEqualTypeOf<string>()

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <input aria-label="Количество" {...form.register('amount')} />
      <output data-testid="raw-amount">{JSON.stringify(rawAmount)}</output>
      <button type="submit">Сохранить</button>
    </form>
  )
}

function GeneratedSchemaForm({
  onSubmit,
}: {
  onSubmit: (value: z.output<typeof approvalRequestPathSchema>) => void
}) {
  const form = useZodForm(approvalRequestPathSchema, {
    defaultValues: { requestId: '' },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <input aria-label="ID запроса" {...form.register('requestId')} />
      <button type="submit">Открыть</button>
    </form>
  )
}

describe('useZodForm', () => {
  it('keeps Zod input in form state and submits transformed output', async () => {
    const onSubmit =
      vi.fn<(value: z.output<typeof transformedSchema>) => void>()
    const user = userEvent.setup()

    render(<TransformedForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Количество'), ' 42 ')

    expect(screen.getByTestId('raw-amount')).toHaveTextContent('" 42 "', {
      normalizeWhitespace: false,
    })

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ amount: 42 })
  })

  it('accepts a generated OpenAPI Zod schema', async () => {
    const requestId = 'C9C6CBCA-47E6-4AB0-932E-30F7A0E97184'
    const onSubmit =
      vi.fn<(value: z.output<typeof approvalRequestPathSchema>) => void>()
    const user = userEvent.setup()

    render(<GeneratedSchemaForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('ID запроса'), requestId)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))

    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ requestId })
  })
})
```

- [ ] **Step 2: Запустить test и подтвердить корректный RED**

Run:

```bash
pnpm exec vitest run src/shared/lib/form/use-zod-form.test.tsx
```

Expected: FAIL, потому что public module `src/shared/lib/form/index.ts` и
`useZodForm` ещё не существуют. Ошибка не должна быть вызвана test typo или
невалидным test environment.

- [ ] **Step 3: Реализовать минимальный hook**

Создать `src/shared/lib/form/use-zod-form.ts`:

```ts
import { zodResolver } from '@hookform/resolvers/zod'
import {
  useForm,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form'
import { type z } from 'zod'

type ZodFormInput<TSchema extends z.ZodType> =
  z.input<TSchema> extends FieldValues ? z.input<TSchema> : never

type ZodFormSchema<TSchema extends z.ZodType> = z.ZodType<
  z.output<TSchema>,
  ZodFormInput<TSchema>
>

type UseZodFormOptions<TSchema extends z.ZodType> = Omit<
  UseFormProps<ZodFormInput<TSchema>, unknown, z.output<TSchema>>,
  'resolver'
>

/**
 * Создаёт React Hook Form с типизированным Zod resolver.
 *
 * @remarks Hook подключает `zodResolver` внутри, но не задаёт validation mode,
 * default values, reset или server-error policy: ими владеет конкретная форма.
 * @returns Form API, где controls используют `z.input<TSchema>`, а успешный
 * submit получает `z.output<TSchema>`.
 */
export function useZodForm<TSchema extends z.ZodType>(
  schema: TSchema & ZodFormSchema<TSchema>,
  options?: UseZodFormOptions<TSchema>,
): UseFormReturn<ZodFormInput<TSchema>, unknown, z.output<TSchema>> {
  return useForm<ZodFormInput<TSchema>, unknown, z.output<TSchema>>({
    ...options,
    resolver: zodResolver<ZodFormInput<TSchema>, unknown, z.output<TSchema>>(
      schema,
    ),
  })
}
```

Создать `src/shared/lib/form/index.ts`:

```ts
export { useZodForm } from './use-zod-form'
```

- [ ] **Step 4: Запустить focused test и typecheck**

Run:

```bash
pnpm exec vitest run src/shared/lib/form/use-zod-form.test.tsx
pnpm exec tsc -b
```

Expected:

- 2 focused tests PASS;
- TypeScript принимает generated schema и transform без `any`, `as` или
  resolver widening.

- [ ] **Step 5: Проверить formatting и запрещённые обходы**

Run:

```bash
pnpm exec prettier --write src/shared/lib/form
rg -n '\bany\b|\bas\b|@ts-ignore|@ts-expect-error' src/shared/lib/form
git diff --check
```

Expected:

- Prettier не меняет контракт;
- `rg` не находит запрещённых обходов;
- `git diff --check` не выводит ошибок.

- [ ] **Step 6: Закоммитить independently testable hook**

```bash
git add src/shared/lib/form
git commit -m "feat(forms): add typed useZodForm"
```

## Task 2: Перевести три form consumers без изменения поведения

**Files:**

- Modify: `src/features/auth-login/ui/login-form.tsx`
- Modify: `src/features/create-approval-request/ui/create-approval-request-form.tsx`
- Modify: `src/features/open-approval-request/ui/open-approval-request-form.tsx`
- Test: `src/features/auth-login/ui/login-form.test.tsx`
- Test: `src/features/create-approval-request/ui/create-approval-request-form.test.tsx`
- Test: `src/features/open-approval-request/ui/open-approval-request-form.test.tsx`

**Interfaces:**

- Consumes:
  - `useZodForm` из `@/shared/lib/form`
  - `authLoginSchema`
  - `approvalRequestCreateSchema`
  - `approvalRequestPathSchema`
- Produces:
  - три runtime consumers shared hook;
  - отсутствие feature-level прямой связки `useForm + zodResolver`.

- [ ] **Step 1: Зафиксировать зелёные characterization tests до refactor**

Run:

```bash
pnpm exec vitest run \
  src/features/auth-login/ui/login-form.test.tsx \
  src/features/create-approval-request/ui/create-approval-request-form.test.tsx \
  src/features/open-approval-request/ui/open-approval-request-form.test.tsx
```

Expected: все существующие login/create/open scenarios PASS до изменения
implementation. Эти тесты фиксируют navigation, validation, API-error,
duplicate-submit и cache/session behavior, которые refactor не должен менять.

- [ ] **Step 2: Мигрировать `LoginForm`**

В `src/features/auth-login/ui/login-form.tsx`:

```ts
// удалить
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

// добавить
import { useZodForm } from '@/shared/lib/form'
```

Заменить создание form:

```ts
} = useZodForm(authLoginSchema)
```

Сохранить `LoginRequestDto`: он нужен allowlist assertion в server field-error
mapping. Не менять mutation, `returnTo`, safe error copy или JSX.

- [ ] **Step 3: Мигрировать `CreateApprovalRequestForm`**

В `src/features/create-approval-request/ui/create-approval-request-form.tsx`:

```ts
// удалить
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

// добавить
import { useZodForm } from '@/shared/lib/form'
```

Заменить создание form:

```ts
} = useZodForm(approvalRequestCreateSchema)
```

Сохранить `CreateApprovalRequestDto`, synchronous duplicate-submit ref,
`AUTHENTICATION_REQUIRED` revalidation, cache/navigation mutation и safe field
error mapping без изменений.

- [ ] **Step 4: Мигрировать `OpenApprovalRequestForm`**

В `src/features/open-approval-request/ui/open-approval-request-form.tsx`:

```ts
// удалить
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

// добавить
import { useZodForm } from '@/shared/lib/form'
```

Заменить:

```ts
import { approvalRequestPathSchema } from '@/shared/api'
```

и создание form:

```ts
} = useZodForm(approvalRequestPathSchema)
```

Удалить теперь неиспользуемый `ApprovalRequestsGetPathParameters`. Сохранить
точное написание UUID при navigation.

- [ ] **Step 5: Запустить consumer regression tests**

Run:

```bash
pnpm exec vitest run \
  src/features/auth-login/ui/login-form.test.tsx \
  src/features/create-approval-request/ui/create-approval-request-form.test.tsx \
  src/features/open-approval-request/ui/open-approval-request-form.test.tsx
pnpm exec tsc -b
```

Expected:

- все прежние scenarios PASS;
- TypeScript выводит input/output из generated schemas без явных form
  generics.

- [ ] **Step 6: Проверить adoption boundary и TSDoc**

Run:

```bash
rg -n 'zodResolver|useForm' src/features
rg -n 'useZodForm' src/features src/shared/lib/form
pnpm exec eslint \
  src/shared/lib/form \
  src/features/auth-login/ui/login-form.tsx \
  src/features/create-approval-request/ui/create-approval-request-form.tsx \
  src/features/open-approval-request/ui/open-approval-request-form.tsx
```

Expected:

- первый `rg` не выводит прямых feature imports;
- второй `rg` показывает public hook и три consumers;
- ESLint подтверждает hooks/TSDoc/JSX rules.

- [ ] **Step 7: Закоммитить consumer migration**

```bash
git add \
  src/features/auth-login/ui/login-form.tsx \
  src/features/create-approval-request/ui/create-approval-request-form.tsx \
  src/features/open-approval-request/ui/open-approval-request-form.tsx
git commit -m "refactor(forms): adopt shared useZodForm"
```

## Task 3: Выполнить полный gate и опубликовать PR

**Files:**

- Verify: all tracked changes from `stage...HEAD`
- Verify unchanged: `openapi/openapi.json`
- Verify unchanged: `src/shared/api/generated/**`
- Verify unchanged: `src/shared/api/generated-zod/**`

**Interfaces:**

- Consumes:
  - commits design, plan, hook и consumer migration;
  - aggregate `pnpm check`.
- Produces:
  - published branch `feat/typed-use-zod-form`;
  - ready PR в `stage`, связанный с issue #7.

- [ ] **Step 1: Отформатировать только handwritten changed files**

Run:

```bash
pnpm exec prettier --write \
  docs/superpowers/specs/2026-07-30-typed-use-zod-form-design.md \
  docs/superpowers/plans/2026-07-30-typed-use-zod-form.md \
  src/shared/lib/form \
  src/features/auth-login/ui/login-form.tsx \
  src/features/create-approval-request/ui/create-approval-request-form.tsx \
  src/features/open-approval-request/ui/open-approval-request-form.tsx
git diff --check
```

Expected: formatting clean; generated files не входят в команду.

- [ ] **Step 2: Запустить единый финальный gate на pinned runtime**

Run:

```bash
node --version
pnpm --version
pnpm check
```

Expected:

- Node `v24.18.0`;
- pnpm `11.15.1`;
- OpenAPI drift, formatting, ESLint, Steiger, все tests и production build
  PASS.

- [ ] **Step 3: Провести финальный source и generated-boundary review**

Run:

```bash
git status --short --branch
git diff --stat stage...HEAD
git diff --name-only stage...HEAD
git diff --exit-code stage...HEAD -- \
  openapi/openapi.json \
  src/shared/api/generated \
  src/shared/api/generated-zod
git log --oneline --decorate stage..HEAD
```

Expected:

- worktree clean;
- diff содержит только design/plan, shared hook/tests и три consumers;
- generated-boundary diff пуст;
- история состоит из focused commits.

- [ ] **Step 4: Выполнить verification-before-completion**

Прочитать и применить `superpowers:verification-before-completion`. Не
заявлять PASS или готовность без свежего вывода Step 2 и Step 3.

- [ ] **Step 5: Опубликовать feature branch**

```bash
git push -u origin feat/typed-use-zod-form
```

Expected: remote branch указывает на проверенный local HEAD.

- [ ] **Step 6: Создать ready PR через GitHub connector**

Target:

```text
repository: DenisChernykh/react-starter
base: stage
head: feat/typed-use-zod-form
draft: false
title: feat(forms): добавить типизированный useZodForm
```

Body:

```markdown
## Что сделано

- Добавлен UI-agnostic `useZodForm` с раздельными `z.input` и `z.output`.
- Resolver закрыт внутри shared hook, form policy остаётся у consumers.
- Login, create approval request и open approval request переведены на shared API.
- Добавлены focused tests для transform и generated OpenAPI Zod schema.

## Проверка

- `pnpm check`

Closes #7
```

Expected: GitHub возвращает URL ready PR в `stage`.

- [ ] **Step 7: Проверить опубликованное состояние**

Проверить через GitHub connector:

- base/head и draft state;
- remote HEAD совпадает с local HEAD;
- PR связан с issue #7;
- фактический CI status.

Если CI ещё выполняется, сообщить `pending`, а не `green`. Merge не выполнять.
