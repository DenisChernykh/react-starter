# Подключение бизнес-модуля

`approval-requests` — эталонный вертикальный business slice. Начинать нужно с
реального пользовательского пути и существующего backend-контракта, а не с
универсального CRUD-слоя.

## Happy path

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

1. `ApprovalRequestsModule` в `nest-js-starter` владеет HTTP capability и
   публикует её в `docs/api/openapi.json`.
2. Frontend получает этот документ в committed snapshot
   `openapi/openapi.json`, затем Orval создаёт transport, DTO и Zod-схемы в
   `src/shared/api/generated/**` и `src/shared/api/generated-zod/**`.
3. `entities/approval-request` превращает generated detail request в
   handwritten query, cache и presentation contract.
4. Features создают запрос, открывают известный UUID или подтверждают решение.
5. Pages собирают feature в URL-представления, а protected router размещает их
   внутри `widgets/app-shell`.

Для `approval-requests` backend намеренно предоставляет только три операции:
создание, чтение конкретного запроса и решение. List endpoint отсутствует, поэтому
UI честно предлагает только создание и открытие по UUID.

## Контракт и генерация

Backend — единственный владелец wire contract. Frontend не импортирует backend
source, не пишет второй DTO вручную и не редактирует generated файлы.
`OPENAPI_SPEC_SOURCE` указывает на проверенный backend OpenAPI-файл только во
время синхронизации snapshot:

```bash
OPENAPI_SPEC_SOURCE=/absolute/path/to/nest-js-starter/docs/api/openapi.json \
  pnpm api:sync
pnpm api:generate
pnpm api:check
```

`pnpm api:sync` валидирует обязательные operation ID и обновляет frontend
snapshot. `pnpm api:generate` пересоздаёт Orval output из snapshot. `pnpm
api:check` пересоздаёт output из уже committed snapshot и завершится ошибкой при
drift; эта проверка не доказывает доступность backend в runtime.

`src/shared/api/index.ts` экспортирует минимальные generated request functions,
DTO и Zod schemas для handwritten кода. Generated React Query hooks намеренно
не являются UI API: иначе page или feature начинают одновременно владеть
transport, query key, cache и error policy. Новый module-specific adapter должен
скрыть их за entity/feature public API.

## Владение в FSD

| Слой            | Владелец и реальные файлы                                                                                                                                               | Ответственность                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `shared/api`    | `src/shared/api/index.ts`, `src/shared/api/generated/approval-requests/approval-requests.ts`, `src/shared/api/generated-zod/approval-requests/approval-requests.zod.ts` | Generated transport, DTO, Zod и единая нормализация API ошибок.          |
| `shared/routes` | `src/shared/routes/approval-requests.ts`                                                                                                                                | Канонические URL центра действий, create/open и detail.                  |
| `entities`      | `src/entities/approval-request/api/approval-request.ts`, `src/entities/approval-request/model/approval-request-presentation.ts`                                         | Detail query identity, cache writes, status и permission presentation.   |
| `features`      | `src/features/create-approval-request/**`, `src/features/open-approval-request/**`, `src/features/decide-approval-request/**`                                           | Отдельные user actions: create, open UUID и confirmed decision.          |
| `pages`         | `src/pages/approval-requests/**`, `src/pages/approval-request-create/**`, `src/pages/approval-request-open/**`, `src/pages/approval-request-details/**`                 | Route-specific headings и композиция одной feature либо detail state.    |
| `widgets`       | `src/widgets/app-shell/ui/app-shell.tsx`                                                                                                                                | Повторяемая защищённая оболочка, desktop navigation и mobile drawer.     |
| `app`           | `src/app/router/router.tsx`, `src/app/router/protected-layout.tsx`, `src/app/router/loaders.ts`                                                                         | Parent session loader, route tree, `Outlet` и composition shell с pages. |

Каждый slice потребляется через свой `index.ts`. Не создавайте параллельный
`src/modules`-слой и не переносите entity cache/API логику в route component.

## Query cache, session и безопасность

`entities/approval-request` владеет `approvalRequestQueryKey`, query options,
`useApprovalRequest` и `setApprovalRequest`. Ключ делегирует generated helper,
поэтому create, detail и decide обращаются к одному detail cache entry.

- После create `useCreateApprovalRequest` записывает точный ответ сервера через
  `setApprovalRequest` и ведёт на detail URL.
- После decide `useDecideApprovalRequest` записывает точный ответ сервера в тот
  же cache. Optimistic terminal state не используется.
- При `APPROVAL_REQUEST_ALREADY_DECIDED` или
  `APPROVAL_REQUEST_NOT_FOUND` decision invalidates и actively refetches только
  текущий detail query. List cache не создаётся и не invalidates.

Все private routes находятся под parent `createRequireSessionLoader`. Loader
сначала получает сессию и только после успеха монтирует business UI; detail GET
не является child loader. `AUTHENTICATION_REQUIRED` в detail query достигает
route boundary, очищающей session cache и CSRF token и возвращающей пользователя
на `/login` с `returnTo`. Create и decide вместо собственной auth state machine
запускают revalidation этого parent route.

Axios отправляет cookie credentials. Перед unsafe JSON-запросом он получает
CSRF token в памяти процесса и передаёт его в заголовке; login остаётся
исключением. Logout и auth redirect очищают token. Permission
`approval.requests.decide` управляет только видимостью decision UI; server
повторно проверяет permission, автора и terminal transition.

## Ошибки и данные, допустимые для UI

Ветвите UI по стабильному Problem Details `code`, а не по `title` или `detail`.
Общие сообщения должны быть локализованными и безопасными; для unknown problem
можно показать только `requestId`. Raw server `detail` не является общим
frontend-текстом.

`VALIDATION_FAILED` — исключение с узкой областью: create feature сопоставляет
поддерживаемые pointers `/title` и `/description` с полями формы и берёт первое
сообщение для каждого поля. Неизвестные pointers игнорируются. Для следующего
модуля явно перечислите разрешённые pointers в feature, не выводите ошибку
произвольного поля.

## Checklist нового модуля

1. Подтвердите, что backend capability и operation IDs уже описаны в OpenAPI.
2. Синхронизируйте snapshot через `OPENAPI_SPEC_SOURCE`, запустите
   `pnpm api:sync`, `pnpm api:generate` и `pnpm api:check`.
3. Экспортируйте из `shared/api` только generated contracts, которые нужны
   handwritten коду; не редактируйте generated output.
4. Создайте entity public API для query key, query/cache и presentation, если
   у capability есть самостоятельные данные.
5. Разделите пользовательские actions на features и используйте shared UI
   contracts вместо локальных controls.
6. Составьте URL-flow в `pages` и подключите его из `app/router`; private
   routes должны оставаться под существующим session loader.
7. Зафиксируйте server-response cache writes, CSRF/auth revalidation,
   permission UX и stable error-code/pointer policy тестами.
8. Добавьте русскоязычный TSDoc к новым или изменённым handwritten exports и
   запустите `pnpm check` вместе с релевантными browser/runtime проверками.

Не изобретайте frontend capability, которой нет в OpenAPI. В частности, не
добавляйте list, pagination, search, localStorage/history последних UUID,
optimistic decisions или generic CRUD/module framework без нового реального
backend-контракта и отдельного согласованного consumer.
