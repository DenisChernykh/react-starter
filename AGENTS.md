# Инструкции для агента

## Что это за репозиторий

`react-starter` — копируемая основа нового React-приложения, а не пустой Vite
template и не законченный продукт.

Foundation уже содержит:

- React Router Data Mode с публичной и защищённой ветками;
- cookie-based session auth и CSRF token только в памяти;
- Axios transport и Problem Details normalization;
- TanStack Query и явное владение cache;
- committed OpenAPI snapshot и генерацию Orval;
- Feature-Sliced Design и Steiger gate;
- shared Base UI/shadcn controls;
- Vitest, Testing Library и MSW;
- aggregate gate `pnpm check`.

`approval-requests` — исполняемый эталонный бизнес-модуль. Он показывает
интеграцию от backend OpenAPI до entity, features, pages, router и navigation.
Не удаляй и не переименовывай его автоматически как «демо». Новый несвязанный
capability создавай отдельным vertical slice по той же схеме.

## Обязательное чтение

Выбирай документ по задаче до изменения source:

| Задача                                 | Документ                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Создать новый проект из starter        | [bootstrap runbook](docs/getting-started.md)                                                                                                    |
| Понять состав и runtime flows          | [архитектурный обзор](docs/architecture/overview.md)                                                                                            |
| Подключить бизнес-модуль               | [business module guide](docs/architecture/business-modules.md)                                                                                  |
| Создать или расширить shared UI        | [UI guidelines](docs/architecture/ui-guidelines.md)                                                                                             |
| Изменить handwritten export            | [TSDoc guidelines](docs/architecture/tsdoc-guidelines.md)                                                                                       |
| Подготовить OCI-публикацию или ingress | [публикация frontend image](docs/runbooks/frontend-image-publication.md) и [same-origin ingress](docs/runbooks/frontend-same-origin-ingress.md) |
| Выполнить deployment или rollback      | [Dokploy operator](docs/runbooks/frontend-dokploy-deployment.md) и [explicit rollback](docs/runbooks/frontend-dokploy-rollback.md)              |

При создании нового проекта выполни `docs/getting-started.md` по порядку. Не
восстанавливай bootstrap по памяти или только по краткому README.

`docs/superpowers/**` содержит исторические design/implementation records. Они
не являются автоматически активным планом текущей задачи.

## Начало работы

Перед изменениями:

1. Выполни `git status --short --branch`, определи branch и сохрани чужие
   изменения, untracked files и worktrees.
2. Проверь `node --version` и `pnpm --version`. Проект закреплён на Node
   `24.18.0` и pnpm `11.15.1`.
3. Определи, работаешь ли ты в исходном starter или в уже созданной product
   copy.
4. Прочитай профильный документ из таблицы выше.
5. Назови проверку, которая докажет требуемый результат.

Не выполняй reset, clean, stash, удаление, переинициализацию Git, push, PR или
deployment без соответствующего запроса.

Если задача — создать новый продукт:

- исходный starter является read-only source для копирования;
- destination должен быть новым несуществующим путём вне starter;
- `.git`, `.env*`, `node_modules`, `dist` и `.superpowers` не копируются;
- новый `git init` выполняется только внутри destination;
- `approval-requests` сохраняется как reference implementation.

## Архитектурные границы

```text
app → pages → widgets → features → entities → shared
```

- `app` владеет entrypoint, providers, route tree и global boundaries.
- `pages` собирает route-specific UI.
- `widgets` владеет крупной повторяемой композицией, например `AppShell`.
- `features` реализует пользовательские действия.
- `entities` владеет query identity, cache и presentation самостоятельных
  данных.
- `shared` содержит transport, config, routes, libraries и UI primitives без
  знания верхних слоёв.

Потребляй slice через его `index.ts`. Не создавай параллельный `src/modules`,
не обходи public API и не переноси entity cache/API логику в page или router.

## Router

