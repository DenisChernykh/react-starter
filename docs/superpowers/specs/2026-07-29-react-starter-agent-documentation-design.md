# Документация React Starter для AI-агента

## Цель

Дать AI-агенту достаточный локальный контекст, чтобы он мог без внешних
предположений:

1. понять назначение и состав `react-starter`;
2. безопасно скопировать starter в новый каталог без локального Git и
   артефактов;
3. персонализировать копию и инициализировать новый Git-репозиторий;
4. подключить backend OpenAPI и запустить frontend;
5. сохранить `approval-requests` как исполняемый эталон бизнес-модуля;
6. расширять router, API-контракт, обработку ошибок и UI в существующих
   архитектурных границах;
7. проверить локальную готовность, не смешивая её с runtime или публикацией.

Документация описывает фактическое состояние текущего starter. Она не добавляет
bootstrap-скрипт, не меняет runtime-поведение и не удаляет эталонный модуль.

## Структура документов

### `AGENTS.md`

`AGENTS.md` становится обязательной точкой входа для AI-агента и содержит:

- назначение starter и отличие foundation от эталонного бизнес-модуля;
- обязательную маршрутизацию к документам по типу задачи;
- безопасный протокол начала работы;
- основные архитектурные, API, security, UI и verification-инварианты;
- запрет переинициализировать исходный starter вместо новой копии;
- требование сохранять `approval-requests`, если пользователь явно не попросил
  изменить его роль.

Детальные объяснения не дублируются целиком: `AGENTS.md` задаёт обязательный
порядок действий и направляет агента в профильный документ.

### `docs/getting-started.md`

Документ является воспроизводимым runbook создания нового проекта:

1. preflight исходного и целевого каталогов;
2. копирование без `.git`, зависимостей, build output, локального env и
   tool-state;
3. `git init` только в целевом каталоге;
4. выбор зафиксированных Node и pnpm;
5. персонализация имени, HTML title, shell label, README, env и CI branch;
6. установка зависимостей;
7. синхронизация OpenAPI и генерация клиента;
8. локальный запуск frontend вместе с backend;
9. проверка login, protected shell и эталонного `approval-requests`;
10. локальные quality gates и первый commit.

Runbook содержит точные команды, safety-проверки, критерии готовности и таблицу
типичных проблем. Он отдельно предупреждает, что `pnpm check` не доказывает
доступность backend или корректность credentialed CORS в браузере.

### `docs/architecture/overview.md`

Документ объясняет существующую архитектуру как систему владельцев и runtime
потоков:

- назначение `app`, `pages`, `widgets`, `features`, `entities` и `shared`;
- composition root и providers;
- React Router Data Mode;
- React Query cache ownership;
- Axios/CSRF/Problem Details transport;
- OpenAPI snapshot и Orval generation;
- shared UI;
- test harness и FSD gate;
- место `approval-requests` как reference implementation;
- различие handwritten, generated, committed contract, historical docs и local
  tool-state.

### `README.md`

README остаётся короткой входной страницей для человека и агента. Он:

- формулирует назначение starter;
- перечисляет foundation и эталонный модуль;
- ссылается на bootstrap runbook, архитектурный обзор и профильные правила;
- сохраняет быстрый локальный запуск, API-команды и aggregate check.

## Bootstrap нового проекта

Основной сценарий:

```text
проверить source и destination
→ скопировать starter без локальных артефактов
→ инициализировать новый Git
→ персонализировать приложение
→ установить зафиксированный toolchain
→ подключить backend OpenAPI
→ запустить backend и frontend
→ проверить auth и approval reference
→ выполнить pnpm check
→ создать первый commit
```

Копирование выполняется через `rsync` с исключением:

- `.git`;
- `node_modules`;
- `dist`;
- `.env` и `.env.local`;
- локального `.superpowers`;
- системных файлов вроде `.DS_Store`.

`.env.example`, committed OpenAPI snapshot, generated source и
`docs/superpowers` сохраняются. `docs/superpowers` обозначается как историческая
проектная документация, а не активный implementation plan нового продукта.

