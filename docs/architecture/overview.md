# Архитектура React Starter

## Назначение

`react-starter` — копируемая основа для нового frontend-приложения,
интегрированного с HTTP API. Это не пустой Vite template: starter уже содержит
рабочие контракты авторизации, маршрутизации, server-state, API-генерации,
ошибок, shared UI, тестов и архитектурных проверок.

В репозитории есть две разные части:

- **foundation** — переиспользуемая инфраструктура приложения;
- **reference implementation** — `approval-requests`, исполняемый пример
  подключения бизнес-модуля от OpenAPI до защищённого UI.

При создании нового продукта foundation сохраняется. `approval-requests` также
остаётся как наглядный пример, пока пользователь явно не попросит изменить его
роль. Новый несвязанный capability создаётся отдельным вертикальным slice, а не
встраивается в approval-модуль.

Практические правила:

- [создание нового проекта](../getting-started.md);
- [подключение бизнес-модуля](business-modules.md);
- [shared UI](ui-guidelines.md);
- [TSDoc](tsdoc-guidelines.md).
- [same-origin ingress](../runbooks/frontend-same-origin-ingress.md);
- [публикация frontend image](../runbooks/frontend-image-publication.md).

## Технологический контракт

Актуальные версии определяются `package.json` и `pnpm-lock.yaml`. Основные
границы текущего starter:

| Область         | Реализация                           |
| --------------- | ------------------------------------ |
| Runtime         | Node.js `24.18.0`, pnpm `11.15.1`    |
| UI runtime      | React 19                             |
| Build           | Vite 8, TypeScript 6                 |
| Routing         | React Router 8, Data Mode            |
| Server state    | TanStack Query 5                     |
| HTTP transport  | Axios                                |
| API generation  | Orval 8                              |
| Runtime schemas | Zod 4                                |
| Forms           | React Hook Form                      |
| Styles          | Tailwind CSS 4                       |
| UI primitives   | shadcn source на Base UI, стиль Lyra |
| Architecture    | Feature-Sliced Design, Steiger       |
| Tests           | Vitest, Testing Library, MSW         |

Не обновляйте версии «по памяти». Изменение библиотек, их конфигурации или CLI
требует проверки текущей официальной документации и отдельной задачи.

## Владение в Feature-Sliced Design

```text
src/
├── app/       composition root, providers, router, global styles
├── pages/     route-specific composition
├── widgets/   крупные повторяемые блоки страниц
├── features/  законченные пользовательские действия
├── entities/  данные, query identity, cache и presentation модели
└── shared/    transport, config, routes, libraries и UI primitives
```

| Слой       | Владеет                                                       | Не должен владеть                        |
| ---------- | ------------------------------------------------------------- | ---------------------------------------- |
| `app`      | запуском React, providers, route tree, глобальными boundaries | бизнес-формами и entity cache            |
| `pages`    | композицией конкретного URL                                   | transport и общими controls              |
| `widgets`  | повторяемой application/page composition                      | route tree и business API                |
| `features` | пользовательским действием и mutation orchestration           | общим HTTP client и общими UI primitives |
| `entities` | query keys/options, cache helpers, presentation данных        | route composition                        |
| `shared`   | техническими контрактами без знания верхних слоёв             | продуктовым use case                     |

Каждый slice предоставляет public API через `index.ts`. Импорты из другого
slice не должны обходить этот API и обращаться к внутренним файлам. FSD-границы
проверяет `pnpm architecture` через `steiger.config.ts`; generated-каталоги
исключены из этой проверки.

## Сборка приложения

Основной runtime path:

```text
src/main.tsx
→ src/app/entrypoint/index.tsx
→ React StrictMode
→ AppProvider
→ RouterProvider
→ route element
```

`AppProvider` подключает единый `QueryClient`. Router, entity hooks и mutations
используют один cache instance. Добавляйте новый app-wide provider в
`src/app/config`, а не локально в page или feature.

`src/app/styles/index.css` является единой точкой подключения Tailwind и
глобальных design tokens. Shared controls находятся в `src/shared/ui`.

## Router Data Mode

### Текущее дерево

