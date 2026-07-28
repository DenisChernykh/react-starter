# Shadcn UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Инициализировать Base UI-вариант shadcn с preset `b3Rs9tMDg`, добавить проектные UI-контракты и применить их в существующем auth/dashboard-срезе.

**Architecture:** Registry-компоненты shadcn живут в `src/shared/ui` и остаются близкими к upstream-коду. Повторяемое проектное поведение добавляется поверх них через `Button isLoading`, `TextField`, `PasswordField` и `Container`; feature/page-слои только потребляют эти контракты и сохраняют существующую auth-бизнес-логику.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS v4, shadcn CLI v4, Base UI, Lyra preset, React Hook Form, Vitest, Testing Library, Steiger.

## Global Constraints

- Рабочая ветка: `feat/shadcn-ui-foundation`, база: актуальный `origin/stage` commit `7b15ce9`.
- Node.js: `24.18.0`; pnpm: `11.15.1`.
- shadcn base задаётся явно как `base`; preset задаётся дословно как `b3Rs9tMDg`.
- Ожидаемый стиль в `components.json`: `base-lyra`; base color: `taupe`; theme: `blue`; icon library: `lucide`; font: `inter`; radius: `default`.
- Registry UI path: `src/shared/ui`; utils path: `src/shared/lib/utils.ts`; global CSS: `src/app/styles/index.css`.
- Использовать только `button`, `spinner`, `input`, `field`, `input-group`, `card` и `alert`; не устанавливать registry-компоненты «на будущее».
- `Button isLoading` показывает spinner, сохраняет ширину, блокирует кнопку, выставляет `aria-busy` и использует невидимый `loadingLabel`.
- `Input` остаётся низкоуровневым registry-примитивом; label/error/password behavior живёт в проектных композициях.
- `TextField` и `PasswordField` сохраняют native input props и React Hook Form registration.
- `Container` использует `container mx-auto px-4 sm:px-6 lg:px-8`, не задаёт vertical spacing и не имеет size variants.
- Для условного JSX без альтернативы использовать `&&`; перед `&&` допускается только boolean.
- Новые и изменённые рукописные exported API получают содержательный русскоязычный TSDoc; неизменённый registry-код вручную не документировать.
- Скопированный shadcn registry-код — редактируемый проектный source, а не автоматически перегенерируемый Orval artifact.
- Не изменять auth, CSRF, navigation, API mapping и session-cache behavior.
- Не читать и не переносить пользовательский `.env`; сохранить tracked `.env.example`.
- Не добавлять floating label, Storybook/UI Lab, dark-mode toggle, masks, formatter/parser или async field validation.
- Не публиковать ветку и не создавать PR без отдельного запроса.
- PASS заявлять только по свежему выводу; если pnpm preflight падает до целевой команды, запускать эквивалентный бинарник из `node_modules/.bin` и явно фиксировать границу.

---

## File Map

### Configuration and registry foundation

- `components.json` — Base UI, `base-lyra`, preset-derived config и FSD aliases.
- `package.json`, `pnpm-lock.yaml` — зависимости, добавленные shadcn CLI.
- `tsconfig.json`, `tsconfig.app.json` — согласованный `@/*` alias для CLI, editor и build.
- `src/app/styles/index.css` — Tailwind v4 imports, Lyra theme tokens и существующие browser baseline rules.
- `src/shared/lib/utils.ts` — `cn(...inputs)` для `clsx` + `tailwind-merge`.
- `src/shared/lib/utils.test.ts` — conflict/conditional class contract.
- `src/shared/ui/{alert,button,card,field,input,input-group,spinner}.tsx` — registry sources.
- `src/shared/ui/index.ts` — public shared UI exports.

### Project-owned UI contracts

- `src/shared/ui/button.test.tsx` — loading/disabled/accessibility contract.
- `src/shared/ui/container.tsx`, `container.test.tsx` — horizontal page layout primitive.
- `src/shared/ui/field-a11y.ts` — shared id/description/error metadata for form composites.
- `src/shared/ui/text-field.tsx`, `text-field.test.tsx` — label/description/error/native-input composition.
- `src/shared/ui/password-field.tsx`, `password-field.test.tsx` — reveal toggle over `InputGroup`.

### Vertical adoption and policy