Перед копированием агент обязан:

- разрешить абсолютные пути;
- подтвердить, что source — текущий starter;
- подтвердить, что destination не совпадает с source и не является его
  родительским каталогом;
- не перезаписывать непустой destination без явного разрешения.

После копирования персонализируются только подтверждённые product-facing места:

- `package.json` — package name;
- `index.html` — document title;
- `src/widgets/app-shell/ui/app-shell.tsx` — product label;
- `README.md` — название и назначение нового продукта;
- `.env.local` — API origin;
- `.github/workflows/ci.yml` — integration branch, если проект использует не
  `stage`.

Глобальная замена `react-starter`, `nest-js-starter` или `approval-requests`
запрещена: эти строки могут обозначать архитектурное происхождение,
backend-контракт, Problem Details type URI, тестовые данные или сохраняемый
эталонный модуль.

## Карта архитектуры

Foundation включает:

| Область                            | Владелец                               |
| ---------------------------------- | -------------------------------------- |
| Composition root                   | `src/app/entrypoint`, `src/app/config` |
| Route tree и auth gate             | `src/app/router`                       |
| Повторяемая application shell      | `src/widgets/app-shell`                |
| Session entity и cache             | `src/entities/session`                 |
| API transport и generated contract | `src/shared/api`                       |
| Runtime env                        | `src/shared/config`                    |
| Shared controls                    | `src/shared/ui`                        |
| Test harness                       | `src/shared/lib/testing`               |
| FSD gate                           | `steiger.config.ts`                    |

`approval-requests` проходит через generated transport, entity, features,
pages, router и shell navigation. Он остаётся исполняемым примером. Новый
несвязанный capability создаётся отдельным вертикальным slice, а не добавляется
внутрь approval-модуля.

## Router contract

Приложение использует React Router Data Mode:

```text
AppProvider
→ RouterProvider
→ createBrowserRouter
├── /login
│   └── createRedirectAuthenticatedLoader
└── protected /
    ├── createRequireSessionLoader
    ├── RouteError
    ├── ProtectedLayout
    └── AppShell + child pages
```

Инварианты:

- route tree принадлежит `src/app/router/router.tsx`;
- `/login` остаётся публичным sibling защищённой ветки;
- private pages добавляются как children защищённого `/`;
- protected parent loader получает свежую сессию через `/v1/auth/me` и передаёт
  `AbortSignal`;
- только `AUTHENTICATION_REQUIRED` превращается в redirect на login;
- redirect сохраняет безопасный `returnTo`;
- session loader должен завершиться до запросов данных private page;
- данные бизнес-модуля загружаются через entity React Query adapters, а не
  дублируются в route loader;
- постоянные URL/builders принадлежат `shared/routes`;
- постоянная navigation принадлежит `widgets/app-shell`;
- route-level ошибки обрабатывает `RouteError`;
- mutation, обнаружившая истёкшую сессию, запускает revalidation защищённого
  parent route;
- page под `AppShell` не создаёт второй `<main>`.

Checklist нового route:

1. Создать page slice и public `index.ts`.
2. Определить канонический URL в `shared/routes`, если путь используется более
   чем в одном месте или требует builder.
3. Подключить page к public или protected ветке.
4. Добавить navigation только для постоянного раздела.
5. Оставить entity/feature behavior за пределами `router.tsx`.
6. Проверить direct deep link, anonymous redirect, `returnTo`, порядок session
   и business requests, а также route error boundary.

## OpenAPI и Orval

Контракт проходит следующий путь:

```text
backend OpenAPI
→ pnpm api:sync
→ openapi/openapi.json
→ pnpm api:generate
├── generated React Query/Axios operations
├── generated DTO и union types
└── generated Zod schemas
→ src/shared/api/index.ts
→ handwritten entity/feature adapters
```

Команды имеют разные гарантии:

- `pnpm api:sync` обновляет committed snapshot из
  `OPENAPI_SPEC_SOURCE` или sibling backend;