Route tree объявлен в `src/app/router/router.tsx`:

```text
createBrowserRouter
├── /login
│   ├── createRedirectAuthenticatedLoader
│   ├── LoginPage
│   └── RouteError
└── /
    ├── createRequireSessionLoader
    ├── ProtectedLayout
    ├── RouteError
    └── children
        ├── /                         DashboardPage
        ├── /approval-requests       ApprovalRequestsPage
        ├── /approval-requests/new   ApprovalRequestCreatePage
        ├── /approval-requests/open  ApprovalRequestOpenPage
        └── /approval-requests/:id   ApprovalRequestDetailsPage
```

`ProtectedLayout` соединяет `AppShell` с React Router `Outlet`. `AppShell`
владеет общей sidebar/header-композицией и содержит единственный `<main>` для
защищённой ветки. Вложенная page не создаёт второй `<main>`.

### Проверка сессии

Protected happy path:

```text
navigation
→ createRequireSessionLoader
→ fresh GET /v1/auth/me
→ currentSessionQueryKey cache write
→ ProtectedLayout
→ AppShell
→ child page
```

Loader не использует cached user как доказательство действующей сессии. Для
каждого authentication decision он выполняет свежий запрос и передаёт
`request.signal`. Результат отменённой навигации не должен очищать или заменять
состояние более новой навигации.

Только Problem Details `AUTHENTICATION_REQUIRED` означает anonymous session:

1. session cache и CSRF очищаются;
2. пользователь перенаправляется на `/login`;
3. исходные pathname, search и hash сохраняются в `returnTo`;
4. `returnTo` проходит `sanitizeReturnTo` перед обратной навигацией.

`AUTHORIZATION_DENIED`, `DEPENDENCY_UNAVAILABLE`, network error и protocol
error не превращаются в login redirect. Они попадают в `RouteError`.

### Загрузка бизнес-данных

Parent loader владеет authentication gate. Бизнес-данные страниц загружаются
через entity React Query adapters после допуска в protected tree. Например,
details page получает запрос согласования через `useApprovalRequest`, а не
через второй route loader.

Так session request завершается до detail request, query identity остаётся у
entity, а page отвечает только за route-specific presentation.

Обычная навигация между children не обязана повторять parent loader. Когда
mutation обнаруживает `AUTHENTICATION_REQUIRED`, она вызывает router
revalidation; parent loader повторно проверяет сессию и выполняет единый
redirect flow.

### Добавление маршрута

1. Создайте page slice с публичным `index.ts`.
2. Если URL используется более чем в одном месте или требует параметра,
   добавьте константу/builder в `src/shared/routes`.
3. Импортируйте page в `src/app/router/router.tsx`.
4. Добавьте её в public ветку только для действительно публичного сценария.
   Обычная продуктовая page должна быть child защищённого `/`.
5. Добавьте пункт в `AppShell`, только если раздел должен присутствовать в
   постоянной навигации.
6. Не переносите entity query, mutation или feature presentation в router.
7. Покройте direct deep link, anonymous redirect, `returnTo`, порядок session и
   business requests, route matching и error boundary.

## OpenAPI и генерация Orval

### Владение контрактом

Backend OpenAPI — единственный источник wire contract. Frontend хранит
committed build-time snapshot:

```text
backend OpenAPI
→ openapi/openapi.json
→ Orval
→ generated TypeScript/Zod
→ handwritten public API
```

Frontend не импортирует backend source и не пишет второй DTO вручную. Snapshot
не является browser asset: runtime не загружает `openapi/openapi.json`.

### Команды

| Команда             | Что делает                                               | Чего не доказывает                      |
| ------------------- | -------------------------------------------------------- | --------------------------------------- |
| `pnpm api:sync`     | Копирует и валидирует OpenAPI source, обновляет snapshot | Что generated output актуален           |
| `pnpm api:generate` | Очищает и пересоздаёт TypeScript и Zod output            | Что snapshot получен из нужного backend |
| `pnpm api:update`   | Последовательно выполняет sync и generation              | Что backend доступен в runtime          |
| `pnpm api:check`    | Генерирует заново и требует отсутствия Git diff          | Browser/CORS/auth readiness             |