- `src/features/auth-login/ui/login-form.tsx`, `login-form.test.tsx` — field/button/alert adoption.
- `src/features/auth-logout/ui/logout-button.tsx`, `logout-button.test.tsx` — loading button and alert adoption.
- `src/pages/login/ui/login-page.tsx` — `Container` + `Card`.
- `src/pages/dashboard/ui/dashboard-page.tsx` — `Container`.
- `src/app/router/route-error.tsx`, `route-error.test.tsx` — `Container` + `Alert` + retry `Button`.
- `src/shared/ui/error-message.tsx` — delete after final consumer migration.
- `.gitignore` — ignore `.env` families, keep `.env.example`.
- `docs/architecture/ui-guidelines.md` — reusable UI ownership rules.
- `AGENTS.md` — short UI policy and link to the architecture guide.

---

### Task 1: Initialize the Base UI Lyra foundation

**Files:**

- Create: `components.json`
- Create: `src/shared/lib/utils.ts`
- Create: `src/shared/lib/utils.test.ts`
- Create: `src/shared/ui/alert.tsx`
- Create: `src/shared/ui/button.tsx`
- Create: `src/shared/ui/card.tsx`
- Create: `src/shared/ui/field.tsx`
- Create: `src/shared/ui/input.tsx`
- Create: `src/shared/ui/input-group.tsx`
- Create: `src/shared/ui/spinner.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Modify: `tsconfig.app.json`
- Modify: `src/app/styles/index.css`
- Modify: `src/app/styles/tailwind.test.ts`
- Modify: `src/shared/ui/index.ts`

**Interfaces:**

- Consumes: existing Vite/Tailwind integration, alias `@/*`, `src/app/styles/index.css`.
- Produces: `cn(...inputs: ClassValue[]): string`; registry `Alert`, `Button`, `Card`, `Field`, `Input`, `InputGroup`, `Spinner`; semantic Lyra tokens; `components.json` aliases used by later CLI calls.

- [ ] **Step 1: Add failing utility and theme-source tests**

Create `src/shared/lib/utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('cn', () => {
  it('merges conditional classes and lets the last Tailwind utility win', () => {
    expect(cn('px-2 text-sm', false, ['px-4', { 'font-medium': true }])).toBe(
      'text-sm px-4 font-medium',
    )
  })
})
```

Extend `src/app/styles/tailwind.test.ts` with a raw-source import and a second
test:

```ts
import sourceCss from './index.css?raw'

it('contains the shadcn Lyra semantic theme contract', () => {
  expect(sourceCss).toContain("@import 'shadcn/tailwind.css'")
  expect(sourceCss).toContain('--background:')
  expect(sourceCss).toContain('--primary:')
  expect(sourceCss).toContain('--border:')
})
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
source /Users/denischernykh/.nvm/nvm.sh
nvm use --silent 24.18.0
./node_modules/.bin/vitest run \
  src/shared/lib/utils.test.ts \
  src/app/styles/tailwind.test.ts
```

Expected: FAIL because `src/shared/lib/utils.ts` does not exist and the CSS does
not import the shadcn Tailwind layer.

- [ ] **Step 3: Make the alias visible to the current shadcn CLI**

Add the root alias to `tsconfig.json` without changing project references:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Add `"baseUrl": "."` beside `paths` in `tsconfig.app.json` so the root config,
editor and application build resolve the alias identically.

- [ ] **Step 4: Initialize shadcn with the approved base and preset**

Run from the worktree root:

```bash
source /Users/denischernykh/.nvm/nvm.sh
nvm use --silent 24.18.0
pnpm dlx shadcn@latest init \
  --base base \
  --preset b3Rs9tMDg \
  --yes
```

Inspect `components.json` before proceeding. It must resolve to this contract:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-lyra",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/styles/index.css",
    "baseColor": "taupe",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/shared/ui",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/lib/hooks"
  },
  "registries": {}
}
```

Preserve additional preset fields emitted by the current schema when their
values correspond to `theme=blue`, `chartColor=lime`, `radius=default`,
`menuAccent=subtle`, and `menuColor=default`. Do not accept aliases pointing to
`@/components/ui` or a second CSS entrypoint.

- [ ] **Step 5: Add only the registry components required by this slice**

Run:

```bash
pnpm dlx shadcn@latest add \
  button spinner input field input-group card alert \
  --yes
```

Expected:

- sources are written under `src/shared/ui`;
- imports resolve through `@/shared/lib/utils`;
- Base UI implementations are selected;
- package and lockfile include only the dependencies required by these items.

Do not hand-edit the registry components in this task. Project changes to
`Button` belong to Task 2.

- [ ] **Step 6: Preserve the starter browser baseline in the generated CSS**

After CLI generation, keep the preset imports/tokens and restore these
starter-specific rules if the CLI removed them:

```css
@theme inline {
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  :root {
    font-family: var(--font-sans);
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

Use semantic theme colors supplied by the preset for page foreground and
background; do not restore the old hard-coded `#18181b` and `#fafafa`.

- [ ] **Step 7: Export the registry surface and implement `cn`**

If the CLI did not create the exact utility, set
`src/shared/lib/utils.ts` to:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Объединяет условные class names и разрешает конфликты Tailwind utilities.
 *
 * @param inputs Строки и условные значения в формате, поддерживаемом `clsx`.
 * @returns Нормализованная строка классов, где более поздний Tailwind utility
 * переопределяет конфликтующий ранний.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Update `src/shared/ui/index.ts` with explicit exports for:

```ts
export { Alert, AlertDescription, AlertTitle } from './alert'
export { Button, buttonVariants } from './button'
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'
export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from './field'
export { Input } from './input'
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from './input-group'
export { Spinner } from './spinner'
```

Match the actual names produced by the current registry. If a listed name does
not exist, do not invent it: remove only that unused barrel export and record
the registry difference in the task report.

- [ ] **Step 8: Run focused verification and make GREEN**

Run:

```bash
./node_modules/.bin/vitest run \
  src/shared/lib/utils.test.ts \
  src/app/styles/tailwind.test.ts
./node_modules/.bin/eslint \
  src/shared/lib/utils.ts \
  src/shared/ui \
  src/app/styles/tailwind.test.ts
./node_modules/.bin/tsc -b
git diff --check
```

Expected: focused tests PASS, ESLint has no errors or TSDoc warnings for
handwritten exports, TypeScript succeeds, and the diff has no whitespace
errors.

- [ ] **Step 9: Commit the foundation**

```bash
git add \
  components.json \
  package.json \
  pnpm-lock.yaml \
  tsconfig.json \
  tsconfig.app.json \
  src/app/styles/index.css \
  src/app/styles/tailwind.test.ts \
  src/shared/lib/utils.ts \
  src/shared/lib/utils.test.ts \
  src/shared/ui
git commit -m "feat(ui): initialize Base UI Lyra foundation"
```

---

### Task 2: Add the project-owned shared UI contracts

**Files:**

- Create: `src/shared/ui/button.test.tsx`
- Create: `src/shared/ui/container.tsx`
- Create: `src/shared/ui/container.test.tsx`
- Create: `src/shared/ui/field-a11y.ts`
- Create: `src/shared/ui/text-field.tsx`
- Create: `src/shared/ui/text-field.test.tsx`
- Create: `src/shared/ui/password-field.tsx`
- Create: `src/shared/ui/password-field.test.tsx`
- Modify: `src/shared/ui/button.tsx`
- Modify: `src/shared/ui/index.ts`

**Interfaces:**

- Consumes: Task 1 `cn`, `Button`, `Spinner`, `Field`, `Input`, `InputGroup` APIs.
- Produces:
  - `Button` with `isLoading?: boolean` and `loadingLabel?: string`;
  - `Container({ as?: 'div' | 'main' | 'section', ...nativeProps })`;
  - `TextField({ label, description?, error?, ...inputProps })`;
  - `PasswordField` with the same field contract except fixed password/text type.

- [ ] **Step 1: Write failing `Button` and `Container` contract tests**

Create `src/shared/ui/button.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('renders the ordinary label without busy state', () => {
    render(<Button>Сохранить</Button>)

    const button = screen.getByRole('button', { name: 'Сохранить' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(
      button.querySelector('[data-slot="spinner"]'),
    ).not.toBeInTheDocument()
  })

  it('shows only a spinner visually while preserving width and accessibility', () => {
    render(
      <Button isLoading loadingLabel="Сохраняем">
        Сохранить
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Сохраняем' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    expect(within(button).getByText('Сохранить')).toHaveClass('invisible')
  })

  it('keeps an explicitly disabled ordinary button disabled', () => {
    render(<Button disabled>Удалить</Button>)

    expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled()
  })
})
```

Create `src/shared/ui/container.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Container } from './container'

describe('Container', () => {
  it('renders a div with the stable horizontal layout contract by default', () => {
    render(<Container data-testid="container">Контент</Container>)

    const container = screen.getByTestId('container')
    expect(container.tagName).toBe('DIV')
    expect(container).toHaveAttribute('data-slot', 'container')
    expect(container).toHaveClass(
      'container',
      'mx-auto',
      'px-4',
      'sm:px-6',
      'lg:px-8',
    )
  })

  it('supports a semantic element, native props and class merging', () => {
    render(
      <Container as="main" aria-label="Основное" className="px-8 py-6">
        Контент
      </Container>,
    )

    const container = screen.getByRole('main', { name: 'Основное' })
    expect(container).toHaveClass('px-8', 'py-6')
    expect(container).not.toHaveClass('px-4')
  })
})
```

- [ ] **Step 2: Write failing field-composition tests**

Create `src/shared/ui/text-field.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TextField } from './text-field'

describe('TextField', () => {
  it('connects label, description and error to the native input', () => {
    render(
      <TextField
        label="Email"
        description="Рабочий адрес"
        error="Некорректный email"
        name="email"
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAttribute('name', 'email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain('description')
    expect(input.getAttribute('aria-describedby')).toContain('error')
    expect(screen.getByRole('alert')).toHaveTextContent('Некорректный email')
  })

  it('preserves native handlers and a caller aria-describedby without an error', () => {
    const onBlur = vi.fn()
    render(
      <>
        <p id="external-help">Внешняя подсказка</p>
        <TextField
          label="Имя"
          aria-describedby="external-help"
          onBlur={onBlur}
        />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Имя' })
    input.focus()
    input.blur()
    expect(onBlur).toHaveBeenCalledOnce()
    expect(input).toHaveAttribute('aria-describedby', 'external-help')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})
```

Create `src/shared/ui/password-field.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PasswordField } from './password-field'

describe('PasswordField', () => {
  it('toggles password visibility without losing the value or focus', async () => {
    const user = userEvent.setup()
    render(<PasswordField label="Пароль" autoComplete="current-password" />)

    const input = screen.getByLabelText('Пароль')
    await user.type(input, 'secret')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('secret')
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('secret')
  })
})
```

- [ ] **Step 3: Run the component tests and confirm RED**

Run:

```bash
./node_modules/.bin/vitest run \
  src/shared/ui/button.test.tsx \
  src/shared/ui/container.test.tsx \
  src/shared/ui/text-field.test.tsx \
  src/shared/ui/password-field.test.tsx
```

Expected: FAIL because `Button` does not accept `isLoading` and the three
project-owned components do not exist.

- [ ] **Step 4: Extend `Button` with the loading contract**

Adapt the Base UI registry component without replacing its variants or native
props. The render body must follow this structure:

```tsx
const busy = Boolean(isLoading)
const accessibleLabel = loadingLabel ?? 'Загрузка'

return (
  <ButtonPrimitive
    {...props}
    data-slot="button"
    aria-busy={busy || undefined}
    aria-label={busy ? accessibleLabel : ariaLabel}
    disabled={disabled || busy}
    className={cn(buttonVariants({ variant, size, className }), 'relative')}
  >
    <span
      data-slot="button-content"
      className={cn(
        'inline-flex items-center justify-center',
        busy && 'invisible',
      )}
    >
      {children}
    </span>
    {busy && (
      <span
        data-slot="button-loading"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <Spinner aria-hidden="true" />
      </span>
    )}
  </ButtonPrimitive>
)
```

Destructure `isLoading`, `loadingLabel`, `children`, `disabled`, `aria-label`
and `className` before spreading `props` so custom props never reach the DOM.
Spread remaining native props before derived accessibility/disabled/class
values so the loading contract cannot be accidentally overridden.
Add Russian TSDoc documenting width preservation, disabled behavior and
accessible loading label. Keep the registry variant names and sizes unchanged.

- [ ] **Step 5: Implement `Container`**

Create `src/shared/ui/container.tsx`:

```tsx
import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/utils'

type ContainerElement = 'div' | 'main' | 'section'

type ContainerProps = ComponentProps<'div'> & {
  as?: ContainerElement
}

/**
 * Ограничивает ширину page-level контента и задаёт адаптивные горизонтальные поля.
 *
 * @remarks Не добавляет vertical spacing: его задаёт экран через `className`.
 */
