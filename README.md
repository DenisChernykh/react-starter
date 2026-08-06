# React starter

Копируемая основа нового React-приложения для HTTP API. Starter уже содержит
рабочие архитектурные, transport, security, UI и verification-контракты:

- React Router Data Mode с публичной и защищённой ветками;
- Feature-Sliced Design и Steiger;
- TanStack Query и Axios;
- cookie-based session auth и in-memory CSRF;
- Problem Details error normalization;
- committed OpenAPI snapshot и генерацию Orval;
- строгие generated Zod schemas;
- Tailwind CSS и shared shadcn/Base UI components;
- Vitest, Testing Library и MSW.

`approval-requests` остаётся исполняемым эталоном подключения бизнес-модуля, а
не временным demo-кодом.

## Новый проект

Не переинициализируйте Git в исходной папке starter. Новый продукт создаётся
безопасным копированием в отдельный каталог без `.git`, local env,
`node_modules`, `dist` и `.superpowers`, после чего получает собственный
`git init`.

Полный воспроизводимый сценарий, включая персонализацию, OpenAPI, backend,
первый запуск и Definition of Done:

- [создание нового проекта из starter](docs/getting-started.md).

AI-агент также должен начать с [AGENTS.md](AGENTS.md).

## Требования

- Node.js 24.x (`>=24 <25`)
- pnpm 11.15.1

## Локальный запуск

```bash
pnpm install
pnpm dev
```

Без `.env.local` Vite proxy направляет `/v1` и `/health` на
`http://localhost:3000`. Для другого локального backend задайте только
server-side `DEV_API_PROXY_TARGET` в `.env.local`; эта переменная применяется
лишь командой `vite serve` и не является production API origin.

```bash
# Необязательно: только если локальный backend не http://localhost:3000.
cp .env.example .env.local
```

Frontend доступен на `http://localhost:5173`. Для browser-auth backend всё
равно валидирует фактический browser `Origin` и должен разрешать
`http://localhost:5173` в `CORS_ORIGINS` с credentials.

## Документация

- [Архитектурный обзор](docs/architecture/overview.md) — FSD, providers,
  router, Orval, auth/CSRF, errors, cache и verification layers.
- [Подключение бизнес-модуля](docs/architecture/business-modules.md) —
  вертикальный путь от backend OpenAPI до route page.
- [Shared UI](docs/architecture/ui-guidelines.md) — владельцы controls,
  loading, fields, container и dialogs.
- [TSDoc](docs/architecture/tsdoc-guidelines.md) — отдельная необязательная
  задача документирования handwritten exports.
- [Same-origin ingress](docs/runbooks/frontend-same-origin-ingress.md) —
  подготовка маршрутизации public/admin/API hosts.
- [Публикация frontend image](docs/runbooks/frontend-image-publication.md) —
  candidate image, GHCR digest и границы evidence.
- [Dokploy operator](docs/runbooks/frontend-dokploy-deployment.md) — ручные
  preflight, bootstrap и promotion exact digest.
- [Explicit rollback](docs/runbooks/frontend-dokploy-rollback.md) — откат из
  failed/indeterminate promotion evidence.

## Контракт API

`openapi/openapi.json` — committed build-time snapshot backend-контракта. Это не browser asset и не должен раздаваться приложением.

```bash
pnpm api:update # синхронизировать snapshot и сгенерировать клиент
pnpm api:check  # проверить воспроизводимость generated output
```

Каталоги `src/shared/api/generated` и `src/shared/api/generated-zod` создаются только Orval и не редактируются вручную.

Browser API requests всегда используют относительный same-origin путь `/v1`;
production build не содержит API hostname. `DEV_API_PROXY_TARGET` нужен только
Vite dev server. Для явного build-time источника OpenAPI используйте:

```bash
OPENAPI_SPEC_SOURCE=/absolute/path/to/backend/openapi.json pnpm api:update
```

## Эталонный бизнес-модуль

`approval-requests` показывает путь от backend OpenAPI до защищённого UI. Правила
владения контрактом, FSD и cache описаны в
[руководстве по подключению бизнес-модуля](docs/architecture/business-modules.md).

После аутентификации доступны пять private routes:

- `/` — обзор;
- `/approval-requests` — центр действий согласования;
- `/approval-requests/new` — создание запроса;
- `/approval-requests/open` — открытие запроса по UUID;
- `/approval-requests/:requestId` — детали запроса и доступное решение.

## Проверки

```bash
pnpm check
pnpm lint:tsdoc # отдельная необязательная проверка TSDoc
pnpm oci:check
```

Команда последовательно проверяет OpenAPI drift, форматирование, ESLint, FSD-архитектуру, тесты и production build. TSDoc в неё не входит.

`pnpm oci:check` — отдельная Docker-dependent проверка: она локально собирает
`linux/amd64` image и проверяет его HTTP/metadata contract. Она не входит в
`pnpm check` и не заменяет browser/runtime-проверку с запущенным backend.
Ни одна из этих команд не является доказательством remote CI, GHCR publication
или deployment.

## Публикация образа

При копировании starter выберите integration branch и одинаково
персонализируйте `pull_request` в `.github/workflows/ci.yml` и `push` в
`.github/workflows/stage-image.yml`. Push в неё (как правило, merge PR)
запускает workflow candidate image, но не deployment.

Workflow публикует image в `ghcr.io/<owner>/<repository>`; у workflow должны
быть `contents: read` и `packages: write`, а пакет GHCR — linkage и доступ к
этому repository. Скопированные public frontend и admin — разные приложения и
публикуют отдельные images. Используйте immutable digest из workflow summary,
а не SHA/run tag, для последующего оператора. Подробный порядок находится в
[runbook публикации](docs/runbooks/frontend-image-publication.md).

## Ручной deployment

После отдельной подготовки Dokploy Application доступны четыре локальные
operator-команды:

```bash
pnpm deployment:preflight -- --manifest /absolute/path/release.json
pnpm deployment:bootstrap -- --manifest /absolute/path/release.json --apply
pnpm deployment:promote -- --manifest /absolute/path/release.json --apply
pnpm deployment:rollback -- --evidence /absolute/path/failed-evidence.json --apply
```

Preflight читает live GitHub/GHCR/Dokploy state, но не меняет Application.
Остальные команды требуют явный `--apply`, пишут локальный `0600` evidence и
не настраивают VPS, domains, Traefik, environment или registry credentials.
Порядок и границы описаны в
[deployment runbook](docs/runbooks/frontend-dokploy-deployment.md) и
[rollback runbook](docs/runbooks/frontend-dokploy-rollback.md).

## Аутентификация

Backend управляет opaque HttpOnly session cookie. Frontend передаёт credentials и держит CSRF token только в памяти процесса; frontend token storage не используется.

UI обрабатывает Problem Details по стабильному `code`. Общий backend `detail`
не используется как пользовательский текст; validation errors допускаются
только через allowlist известных `errors[].pointer`.