`OPENAPI_SPEC_SOURCE` принимает абсолютный локальный путь, `file:` URL или
HTTP(S) URL. Если переменная отсутствует, sync-script ищет sibling
`nest-js-starter/docs/api/openapi.json`.

```bash
OPENAPI_SPEC_SOURCE=/absolute/path/to/backend/openapi.json pnpm api:update
pnpm api:check
```

Список `requiredOperations` в `scripts/openapi/sync-openapi.mjs` защищает
обязательный auth/reference контракт starter. Это не реестр всех операций
продукта. Добавляйте туда endpoint только тогда, когда отсутствие этого
endpoint должно делать весь frontend snapshot недопустимым.

### Что создаёт Orval

`orval.config.ts` содержит два output:

1. `api` создаёт Axios/React Query source в
   `src/shared/api/generated/**`;
2. `apiZod` создаёт строгие Zod 4 schemas в
   `src/shared/api/generated-zod/**`.

Generated output содержит:

- request functions, сгруппированные по OpenAPI tags;
- DTO и enum-like union types;
- query keys и query options TanStack Query;
- request/response schemas Zod;
- body, path, query и header contracts;
- типизированные operation errors.

Все HTTP-функции используют handwritten `apiMutator`. Он соединяет generated
request config с общим Axios instance и нормализует ошибки.

Generated-каталоги:

- очищаются при каждой генерации;
- коммитятся вместе со snapshot;
- не редактируются вручную;
- не получают handwritten TSDoc;
- не являются public API для page.

`src/shared/api/index.ts` — curated handwritten boundary. Экспортируйте из него
только операции, DTO, query helpers и schemas, реально нужные entity/feature.
Page и feature не должны импортировать deep path из generated-каталога.

### Подключение новой операции

1. Добавьте backend schema, tag и стабильный `operationId`.
2. Обновите backend OpenAPI.
3. Выполните `OPENAPI_SPEC_SOURCE=... pnpm api:update`.
4. Просмотрите diff snapshot, операций, DTO и Zod schemas.
5. Экспортируйте минимально необходимый контракт через `shared/api/index.ts`.
6. Если операция читает самостоятельные данные, создайте entity query/cache
   adapter.
7. Если операция является пользовательским действием, создайте feature
   mutation.
8. Добавьте безопасную presentation ошибок и тесты cache/error behavior.
9. Выполните `pnpm api:check`, затем `pnpm check`.

`OPENAPI_SPEC_SOURCE` используется при build-time synchronization. Runtime
browser transport не получает API hostname: Axios и generated operations
используют относительный same-origin путь `/v1`. Только Vite `serve` читает
server-side `DEV_API_PROXY_TARGET` (по умолчанию `http://localhost:3000`) и
proxy-рует `/v1` и `/health`; эта настройка не попадает в production bundle.

## HTTP, авторизация и CSRF

`API_AXIOS_INSTANCE` в `src/shared/api/client/axios-client.ts`:

- использует относительные same-origin `/v1` URLs без production API origin;
- всегда отправляет cookie credentials;
- добавляет `Content-Type: application/json` для unsafe requests;
- превращает отсутствующее unsafe body в `{}`;
- не добавляет CSRF к login;
- для остальных `POST`, `PUT`, `PATCH`, `DELETE` получает
  `X-CSRF-Token`.

Backend управляет opaque HttpOnly session cookie. Frontend не читает и не
сохраняет session token.

CSRF token хранится только в памяти модуля:

- login заменяет token;
- параллельные запросы разделяют один token fetch;
- generation guard не позволяет старому response заменить новый token;
- logout и authentication loss очищают token;
- localStorage, sessionStorage, IndexedDB и persisted query cache для CSRF не
  используются.

Credentialed browser auth требует точного frontend origin в backend CORS.
Совпадение host, scheme и port обязательно; backend валидирует фактический
browser `Origin`, а не доверяет только адресу proxy target.

### Same-origin production happy path

```text
browser request /v1/*
→ same-origin public или admin host
→ ingress path router
→ backend
```