export function Container({
  as: Component = 'div',
  className,
  ...props
}: ContainerProps) {
  return (
    <Component
      data-slot="container"
      className={cn('container mx-auto px-4 sm:px-6 lg:px-8', className)}
      {...props}
    />
  )
}
```

- [ ] **Step 6: Implement shared field metadata**

Create `src/shared/ui/field-a11y.ts` with one internal cross-file hook:

```ts
import { useId, type ComponentProps, type ReactNode } from 'react'

type FieldA11yOptions = Pick<
  ComponentProps<'input'>,
  'id' | 'aria-describedby' | 'aria-invalid'
> & {
  description?: ReactNode
  error?: ReactNode
}

/**
 * Строит стабильные id и ARIA-связи для проектных form-field композиций.
 *
 * @returns Идентификаторы description/error, итоговый `aria-describedby` и
 * invalid-состояние. Наличие `error` имеет приоритет над переданным
 * `aria-invalid`.
 */
export function useFieldA11y({
  id,
  'aria-describedby': externalDescription,
  'aria-invalid': externalInvalid,
  description,
  error,
}: FieldA11yOptions) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hasDescription = description !== undefined && description !== null
  const hasError = error !== undefined && error !== null
  const descriptionId = hasDescription ? `${inputId}-description` : undefined
  const errorId = hasError ? `${inputId}-error` : undefined
  const describedBy =
    [externalDescription, descriptionId, errorId].filter(Boolean).join(' ') ||
    undefined
  const ariaInvalid = hasError ? true : externalInvalid
  const isInvalid =
    ariaInvalid === true ||
    ariaInvalid === 'true' ||
    ariaInvalid === 'grammar' ||
    ariaInvalid === 'spelling'

  return {
    ariaInvalid,
    describedBy,
    descriptionId,
    errorId,
    inputId,
    isInvalid,
  }
}
```

Keep this helper out of `src/shared/ui/index.ts`; it is an implementation detail
shared only by `TextField` and `PasswordField`.

- [ ] **Step 7: Implement `TextField`**

Create `src/shared/ui/text-field.tsx` using the exact public props:

```tsx
import type { ComponentProps, ReactNode } from 'react'