- `pnpm api:generate` очищает и пересоздаёт оба generated-каталога;
- `pnpm api:update` выполняет sync и generation;
- `pnpm api:check` повторяет generation и завершается ошибкой при Git diff в
  snapshot или generated output.

`orval.config.ts` создаёт:

- tag-split request functions;
- DTO и enum-like union types;
- React Query query keys и query options;
- Axios transport через `apiMutator`;
- отдельные строгие Zod 4 schemas для body, params, query, headers и responses.

Инварианты:

- backend OpenAPI — единственный владелец wire contract;
- frontend не создаёт параллельные DTO;
- `generated/**` и `generated-zod/**` не редактируются вручную и не получают
  TSDoc;
- generated output коммитится;
- handwritten-код импортирует минимальный публичный контракт через
  `src/shared/api/index.ts`;
- page не использует generated React Query hooks напрямую;
- entity владеет query identity, options и cache;
- feature владеет mutation и пользовательским действием;
- generated validation presentation локализуется снаружи generated source;
- `OPENAPI_SPEC_SOURCE` относится к build-time sync, а `VITE_API_BASE_URL` — к
  runtime transport.

Новый endpoint добавляется через backend schema, tag и стабильный
`operationId`, после чего агент обновляет snapshot, генерирует output,
просматривает diff, экспортирует только нужный public API и создаёт handwritten
adapter. Список `requiredOperations` в sync-script является обязательным
foundation/reference контрактом, а не списком всех endpoint приложения.

## Error contract

Ошибки проходят через уровни:

| Уровень             | Ответственность                          |
| ------------------- | ---------------------------------------- |
| `apiMutator`        | Перехват ошибки Axios                    |
| `normalizeApiError` | Проверка HTTP/media type/Problem Details |
| `QueryClient`       | Retry policy для queries                 |
| `RouteError`        | Ошибка загрузки route и revalidation     |
| Feature mapper      | Domain codes и field errors              |
| Shared UI           | Безопасное локализованное отображение    |

Классификация:

```text
нет HTTP response
→ ApiNetworkError

неверный Content-Type, status или body
→ ApiProtocolError

валидный application/problem+json
→ ApiProblemError
   ├── status
   ├── stable code
   ├── requestId
   ├── errors[].pointer
   └── retryAfterMs
```

Инварианты:

- UI ветвится по стабильному `code`, а не по `title` или общему `detail`;
- malformed или unknown response становится `ApiProtocolError`;
- `requestId` разрешён для обращения в поддержку;
- field errors используются только через allowlist известных JSON pointers;
- неизвестные pointers игнорируются, для поля берётся первая поддерживаемая
  ошибка;
- queries повторяются только для network/`5xx` в пределах общей retry policy;
- mutations автоматически не повторяются;
- `AUTHENTICATION_REQUIRED` очищает session/CSRF и ведёт на login;
- `AUTHORIZATION_DENIED` не означает anonymous session;
- domain conflicts обрабатываются внутри соответствующей feature;
- JSON `503` readiness/startup может быть operational result, но
  `application/problem+json` остаётся ошибкой.

Тесты должны проверять точный пользовательский текст, отсутствие raw backend
`detail`, session/CSRF cleanup, retryable state, pointer mapping, fallback с
`requestId`, domain cache recovery и `returnTo`.

## Проверка

Изменения затрагивают только Markdown-документацию. Проверка включает:

1. отсутствие `TODO`, `TBD`, placeholders и противоречий;
2. соответствие путей, команд и названий текущему source;
3. Markdown formatting через проектный Prettier;
4. проверку ссылок на существующие локальные документы;
5. `git diff --check`;
6. просмотр итогового diff;
7. `pnpm check`, поскольку README и agent contract описывают эту команду как
   aggregate gate и документация должна соответствовать фактическому checkout.

В финальном отчёте локальные проверки отделяются от browser/runtime и
публикации. Никакой push, pull request или deployment не входит в задачу.
