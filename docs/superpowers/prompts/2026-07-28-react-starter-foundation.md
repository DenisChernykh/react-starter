# React Starter Foundation Execution Prompt

Работай в репозитории:

```text
/Users/denischernykh/projects/starters/react-starter
```

Твоя задача — полностью выполнить утверждённый план:

```text
docs/superpowers/plans/2026-07-28-react-starter-foundation.md
```

Архитектурный источник требований:

```text
docs/superpowers/specs/2026-07-28-react-starter-foundation-design.md
```

## Обязательный рабочий процесс

1. Сначала полностью прочитай спецификацию и план.
2. Используй `superpowers:using-git-worktrees`, затем
   `superpowers:executing-plans` или
   `superpowers:subagent-driven-development`.
3. Создай из актуальной `origin/stage` отдельную ветку
   `feat/react-starter-foundation`. Не реализуй задачу напрямую в `stage`.
4. Активируй Node `24.18.0` и pnpm `11.15.1`.
5. Перед установкой новых библиотек проверь текущую стабильную документацию
   через Context7. Если Context7 недоступен или исчерпал квоту, используй
   только официальную документацию библиотек, перечисленную в Task 1.
6. Выполняй план по порядку, не перескакивая через RED/GREEN-проверки и
   контрольные коммиты.
7. После каждого Task сверяй изменённые файлы с его `Files`, `Interfaces` и
   ожидаемыми командами.
8. Не изменяй сгенерированные Orval-файлы вручную.
9. Не копируй auth, JWT refresh, Axios interceptors, UI или error handling из
   `admin-codex`. Его можно использовать только как отрицательное сравнение:
   в этом starter нет JWT и refresh flow.
10. Не добавляй ничего из раздела `Deferred after the first iteration`.

## Критические контракты

- Backend OpenAPI:
  `../nest-js-starter/docs/api/openapi.json`.
- Frontend snapshot: `openapi/openapi.json`.
- Auth endpoints:
  `POST /v1/auth/login`,
  `GET /v1/auth/me`,
  `GET /v1/auth/csrf`,
  `POST /v1/auth/logout`.
- Сессия хранится только в opaque HttpOnly cookie backend. Фронтенд не читает
  и не сохраняет cookie/token.
- CSRF хранится только в памяти модуля, лениво восстанавливается через один
  дедуплицированный `GET /v1/auth/csrf` и передаётся как `X-CSRF-Token`.
- Для любого unsafe request отправляй `Content-Type: application/json`; login
  освобождён только от CSRF header, но не от JSON media type.
- Axios всегда использует `withCredentials: true`.
- Редирект на `/login` происходит только для problem code
  `AUTHENTICATION_REQUIRED`.
- `AUTHORIZATION_DENIED`, `DEPENDENCY_UNAVAILABLE`, network failure и invalid
  problem response остаются явными ошибочными состояниями.
- Поведение определяется по `problem.code`, не по тексту `title` или `detail`.
- Orval mutator обязан сохранить generic error body:

```ts
type ErrorType<ErrorData> = ApiClientError<ErrorData & ProblemDocumentLike>
```

- UI не импортирует generated query hooks напрямую.
- Dashboard пустой, кроме email текущего пользователя и logout.

## Проверка

Перед любым заявлением о завершении используй
`superpowers:verification-before-completion` и выполни свежие команды:

```bash
pnpm install --frozen-lockfile
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
git diff --check
```

Отдельно проверь реальный браузерный flow с запущенным
`nest-js-starter`:

```text
anonymous / -> /login
login -> /
reload / -> session restored by /v1/auth/me
logout with CSRF -> /login
/v1/auth/me returning 503 -> retryable error, not /login
```

Не объявляй browser smoke успешным, если PostgreSQL, Redis или backend не были
реально запущены. Отчитай отдельно:

```text
local automated gates
real-backend browser smoke
remote CI
PR/merge status
```

После локального завершения отправь ветку, создай PR в `stage` и дождись CI.
PR не мержи без отдельного явного разрешения пользователя.