import { Field, FieldDescription, FieldError, FieldLabel } from './field'
import { useFieldA11y } from './field-a11y'
import { Input } from './input'

type TextFieldProps = ComponentProps<'input'> & {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
}
```

The component must:

```tsx
const metadata = useFieldA11y({
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  description,
  error,
})

return (
  <Field data-invalid={metadata.isInvalid || undefined}>
    <FieldLabel htmlFor={metadata.inputId}>{label}</FieldLabel>
    <Input
      {...inputProps}
      id={metadata.inputId}
      aria-describedby={metadata.describedBy}
      aria-invalid={metadata.ariaInvalid}
    />
    {description !== undefined && description !== null && (
      <FieldDescription id={metadata.descriptionId}>
        {description}
      </FieldDescription>
    )}
    {error !== undefined && error !== null && (
      <FieldError id={metadata.errorId} role="alert">
        {error}
      </FieldError>
    )}
  </Field>
)
```

Add Russian TSDoc describing automatic label/error/description association and
React Hook Form compatibility.

- [ ] **Step 8: Implement `PasswordField`**

Create `src/shared/ui/password-field.tsx` with:

```tsx
type PasswordFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
}
```

Use `useState(false)` for visibility, the same `useFieldA11y` contract, and the
registry `InputGroup` primitives. The core must be:

```tsx
<InputGroup data-invalid={metadata.isInvalid || undefined}>
  <InputGroupInput
    {...inputProps}
    id={metadata.inputId}
    ref={inputRef}
    type={isVisible ? 'text' : 'password'}
    aria-describedby={metadata.describedBy}
    aria-invalid={metadata.ariaInvalid}
  />
  <InputGroupAddon align="inline-end">
    <InputGroupButton
      type="button"
      size="icon-xs"
      aria-label={isVisible ? 'Скрыть пароль' : 'Показать пароль'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        setIsVisible((current) => !current)
        inputRef.current?.focus()
      }}
    >
      {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </InputGroupButton>
  </InputGroupAddon>
</InputGroup>
```

Compose forwarded React 19 `ref` with the local input ref instead of dropping
React Hook Form registration. If the registry `InputGroupInput` ref signature
differs, use a focused `setInputRef` callback that updates both refs. Add Russian
TSDoc documenting the reveal toggle and focus/value preservation.

- [ ] **Step 9: Export and verify the project contracts**

Add to `src/shared/ui/index.ts`:

```ts
export { Container } from './container'
export { PasswordField } from './password-field'
export { TextField } from './text-field'
```

Run:

```bash
./node_modules/.bin/vitest run \
  src/shared/ui/button.test.tsx \
  src/shared/ui/container.test.tsx \
  src/shared/ui/text-field.test.tsx \
  src/shared/ui/password-field.test.tsx
./node_modules/.bin/eslint src/shared/ui
./node_modules/.bin/tsc -b
git diff --check
```

Expected: all four component test files PASS, lint/typecheck succeed, and no
custom prop is forwarded to the DOM.

- [ ] **Step 10: Commit the shared contracts**

```bash
git add src/shared/ui
git commit -m "feat(ui): add shared form and loading contracts"
```

---

### Task 3: Adopt the contracts across auth and page surfaces

**Files:**

- Modify: `src/features/auth-login/ui/login-form.tsx`
- Modify: `src/features/auth-login/ui/login-form.test.tsx`
- Modify: `src/features/auth-logout/ui/logout-button.tsx`
- Modify: `src/features/auth-logout/ui/logout-button.test.tsx`
- Modify: `src/pages/login/ui/login-page.tsx`
- Modify: `src/pages/dashboard/ui/dashboard-page.tsx`
- Modify: `src/app/router/route-error.tsx`
- Modify: `src/app/router/route-error.test.tsx`
- Delete: `src/shared/ui/error-message.tsx`
- Modify: `src/shared/ui/index.ts`
- Modify: `.gitignore`
- Create: `docs/architecture/ui-guidelines.md`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: Task 2 `Button`, `Container`, `TextField`, `PasswordField`; Task 1 `Alert`, `Card`.
- Produces: existing user flows implemented only through shared contracts, plus a durable policy for later tasks.

- [ ] **Step 1: Add failing login and logout loading assertions**

In `login-form.test.tsx`, change the pending assertion to:

```tsx
await waitFor(() => {
  const button = screen.getByRole('button', { name: 'Входим' })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
})
```

Add a password reveal assertion to the validation test setup:

```tsx
const password = screen.getByLabelText('Пароль')
await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
expect(password).toHaveAttribute('type', 'text')
expect(password).toHaveValue('secret')
```

Add this pending regression test to `logout-button.test.tsx`:

```tsx
it('shows an accessible spinner and blocks repeated logout while pending', async () => {
  let releaseLogout!: () => void
  const logoutGate = new Promise<void>((resolve) => {
    releaseLogout = resolve
  })
  server.use(
    http.post(`${apiOrigin}/v1/auth/logout`, async () => {
      await logoutGate
      return new HttpResponse(null, { status: 204 })
    }),
  )
  renderLogout()

  await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

  const pendingButton = await screen.findByRole('button', { name: 'Выходим' })
  expect(pendingButton).toBeDisabled()
  expect(pendingButton).toHaveAttribute('aria-busy', 'true')
  expect(
    pendingButton.querySelector('[data-slot="spinner"]'),
  ).toBeInTheDocument()

  releaseLogout()
  expect(await screen.findByText('Login route')).toBeVisible()
})
```

- [ ] **Step 2: Add a failing route retry integration test**

Append to `route-error.test.tsx`:

```tsx
it('revalidates a retryable route through the shared button', async () => {
  let attempts = 0
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => {
          attempts += 1
          if (attempts === 1) throw new ApiNetworkError()
          return null
        },
        element: <p>Recovered route</p>,
        errorElement: <RouteError />,
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)

  await userEvent.click(
    await screen.findByRole('button', { name: 'Повторить' }),
  )
  expect(await screen.findByText('Recovered route')).toBeVisible()
  expect(attempts).toBe(2)
})
```

Add the missing `userEvent` import from
`@testing-library/user-event`.

- [ ] **Step 3: Run integration tests and confirm RED**

Run:

```bash
./node_modules/.bin/vitest run \
  src/features/auth-login/ui/login-form.test.tsx \
  src/features/auth-logout/ui/logout-button.test.tsx \
  src/app/router/route-error.test.tsx