Следуй [router contract](docs/architecture/overview.md#router-data-mode).

1. Route tree принадлежит `src/app/router/router.tsx`.
2. `/login` остаётся публичным sibling, private pages — children защищённого
   `/`.
3. `createRequireSessionLoader` выполняет свежий `/v1/auth/me` и передаёт
   `AbortSignal`; cached user не является доказательством действующей сессии.
4. Только `AUTHENTICATION_REQUIRED` очищает session/CSRF и ведёт на login с
   безопасным `returnTo`.
5. Business data загружай через entity React Query adapters после session
   gate, не дублируй их в route loader.
6. Канонические URL/builders размещай в `shared/routes`.
7. Постоянная navigation принадлежит `AppShell`; route-specific composition —
   page.
8. При истечении сессии внутри mutation запускай revalidation защищённого
   parent route.
9. Не создавай второй `<main>` внутри `AppShell`.
10. Новый route проверяй direct deep link, anonymous redirect, `returnTo`,
    session/request ordering, matching и `RouteError`.

## OpenAPI и Orval

Backend OpenAPI — единственный источник wire contract:

```text
backend OpenAPI
→ openapi/openapi.json
→ Orval generated TypeScript/Zod
→ shared/api public API
→ entity/feature adapters
```

Команды имеют разные назначения:

- `pnpm api:sync` — обновить committed snapshot;
- `pnpm api:generate` — пересоздать оба generated output;
- `pnpm api:update` — sync и generation;
- `pnpm api:check` — повторить generation и потребовать отсутствие Git diff.

Правила:

1. Не редактируй `src/shared/api/generated/**` и
   `src/shared/api/generated-zod/**` вручную.
2. Не создавай frontend DTO, дублирующий OpenAPI.
3. Экспортируй в handwritten-код только нужный минимум через
   `src/shared/api/index.ts`.
4. Page не импортирует generated React Query hooks напрямую: query/cache
   принадлежит entity, mutation — feature.
5. `OPENAPI_SPEC_SOURCE` выбирает build-time source. Browser transport всегда
   обращается к относительному same-origin `/v1`; `DEV_API_PROXY_TARGET`
   действует только в Vite `serve` и не попадает в production bundle.
6. Generated Zod presentation локализуй снаружи generated files.
7. После изменения backend contract выполни `api:update`, просмотри diff,
   затем `api:check` и `pnpm check`.

## Ошибки

Transport нормализует сбои в три класса:

- `ApiNetworkError` — HTTP response отсутствует;
- `ApiProtocolError` — media type, status, body или code нарушают контракт;
- `ApiProblemError` — валидный `application/problem+json`.

UI ветвится по стабильному `code`, а не по `title` или общему `detail`.

- Raw server `detail` не является безопасным общим UI-текстом.
- `requestId` можно показать для обращения в поддержку.
- Field errors используются только через allowlist известных
  `errors[].pointer`; неизвестные pointers игнорируются.
- Queries повторяются только по общей policy для network/`5xx`; mutations
  автоматически не повторяются.
- `AUTHORIZATION_DENIED` не означает anonymous session.
- Domain conflicts и cache recovery принадлежат соответствующей feature/entity.
- Route error, form error и mutation error должны иметь точные
  пользовательские тесты без утечки raw backend detail.

Полный pipeline описан в
[error contract](docs/architecture/overview.md#контракт-ошибок).

## Безопасность

1. Session cookie является opaque и HttpOnly; frontend не читает и не хранит
   session token.
2. CSRF token хранится только в памяти. Не используй localStorage,
   sessionStorage, IndexedDB, persisted query cache или logs.
3. Axios отправляет cookie credentials и добавляет CSRF к unsafe requests,
   кроме login.
4. Credentialed CORS требует точного frontend origin: scheme, host и port.
5. Не выводи secrets, credentials, CSRF token, cookie или raw server payload в
   команды, логи и отчёт.

## Deployment operator

1. Не изменяй VPS, Dokploy Application, domains, Traefik, registry или live
   environment без явного запроса пользователя.
2. `deployment:preflight` read-only относительно Dokploy, но всё равно требует
   live GitHub, GHCR и Dokploy credentials; не запускай его как обычный
   локальный gate.
3. Локальные operator tests с fake ports доказывают source contract, но не
   совместимость API установленного Dokploy instance.
4. Bootstrap/promotion/rollback запускаются только с `--apply`; rollback всегда
   явный и никогда не выполняется автоматически после ошибки.
5. Не заявляй deployment PASS без exact digest, deployment ID со статусом
   `done`, успешного hosted smoke и сохранённого redacted evidence.

## Проверка результата

Для source-изменений основной локальный gate:

```bash
pnpm check
```

Он проверяет OpenAPI drift, formatting, ESLint, FSD, tests и production build.
Перед заявлением о готовности используй свежий вывод текущего checkout.

Отдельный Docker-dependent gate `pnpm oci:check` собирает локальный
`linux/amd64` frontend image и выполняет его smoke-проверку. Он не входит в
`pnpm check`, требует доступный Docker daemon и не является доказательством
remote CI, GHCR publication или deployment.

Разделяй доказательства:

1. source review;
2. local gates;
3. browser/runtime с реальным backend;
4. remote CI;
5. publication/merge;
6. deployment с ID и hosted smoke.

Локальный commit, `pnpm check` или `pnpm oci:check` не доказывает remote CI,
публикацию или deployment. Push в integration branch (обычно после merge)
может запустить workflow и опубликовать проверенный candidate image, но сам по
себе не выполняет deployment. В отчёте явно указывай, какие уровни
действительно проверены.

## Условный JSX

1. Для условного JSX без альтернативной ветки используй `&&`, а не тернарный оператор с `null`: `isVisible && <Component />`.
2. Тернарный оператор используй только когда обе ветки содержат осмысленное значение.
3. Перед `&&` допускаются только булевы условия. Для строк, чисел и других значений используй `Boolean(value)` или явное сравнение, чтобы React не отрендерил значение условия.

## TSDoc

1. Следуй [руководству по TSDoc](docs/architecture/tsdoc-guidelines.md) для всех новых и изменённых рукописных API.
2. Добавляй или актуализируй TSDoc для каждого нового или изменённого экспортируемого рукописного API: функций, React-компонентов, хуков, типов, интерфейсов, enum, экспортируемых констант, вспомогательных функций, конфигураций, маппингов и ключей кеша.
3. Для приватных помощников TSDoc нужен, если их контракт, побочные эффекты, fallback-поведение или инварианты неочевидны из реализации и имени.
4. Тесты не требуют TSDoc, если их намерение ясно из `describe` и `it`. Вспомогательные декларации документируй только когда они экспортируются или имеют неочевидный контракт.
5. Не добавляй TSDoc и не редактируй вручную сгенерированные файлы.
6. Перед завершением работы сопоставь изменённые экспортируемые рукописные API с руководством и их русскоязычным TSDoc.
7. ESLint предупреждает о пропущенном или пустом TSDoc для прямых ESM-экспортов в рукописных `.ts` и `.tsx` файлах. Он не заменяет проверку смыслового контракта из руководства.

## UI-компоненты

1. Следуй [контрактам shared UI](docs/architecture/ui-guidelines.md).
2. Перед созданием повторяемого control или состояния проверь `src/shared/ui`;
   если контракта нет, сначала расширь shared-компонент и его тесты.
3. Не реализуй локальные loading-spinner, form-field и page-container паттерны,
   когда для сценария уже есть `Button`, `TextField`, `PasswordField` или
   `Container`.
