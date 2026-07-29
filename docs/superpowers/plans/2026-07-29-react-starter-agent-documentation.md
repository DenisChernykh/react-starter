# React Starter Agent Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить самодостаточную документацию, по которой AI-агент сможет
понять устройство React Starter, безопасно создать из него новый Git-проект и
расширять router, Orval API и error handling без нарушения контрактов.

**Architecture:** `AGENTS.md` задаёт обязательный operational contract и
маршрутизирует агента. `docs/getting-started.md` владеет воспроизводимым
bootstrap runbook, `docs/architecture/overview.md` — картой архитектуры и
runtime-потоков, а `README.md` остаётся компактной точкой входа без
дублирования профильных документов.

**Tech Stack:** Markdown, React 19, React Router Data Mode, TanStack Query,
Axios, Orval, Zod, Feature-Sliced Design, pnpm.

## Global Constraints

- Документировать фактический checkout, не проектировать новое runtime-поведение.
- Сохранить `approval-requests` как исполняемый эталон бизнес-модуля.
- Новый проект создаётся копированием локальной папки без `.git` и последующим
  `git init` только в целевом каталоге.
- Не добавлять bootstrap script: точные команды остаются в runbook.
- Использовать Node `24.18.0` и pnpm `11.15.1` для проверки.
- Не редактировать `src/shared/api/generated/**`,
  `src/shared/api/generated-zod/**` и пользовательский `.superpowers/`.
- Не заявлять browser/runtime или publication verification на основании
  `pnpm check`.
- Не выполнять push, pull request или deployment.

---

## File Map

- Create: `docs/getting-started.md` — безопасное копирование, персонализация,
  backend/OpenAPI integration, первый запуск и Definition of Done.
- Create: `docs/architecture/overview.md` — FSD ownership, router, Orval,
  transport/error contracts, reference module и verification layers.
- Modify: `AGENTS.md` — обязательная точка входа, task routing, preflight и
  непреложные инварианты.
- Modify: `README.md` — краткое позиционирование starter и навигация к новым
  документам.
- Create: `docs/superpowers/plans/2026-07-29-react-starter-agent-documentation.md`
  — этот implementation plan.

### Task 1: Реализовать связанный комплект агентской документации

**Files:**