```

Expected: FAIL because existing screens still expose text-only pending states,
no password toggle, and the route retry button is still raw.

- [ ] **Step 4: Migrate `LoginForm` without changing auth behavior**

Replace the shared import with:

```ts
import {
  Alert,
  AlertDescription,
  Button,
  PasswordField,
  TextField,
} from '@/shared/ui'
```

Replace the manual fields with:

```tsx
<TextField
  label="Email"
  type="email"
  autoComplete="email"
  error={emailError}
  {...register('email')}
/>

<PasswordField
  label="Пароль"
  autoComplete="current-password"
  error={passwordError}
  {...register('password')}
/>
```

Replace the form-level error with:

```tsx
{
  formError !== null && formError.length > 0 && (
    <Alert variant="destructive">
      <AlertDescription>{formError}</AlertDescription>
    </Alert>
  )
}
```

Replace submit with:

```tsx
<Button
  type="submit"
  className="w-full"
  isLoading={login.isPending}
  loadingLabel="Входим"
>
  Войти
</Button>
```

Do not change `submit`, backend pointer mapping, navigation or mutation code.

- [ ] **Step 5: Migrate `LogoutButton`**

Use:

```tsx
<Button
  type="button"
  variant="outline"
  isLoading={logout.isPending}
  loadingLabel="Выходим"
  onClick={() => logout.mutate()}