Browser получает frontend assets и `/v1/*` с одного public/admin origin, поэтому
production bundle не знает hostname backend. Ingress обязан отправить `/v1/*`
и `/health/*` в backend **до** frontend fallback; иначе SPA `index.html` может
замаскировать API misrouting. Container frontend намеренно не proxy-рует API:
его `/_frontend/health` принадлежит image, а API/health paths в нём получают
non-HTML `404`. Полная host/path table и probes описаны в
[same-origin ingress runbook](../runbooks/frontend-same-origin-ingress.md).

### OCI runtime ownership boundary

Frontend OCI image владеет собранными static assets, Nginx на non-root `8080`
и внутренним `/_frontend/health`. Он не владеет hostname, TLS, HSTS, backend
credentials, API routing, GHCR access или Dokploy/VPS configuration. Эти
границы принадлежат ingress и следующему operator/deployment этапу; hostname
не baked into image.

## Контракт ошибок

### Transport normalization

```text
Axios error
→ normalizeApiError
├── response отсутствует
│   └── ApiNetworkError
├── media type/body/status не соответствуют контракту
│   └── ApiProtocolError
└── валидный application/problem+json
    └── ApiProblemError
        ├── status
        ├── stable code
        ├── requestId
        ├── errors[].pointer
        └── retryAfterMs
```

Валидный Problem Details обязан иметь правильный media type, status и runtime
schema. Неизвестный `code`, HTML error page, JSON другого формата или
несовпадающий status считаются protocol error.

`apiMutator` сохраняет generated operation error type. Особый случай:
`GET /health/ready` и `GET /health/startup` могут вернуть operational
`503 application/json` как данные. `503 application/problem+json` остаётся
ошибкой.

### Что разрешено показывать

UI ветвится по стабильному `code`, а не по `title` или общему `detail`.

- `code` определяет программную ветку;
- `requestId` можно показывать как идентификатор для поддержки;
- raw `detail` общего Problem Details не выводится;
- неизвестная ошибка получает безопасный локализованный fallback.

Validation field errors — узкое исключение. Feature задаёт allowlist известных
JSON pointers, например `/email`, `/title` или `/description`. Для каждого
поддерживаемого поля берётся первое сообщение. Неизвестные pointers
игнорируются и не попадают в UI.

### Уровни обработки

| Уровень             | Ответственность                                           |
| ------------------- | --------------------------------------------------------- |
| `normalizeApiError` | HTTP/media type/runtime schema и три класса ошибок        |
| `QueryClient`       | общая query retry policy                                  |
| `RouteError`        | route loading, auth redirect, safe fallback, revalidation |
| entity              | cache recovery и refetch конкретных данных                |
| feature             | domain codes, form pointers и текст действия              |
| shared UI           | доступное визуальное состояние                            |

Queries повторяются не более общей policy: network error и Problem Details
`5xx` могут быть повторены, protocol error не повторяется. Mutations
автоматически не повторяются.

`RouteError`:

- очищает session/CSRF и перенаправляет только при
  `AUTHENTICATION_REQUIRED`;
- показывает безопасные сообщения для network, protocol, authorization,
  dependency и internal errors;
- показывает `requestId` там, где он нужен для диагностики;
- вызывает `revalidator.revalidate()` для retryable route errors.

Feature обрабатывает собственные domain codes. Например, decision mutation
при `APPROVAL_REQUEST_ALREADY_DECIDED` или `APPROVAL_REQUEST_NOT_FOUND`
обновляет только текущий detail query, а не выдуманный list cache.

Тест ошибки должен проверять:

1. точный пользовательский текст;
2. отсутствие raw backend `detail`;
3. mapping только разрешённых pointers;
4. session/CSRF cleanup при истечении сессии;
5. retryable/non-retryable поведение;
6. fallback с `requestId`;
7. необходимые cache invalidation/refetch;
8. redirect и безопасный `returnTo`.

## React Query и cache

`src/app/config/query-client.ts` задаёт общую retry policy. Query cache
разделяется providers, router loaders, entities и features через один
`QueryClient`.