- Create: `docs/getting-started.md`
- Create: `docs/architecture/overview.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**

- Consumes:
  `docs/superpowers/specs/2026-07-29-react-starter-agent-documentation-design.md`,
  существующие `package.json`, `.nvmrc`, `.env.example`,
  `.github/workflows/ci.yml`, `orval.config.ts`,
  `scripts/openapi/sync-openapi.mjs`, `src/app/router/**`,
  `src/shared/api/**`, `src/entities/session/**`,
  `docs/architecture/business-modules.md`,
  `docs/architecture/ui-guidelines.md`,
  `docs/architecture/tsdoc-guidelines.md`.
- Produces: один непротиворечивый documentation graph с `AGENTS.md` как
  agent entrypoint, `README.md` как краткой общей entrypoint,
  `docs/getting-started.md` как bootstrap contract и
  `docs/architecture/overview.md` как architecture contract.

- [x] **Step 1: Создать архитектурный обзор**

  Создать `docs/architecture/overview.md` со следующими обязательными
  разделами:

  1. назначение starter и граница foundation/reference implementation;
  2. technology/runtime table с фактическими библиотеками и pin'ами;
  3. карта FSD-слоёв и владельцев;
  4. application composition flow;
  5. Router Data Mode tree и правила добавления route;
  6. OpenAPI snapshot и двухконтурная Orval generation;
  7. Axios/CSRF/Problem Details error pipeline;
  8. React Query cache/retry ownership;
  9. shared UI и TSDoc contracts;
  10. устройство `approval-requests`;
  11. generated/handwritten/historical/local классификация;
  12. уровни verification.

  Router-раздел должен называть
  `createRequireSessionLoader`, `createRedirectAuthenticatedLoader`,
  `ProtectedLayout`, `RouteError`, `shared/routes` и `AppShell`. Он фиксирует
  fresh `/v1/auth/me`, `AbortSignal`, безопасный `returnTo`, protected children,
  React Query для business data и запрет второго `<main>`.

  Orval-раздел должен различать `api:sync`, `api:generate`, `api:update` и
  `api:check`; описывать `openapi/openapi.json`, generated request functions,
  DTO/unions, query keys/options, Zod schemas, `apiMutator`,
  `src/shared/api/index.ts`, `OPENAPI_SPEC_SOURCE` и
  `VITE_API_BASE_URL`.

  Error-раздел должен документировать `ApiNetworkError`, `ApiProtocolError`,
  `ApiProblemError`, stable `code`, безопасный `requestId`, allowlist для
  `errors[].pointer`, retry policy, session/CSRF cleanup и специальный
  operational `503` health contract.

- [x] **Step 2: Создать bootstrap runbook**

  Создать `docs/getting-started.md`. Начальный happy path:

  ```text
  source/destination preflight
  → safe rsync copy
  → git init
  → project personalization
  → frozen install
  → OpenAPI sync/generation
  → backend and frontend runtime
  → pnpm check
  → first commit
  ```

  Runbook должен использовать task-specific variables:

  ```bash
  STARTER_DIR=/absolute/path/to/react-starter
  PROJECT_DIR=/absolute/path/to/new-project
  ```

  До `rsync` требуется проверить:

  ```bash
  test -d "$STARTER_DIR/.git"
  test "$STARTER_DIR" != "$PROJECT_DIR"
  test ! -e "$PROJECT_DIR"
  ```

  Копирование исключает `.git`, `node_modules`, `dist`, `.env`, `.env.local`,
  `.superpowers` и `.DS_Store`, но сохраняет `.env.example`, committed OpenAPI,
  generated code и `docs/superpowers`.

  После копирования выполнить:

  ```bash
  cd "$PROJECT_DIR"
  git init -b main
  nvm use
  pnpm install --frozen-lockfile
  cp .env.example .env.local
  ```

  Персонализация должна перечислять `package.json`, `index.html`,
  `src/widgets/app-shell/ui/app-shell.tsx`, `README.md`, `.env.local` и CI
  branch. Запретить blind global replace для `react-starter`,
  `nest-js-starter` и `approval-requests`.

  Backend/OpenAPI раздел должен дать явный вариант:

  ```bash
  OPENAPI_SPEC_SOURCE=/absolute/path/to/backend/openapi.json pnpm api:update
  pnpm api:check
  ```

  Runtime-раздел должен требовать точный credentialed CORS origin, работающий
  backend, пользователя для login и проверки `/`, `/login` и
  `/approval-requests`.

  Завершить runbook таблицей типичных сбоев и Definition of Done, разделяющим
  source checks, local gates, browser/runtime и publication.

- [x] **Step 3: Расширить agent entrypoint**

  Обновить `AGENTS.md`, сохранив существующие JSX, TSDoc и UI rules.

  Перед ними добавить:

  - определение repository как reusable starter;
  - обязательный reading map по типу задачи;
  - preflight для source checkout и нового project copy;
  - краткую карту foundation и reference module;
  - router, Orval, error/security и verification invariants;
  - запрет удаления `approval-requests` без явного запроса;
  - запрет ручного изменения generated output;
  - требование не смешивать local, runtime и publication evidence.

  Для задачи создания нового проекта `AGENTS.md` должен требовать выполнение
  `docs/getting-started.md` по порядку, а не импровизацию по README.

- [x] **Step 4: Обновить README как навигатор**

  Сохранить краткость README и добавить:

  - позиционирование как копируемого starter;
  - перечень foundation capabilities;
  - явную ссылку на `docs/getting-started.md`;
  - ссылку на `docs/architecture/overview.md`;
  - ссылки на business module, shared UI и TSDoc guides;
  - пояснение роли `approval-requests`;
  - существующие local start, API generation, auth и `pnpm check`.

  README не должен дублировать полный bootstrap или architecture guide.

- [x] **Step 5: Проверить связность и форматирование**

  Проверить отсутствие незаполненных маркеров:

  ```bash
  rg -n '(T)(BD)|(T)(ODO)|(F)(IXME)|(PLACE)(HOLDER)' \
    AGENTS.md README.md docs/getting-started.md docs/architecture/overview.md
  ```

  Проверить, что все локальные Markdown links указывают на существующие файлы,
  вручную сопоставив targets из четырёх изменённых документов с repository
  tree.

  Запустить Prettier под закреплённым Node:

  ```bash
  PATH="/Users/denischernykh/.nvm/versions/node/v24.18.0/bin:$PATH" \
    ./node_modules/.bin/prettier --check \
    AGENTS.md README.md docs/getting-started.md \
    docs/architecture/overview.md \
    docs/superpowers/plans/2026-07-29-react-starter-agent-documentation.md
  ```

  Ожидается: `All matched files use Prettier code style!`

- [x] **Step 6: Smoke-test команду копирования**

  Создать временный destination через `mktemp -d`, выполнить документированный
  `rsync` и проверить:

  ```bash
  test ! -e "$PROJECT_DIR/.git"
  test ! -e "$PROJECT_DIR/node_modules"
  test ! -e "$PROJECT_DIR/dist"
  test ! -e "$PROJECT_DIR/.env"
  test ! -e "$PROJECT_DIR/.superpowers"
  test -f "$PROJECT_DIR/.env.example"
  test -f "$PROJECT_DIR/openapi/openapi.json"
  test -d "$PROJECT_DIR/src/shared/api/generated"
  ```

  Удалить только созданный временный destination после успешной проверки.

- [x] **Step 7: Выполнить aggregate verification**

  Запустить:

  ```bash
  git diff --check
  PATH="/Users/denischernykh/.nvm/versions/node/v24.18.0/bin:$PATH" pnpm check
  git status --short
  git diff -- AGENTS.md README.md docs/getting-started.md \
    docs/architecture/overview.md \
    docs/superpowers/plans/2026-07-29-react-starter-agent-documentation.md
  ```

  Ожидается:

  - `git diff --check` без вывода;
  - `pnpm check` завершён с exit code `0`;
  - в status присутствуют только план, четыре документа задачи и ранее
    существующий пользовательский `.superpowers/`;
  - generated API и application source не изменены.

- [x] **Step 8: Создать локальный commit**

  Добавить только файлы задачи:

  ```bash
  git add AGENTS.md README.md docs/getting-started.md \
    docs/architecture/overview.md \
    docs/superpowers/plans/2026-07-29-react-starter-agent-documentation.md
  git commit -m "docs(starter): add agent onboarding guide"
  ```

  Не добавлять `.superpowers/`. Push, PR и deployment не выполнять.