>
  Выйти
</Button>
```

Render the failure through:

```tsx
{
  visibleFailure && (
    <Alert variant="destructive" className="mt-3">
      <AlertDescription>Не удалось выйти. Повторите попытку.</AlertDescription>
    </Alert>
  )
}
```

Keep the boolean `visibleFailure` before `&&` and preserve
`AUTHENTICATION_REQUIRED` behavior.

- [ ] **Step 6: Migrate the page shells**

`LoginPage`:

```tsx
<Container
  as="main"
  className="flex min-h-screen items-center justify-center py-6"
>
  <Card className="w-full max-w-sm">
    <CardHeader>
      <CardTitle>Вход</CardTitle>
      <CardDescription>
        Введите данные учётной записи, чтобы продолжить.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <LoginForm returnTo={searchParams.get('returnTo')} />
    </CardContent>
  </Card>
</Container>
```

Remove the old `mt-6` from the form if Card spacing already supplies the
vertical rhythm; use one spacing system rather than compensating margins.

`DashboardPage`:

```tsx
<Container as="main" className="min-h-screen py-6">
  <header className="flex items-center justify-between gap-4">
    <span className="min-w-0 truncate">{user.normalizedEmail}</span>
    <LogoutButton />
  </header>
</Container>
```

- [ ] **Step 7: Migrate `RouteError`**

Use `Container`, destructive `Alert`, `AlertTitle`, `AlertDescription` and
`Button`. Keep request id conditional JSX boolean-safe:

```tsx
<Container
  as="main"
  className="flex min-h-screen items-center justify-center py-6"
