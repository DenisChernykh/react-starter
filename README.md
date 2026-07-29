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

- Node.js 24.18.0
- pnpm 11.15.1

## Локальный запуск

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Frontend доступен на `http://localhost:5173`, backend ожидается на `http://localhost:3000`. Для browser-auth backend должен содержать `http://localhost:5173` в `CORS_ORIGINS`.

## Документация

- [Архитектурный обзор](docs/architecture/overview.md) — FSD, providers,
  router, Orval, auth/CSRF, errors, cache и verification layers.
- [Подключение бизнес-модуля](docs/architecture/business-modules.md) —
  вертикальный путь от backend OpenAPI до route page.
- [Shared UI](docs/architecture/ui-guidelines.md) — владельцы controls,
  loading, fields, container и dialogs.
- [TSDoc](docs/architecture/tsdoc-guidelines.md) — контракт handwritten
  exports.

## Контракт API

`openapi/openapi.json` — committed build-time snapshot backend-контракта. Это не browser asset и не должен раздаваться приложением.

```bash
pnpm api:update # синхронизировать snapshot и сгенерировать клиент
pnpm api:check  # проверить воспроизводимость generated output
```

Каталоги `src/shared/api/generated` и `src/shared/api/generated-zod` создаются только Orval и не редактируются вручную.

Runtime API задаётся отдельно через `VITE_API_BASE_URL`. Для явного build-time
источника OpenAPI используйте:

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
```

Команда последовательно проверяет OpenAPI drift, форматирование, ESLint, FSD-архитектуру, тесты и production build.

Локальный gate не заменяет browser/runtime-проверку с запущенным backend и не
является доказательством remote CI или deployment.

## Аутентификация

Backend управляет opaque HttpOnly session cookie. Frontend передаёт credentials и держит CSRF token только в памяти процесса; frontend token storage не используется.

UI обрабатывает Problem Details по стабильному `code`. Общий backend `detail`
не используется как пользовательский текст; validation errors допускаются
только через allowlist известных `errors[].pointer`.