Entity владеет:

- каноническим query key;
- query options;
- query hook;
- cache write/invalidate/refetch helpers;
- presentation данных, если она переиспользуется.

Feature после mutation не создаёт параллельное состояние ответа. Она записывает
точный server DTO в entity cache либо инвалидирует только реально существующий
query. Optimistic behavior добавляется только как отдельный подтверждённый
контракт.

Session cache использует один `currentSessionQueryKey`. Logout,
authentication loss и redirect очищают его вместе с CSRF.

## Shared UI и TSDoc

До создания повторяемого control проверьте `src/shared/ui`. Существующие
контракты и обязательные сценарии описаны в
[UI guidelines](ui-guidelines.md).

Ключевые примеры:

- action — `Button`;
- pending action — `Button isLoading` и `loadingLabel`;
- form controls — `TextField`, `PasswordField`, `TextareaField`;
- page width — `Container`;
- form/page error — destructive `Alert`;
- необратимое действие — `AlertDialog`.

App-wide layout принадлежит `widgets`, route-specific composition — `pages`.
Base UI composition использует `render`, а не Radix `asChild`.

Каждый новый или изменённый handwritten export получает русскоязычный TSDoc по
[руководству](tsdoc-guidelines.md). Generated source не документируется
вручную.

## Эталонный `approval-requests`

Reference module показывает полный вертикальный путь:

```text
backend operation
→ OpenAPI snapshot
→ generated transport/DTO/Zod
→ shared/api public exports
→ entities/approval-request
→ create/open/decide features
→ route pages
→ router
→ AppShell navigation
```

Он демонстрирует:

- detail query identity и cache writes;
- отсутствие выдуманного list endpoint/cache;
- create с переходом к server-created resource;
- open по UUID;
- permission-aware decision UI;
- server-authoritative terminal state;
- domain error recovery;
- protected routing и session revalidation.

Подробный разбор и checklist нового capability находятся в
[business module guide](business-modules.md).

## Типы файлов и их статус

| Тип                      | Пути                                                                        | Правило                             |
| ------------------------ | --------------------------------------------------------------------------- | ----------------------------------- |
| Handwritten production   | `src/**`, кроме generated                                                   | Изменять с тестами и TSDoc          |
| Generated production     | `src/shared/api/generated/**`, `generated-zod/**`                           | Только через Orval                  |
| Committed API contract   | `openapi/openapi.json`                                                      | Только через осознанный sync        |
| Active architecture docs | `AGENTS.md`, `README.md`, `docs/architecture/**`, `docs/getting-started.md` | Должны соответствовать source       |
| Historical records       | `docs/superpowers/**`                                                       | Не считать активным планом продукта |
| Local tool state         | `.superpowers/**`                                                           | Не копировать и не коммитить        |
| Local/build artifacts    | `.env`, `.env.local`, `node_modules`, `dist`                                | Не копировать в новый проект        |

## Уровни проверки

Не объединяйте разные виды доказательств:

1. **Source review** — пути, imports, contracts и diff выглядят согласованно.
2. **Local source gate** — `pnpm check` прошёл на закреплённом runtime.
3. **Local OCI gate** — Docker-dependent `pnpm oci:check` проверил локально
   собранный `linux/amd64` image; это не remote evidence.
4. **Browser/runtime** — frontend действительно работает с запущенным backend,
   CORS, cookie, CSRF и тестовым пользователем.
5. **Remote CI** — конкретный GitHub run завершился успешно.
6. **GHCR publication** — конкретный image digest опубликован и доступен.
7. **Deployment** — конкретная среда запущена и проверена.

Evidence flows отличаются:

```text
source → pull request → CI: pnpm check
merge/push в integration branch → gate → build → GHCR digest → Trivy → pull → smoke → candidate
candidate digest → отдельный deployment operator → hosted runtime
```

SHA/run tag — locator workflow, не release identity: operator использует exact
digest только после успешных scan и smoke. Merge/push может создать candidate,
но не выполняет deployment. Локальный commit, `pnpm check` или `pnpm oci:check`
не является remote CI, GHCR publication или deployment evidence.