>
  <section className="w-full max-w-md">
    <Alert variant="destructive">
      <AlertTitle>Не удалось открыть страницу</AlertTitle>
      <AlertDescription>
        <p>{presentation.message}</p>
        {Boolean(presentation.requestId) && (
          <p className="mt-2 text-xs">Код запроса: {presentation.requestId}</p>
        )}
      </AlertDescription>
    </Alert>
    {presentation.retryable && (
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        onClick={() => revalidator.revalidate()}
      >
        Повторить
      </Button>
    )}
  </section>
</Container>
```

Do not change `AuthenticationRedirect` or its cache/navigation effect.

- [ ] **Step 8: Remove the superseded error primitive**

Delete `src/shared/ui/error-message.tsx` and remove:

```ts
export { ErrorMessage } from './error-message'
```

from the barrel. Confirm:

```bash
rg -n "ErrorMessage|<button|<input" \
  src/features/auth-login \
  src/features/auth-logout \
  src/pages/login \
  src/pages/dashboard \
  src/app/router/route-error.tsx
```

Expected: no `ErrorMessage`, raw `<button>`, or raw `<input>` remains in the
migrated surfaces. Raw text inside `AuthenticationRedirect` is allowed.

- [ ] **Step 9: Add environment ignore and durable UI policy**

Append to `.gitignore` near other local artifacts:

```gitignore
# Local environment
.env
.env.*
!.env.example
```

Create `docs/architecture/ui-guidelines.md`:

```md
# UI-компоненты

## Владение

Повторяемые controls и UI-состояния сначала ищутся в `src/shared/ui`. Если
нужного контракта нет, расширь shared-компонент и покрой его тестом до
использования в feature/page JSX.

Скопированный shadcn registry-код является редактируемым проектным source.
Сохраняй неизменённые примитивы близкими к upstream; проектное поведение
добавляй только при повторяемом сценарии.

## Обязательные пути

| Сценарий                        | Использовать                        |
| ------------------------------- | ----------------------------------- |
| Action                          | `Button`                            |
| Pending action                  | `Button isLoading` + `loadingLabel` |
| Обычное form-поле               | `TextField`                         |
| Поле пароля                     | `PasswordField`                     |
| Page width и horizontal gutters | `Container`                         |
| Form/page error                 | `Alert variant="destructive"`       |

Не создавай feature-level spinner, raw form control или локальный page
container, если shared-контракт семантически подходит. Vertical spacing
остаётся ответственностью потребителя `Container`.
```

Add to `AGENTS.md`:

```md
## UI-компоненты

1. Следуй [контрактам shared UI](docs/architecture/ui-guidelines.md).
2. Перед созданием повторяемого control или состояния проверь `src/shared/ui`;
   если контракта нет, сначала расширь shared-компонент и его тесты.
3. Не реализуй локальные loading-spinner, form-field и page-container паттерны,
   когда для сценария уже есть `Button`, `TextField`, `PasswordField` или
   `Container`.
```

- [ ] **Step 10: Run focused and architecture verification**

Run:

```bash
./node_modules/.bin/vitest run \
  src/features/auth-login/ui/login-form.test.tsx \
  src/features/auth-logout/ui/logout-button.test.tsx \
  src/app/router/route-error.test.tsx \
  src/shared/ui/button.test.tsx \
  src/shared/ui/container.test.tsx \
  src/shared/ui/text-field.test.tsx \
  src/shared/ui/password-field.test.tsx
./node_modules/.bin/eslint \
  src/features/auth-login \
  src/features/auth-logout \
  src/pages/login \
  src/pages/dashboard \
  src/app/router/route-error.tsx \
  src/shared/ui
CHOKIDAR_USEPOLLING=1 ./node_modules/.bin/steiger ./src
./node_modules/.bin/tsc -b
git diff --check
```

Expected: tests, lint, architecture and typecheck all PASS; no raw controls
remain in the migrated surfaces.

- [ ] **Step 11: Commit the vertical adoption**

```bash
git add \
  .gitignore \
  AGENTS.md \
  docs/architecture/ui-guidelines.md \
  src/app/router/route-error.tsx \
  src/app/router/route-error.test.tsx \
  src/features/auth-login/ui/login-form.tsx \
  src/features/auth-login/ui/login-form.test.tsx \
  src/features/auth-logout/ui/logout-button.tsx \
  src/features/auth-logout/ui/logout-button.test.tsx \
  src/pages/login/ui/login-page.tsx \
  src/pages/dashboard/ui/dashboard-page.tsx \
  src/shared/ui/index.ts
git add -u src/shared/ui/error-message.tsx
git commit -m "refactor(ui): adopt shared auth and page contracts"
```

---

## Final Verification

After all task commits, the controller must run these checks from
`/private/tmp/react-starter-shadcn-ui-foundation` under Node `24.18.0`:

```bash
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
git diff --check
git status --short --branch
```

If a pnpm wrapper fails before its target command, record that boundary and run:

```bash
./node_modules/.bin/prettier --check .
./node_modules/.bin/eslint .
CHOKIDAR_USEPOLLING=1 ./node_modules/.bin/steiger ./src
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -b
./node_modules/.bin/vite build
```

For `api:check`, run the exact script whenever pnpm execution is available;
never infer API reproducibility only from unrelated gates.

Browser verification must cover login, dashboard and route-error at widths
320, 768 and 1440 px:

- no horizontal overflow;
- Lyra/taupe/blue tokens are applied;
- keyboard focus is visible;
- field error and destructive alert are legible;
- password toggle works from keyboard and retains the value;
- login/logout loading states show a spinner without width shift;
- dashboard email truncates instead of forcing overflow.

Finally dispatch an independent whole-branch reviewer with:

- base commit `7b15ce9`;
- spec path
  `docs/superpowers/specs/2026-07-28-shadcn-ui-foundation-design.md`;
- plan path
  `docs/superpowers/plans/2026-07-28-shadcn-ui-foundation.md`;
- full diff and fresh test evidence.
