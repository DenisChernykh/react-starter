# Reference Approval Requests Frontend Design

## Статус

Согласовано в диалоге 2026-07-29.

Документ описывает первый исполняемый frontend business slice для
`react-starter`. Slice подключается к эталонному backend-модулю
`approval-requests`, остаётся частью основного SPA и показывает, как следующий
продуктовый модуль проходит путь от OpenAPI-контракта до маршрутов, FSD-слоёв,
React Query cache, форм, ошибок и UI-композиции.

## Источник backend-контракта

Wire contract принадлежит `nest-js-starter` и передаётся во frontend только
через `docs/api/openapi.json`.

При проектировании использован reference checkout:

```text
/private/tmp/nest-js-starter-reference-approval-requests
```

Frontend не импортирует backend source и не повторяет вручную DTO или каталог
Problem Details. Временный путь checkout не является runtime-настройкой или
частью публичного frontend-контракта.

## Цель

Добавить полностью работающий вертикальный slice, который доказывает, что
`react-starter` расширяется бизнес-функциональностью без нарушения текущих
границ:

1. backend OpenAPI синхронизируется в committed frontend snapshot;
2. generated transport остаётся в `shared/api`;
3. handwritten бизнес-контракт адаптируется в `entities`;
4. пользовательские действия изолируются в `features`;
5. route surfaces собираются в `pages`;
6. общий защищённый layout с sidebar живёт в `widgets` и подключается из
   `app/router`;
7. auth, CSRF, permissions, Problem Details и React Query cache используют уже
   существующие foundation-контракты;
8. новый модуль остаётся исполняемым примером, а не превращается в generic CRUD
   framework.

## Не входит в scope

- изменения backend source, Prisma schema, permissions или HTTP endpoints;
- список запросов, пагинация, фильтры и поиск;
- frontend-only список из `localStorage`, session memory или истории последних
  UUID;
- комментарии к решению, вложения, уведомления и повторное открытие запроса;
- создание пользователей, управление ролями или отдельная admin-панель;
- optimistic approve/reject;
- универсальный repository, form factory, workflow engine, module manifest или
  генератор бизнес-модулей;
- SSR или переход с React Router Data Mode на Framework Mode;
- Redux или другой новый global-state слой;
- публикация, deployment или изменение backend checkout.

## Backend capability

Frontend потребляет ровно три операции:

| Операция                 | HTTP                                             | Назначение                                   |
| ------------------------ | ------------------------------------------------ | -------------------------------------------- |
| `approvalRequestsCreate` | `POST /v1/approval-requests`                     | Создать pending-запрос текущего пользователя |
| `approvalRequestsGet`    | `GET /v1/approval-requests/{requestId}`          | Получить доступный текущему principal запрос |
| `approvalRequestsDecide` | `PUT /v1/approval-requests/{requestId}/decision` | Записать `approved` или `rejected`           |

Публичная проекция:

```ts
type ApprovalRequest = {
  id: string
  title: string
  description: string
  status: 'pending' | 'approved' | 'rejected'
  createdByUserId: string
  decidedByUserId: string | null
  createdAt: string
  decidedAt: string | null
}
```

Это поясняющая запись контракта. Реальный TypeScript type генерируется Orval из
OpenAPI и вручную не дублируется.

Backend намеренно не предоставляет list endpoint. Frontend поэтому не изображает
несуществующий список и предлагает два честных входа в capability:

- создать новый запрос;
- открыть существующий по UUID.

## Выбранная архитектура

### FSD vertical slice

Backend-модуль не превращается в новый frontend-слой `src/modules`.
Capability проходит через существующие Feature-Sliced Design слои:

```text
Backend ApprovalRequestsModule
        ↓ OpenAPI
shared/api generated transport
        ↓
entities/approval-request
        ↓
create / open / decide features
        ↓
approval request pages
        ↓
protected app shell and router composition
```

Это предпочтительнее единой директории `src/modules/approval-requests`, потому
что стартер уже использует FSD и проверяет его Steiger. Параллельная модульная
иерархия создала бы два способа раскладывать одну и ту же frontend-логику.

Page-centric реализация также отклонена: она спрятала бы API/cache/error
контракты в route components и показала бы экран, а не подключение
бизнес-возможности.

### Слои и ответственность

```text
src/
├── app/
│   └── router/
│       └── protected-layout.tsx
├── widgets/
│   └── app-shell/
├── pages/
│   ├── dashboard/
│   ├── approval-requests/
│   ├── approval-request-create/
│   ├── approval-request-open/
│   └── approval-request-details/
├── features/
│   ├── create-approval-request/
│   ├── open-approval-request/
│   └── decide-approval-request/
├── entities/
│   ├── session/
│   └── approval-request/
└── shared/
    ├── api/
    ├── routes/
    └── ui/
```

`widgets` появляется только теперь, когда существует реальный большой
повторяемый блок: один app shell используется dashboard и всеми approval
страницами.

Каждый slice экспортирует только публичный API через `index.ts`. UI не делает
deep import в generated transport и не импортирует generated React Query hooks
напрямую.

## Router contract

### Маршруты

Выбран C1 route-driven flow:

```text
/login                                  public

/                                       protected parent route
├── index                               dashboard
├── approval-requests                   action hub
├── approval-requests/new               create form
├── approval-requests/open              open-by-UUID form
└── approval-requests/:requestId        detail and decision
```

Статические `new` и `open` являются отдельными route branches, а не значениями
динамического `requestId`.

### Protected parent

Существующий `createRequireSessionLoader` переносится на protected parent и
остаётся единственной точкой допуска ко всем приватным страницам.

`ProtectedLayout` живёт в `app/router`, рендерит:

```text
AppShell
└── Outlet
```

`AppShell` не владеет маршрутизацией дочерних страниц и принимает content через
`children`. Router-specific `Outlet` остаётся в `app`.

Проверка сессии выполняется до рендера business UI. Detail query не добавляется
в child loader: это не запускает business request параллельно с session loader
и позволяет странице самой показать loading, inline error и retry.

### Route-driven выбор действия

`/approval-requests` является action hub. Он не содержит скрытые формы и не
хранит выбранное действие в local component state.

Переходы на `/new` и `/open` дают:

- работоспособные browser back/forward;
- восстановление экрана после reload;
- прямые URL;
- отдельные route tests;
- явную демонстрацию подключения feature к router.

После успешного create и после валидного open flow сходятся на
`/approval-requests/:requestId`.

## App shell и sidebar

### Desktop

App shell использует актуальный shadcn Sidebar для Base UI:

- `SidebarProvider`;
- `Sidebar`;
- `SidebarContent`;
- `SidebarMenu`;
- `SidebarMenuButton`;
- `SidebarInset`;
- `SidebarTrigger`.

Навигация содержит:

- `Обзор` → `/`;
- `Согласование` → `/approval-requests`.

Approval item остаётся active для всех его child routes. Текущий email и
`LogoutButton` находятся в нижней части sidebar.

Base UI composition использует `render`, а не Radix-only `asChild`. Если
`render` возвращает `NavLink`, button-like primitive получает корректный
`nativeButton={false}`. Stateful `className` и active state не теряются при
композиции.

### Mobile

Sidebar открывается как drawer через встроенный responsive contract shadcn.
В header остаются доступный `SidebarTrigger` и краткий route context.

Content:

- не имеет горизонтального скролла при ширине 320 px;
- остаётся одноколоночным;
- переносит decision actions на следующую строку;
- сохраняет читаемый title, UUID и status;
- не прячет основное действие только за hover.

### Layout ownership

`SidebarInset` владеет shell geometry. Page content использует существующий
`Container` для горизонтальных gutters и самостоятельно задаёт vertical
spacing.

Dashboard перестаёт владеть user/logout header и становится только содержимым
своей страницы.

## Shared UI additions

До feature-level использования добавляются или проверяются reusable contracts:

- shadcn Base UI Sidebar primitives;
- shadcn Base UI AlertDialog primitives;
- shadcn `Badge` для status presentation;
- project-owned `TextareaField`.

`TextareaField` повторяет контракт `TextField`:

- label, description и error автоматически связаны;
- `aria-invalid` и `aria-describedby` объединяются с caller props;
- native textarea props и `ref` совместимы с React Hook Form;
- generated request schema остаётся источником ограничений;
- feature не собирает raw `Field` + `Textarea` вручную.

`Button isLoading` используется для create и confirmed decision. Feature-level
spinner или замена текста кнопки на «Сохраняем…» не создаётся.

`Alert` используется для form/page errors. Status не передаётся только цветом:
`Badge` всегда содержит текст `Ожидает решения`, `Одобрен` или `Отклонён`.

## UI flow

### Action hub

`/approval-requests` показывает две последовательные action rows:

1. `Создать новый запрос`;
2. `Открыть существующий`.

Это не dashboard-card grid. Каждая строка содержит название, короткое объяснение
и явное действие.

### Create

`/approval-requests/new` содержит:

- link назад к action hub;
- `TextField` для `title`;
- `TextareaField` для `description`;
- generated Zod validation;
- `Button isLoading`;
- form-level `Alert`.

Пределы `1..120` и `1..2000` берутся из generated schema. Form values
сохраняются при server/network error.

### Open by UUID

`/approval-requests/open` содержит:

- link назад к action hub;
- UUID field;
- generated path validation;
- переход на detail только после успешной local validation.

Невалидный UUID не вызывает HTTP-запрос.

### Detail

`/approval-requests/:requestId` показывает:

- link назад к action hub;
- title;
- текстовый status badge;
- UUID;
- description;
- author identifier;
- created timestamp;
- decision actor/time для terminal state;
- decision section только для допустимого текущего UI-state.

Дата форматируется presentation helper через locale `ru-RU` и browser-local
timezone. Helper принимает необязательный `timeZone`, чтобы unit test передавал
`UTC` и оставался детерминированным. Raw timestamp остаётся generated wire data.

### Decision

Decision controls видимы только когда:

```text
request.status === "pending"
&& session.permissions includes "approval.requests.decide"
&& session.userId !== request.createdByUserId
```

Это UX-условие, а не security boundary. Backend повторно проверяет permission,
self-decision и terminal transition.

Выбран D2 confirmation flow:

1. пользователь нажимает `Одобрить` или `Отклонить`;
2. открывается decision-specific AlertDialog;
3. dialog называет запрос и предупреждает о terminal state;
4. `Отмена`, Escape и закрытие не отправляют mutation;
5. confirm отправляет точное `approved` или `rejected`;
6. confirm button показывает `isLoading`, повторное подтверждение блокируется;
7. после success dialog закрывается, cache заменяется server response, controls
   исчезают;
8. focus после отмены возвращается на trigger.

Для pending запроса без permission показывается нейтральное пояснение без
disabled action buttons. Автору объясняется, что собственный запрос нельзя
согласовать. Terminal request показывает записанное решение без action section.

## Generated API и handwritten boundary

### Snapshot и generation

`api:sync` получает authoritative backend document через
`OPENAPI_SPEC_SOURCE` или paired-backend default. Sync validation расширяется
тремя approval operation IDs, чтобы snapshot старого backend не считался
совместимым с frontend reference slice.

`api:update` обновляет:

- `openapi/openapi.json`;
- `src/shared/api/generated/**`;
- `src/shared/api/generated-zod/**`.

Generated файлы не получают ручной TSDoc и не редактируются.

`shared/api/index.ts` экспортирует только необходимые request functions, DTO и
Zod schemas. Generated hooks не становятся presentation API.

### Порядок интеграции backend и frontend

Во время реализации `api:sync` получает OpenAPI из одобренного backend reference
checkout через явный `OPENAPI_SPEC_SOURCE`. Paired-backend default может
указывать на `stage`, где approval contract ещё не интегрирован, и в таком
состоянии обязан завершиться ошибкой обязательной operation validation.

Frontend CI не скачивает соседний backend: `api:check` регенерирует output из
committed frontend snapshot. Это доказывает воспроизводимость generated
contract, но не доступность endpoints в runtime.

Для реальной интеграции backend approval contract публикуется раньше frontend
runtime либо обе feature branches проверяются совместно. Frontend не вводит
dual mode и не скрывает отсутствие backend endpoints fallback-данными.

### Entity adapter

`entities/approval-request` владеет:

- detail query key;
- detail query options;
- `useApprovalRequest(requestId)`;
- cache write helper;
- status presentation;
- permission/business-state presentation helpers, если они используются больше
  чем одним UI consumer.

Query function передаёт React Query `AbortSignal` в generated request.

`AUTHENTICATION_REQUIRED` из detail query пробрасывается в React Router error
boundary. Остальные query errors остаются данными hook result и отображаются
inline внутри app shell.

## Data flow и cache

### Create

```text
CreateApprovalRequestForm
→ generated Zod validation
→ approvalRequestsCreate
→ set detail cache from server response
→ navigate /approval-requests/{id}
```

List cache отсутствует и не инвалидируется.

### Open

```text
OpenApprovalRequestForm
→ generated UUID validation
→ navigate /approval-requests/{id}
→ useApprovalRequest
→ approvalRequestsGet with AbortSignal
```

### Decide

```text
Decision trigger
→ AlertDialog
→ confirmed approvalRequestsDecide
→ set detail cache from server response
→ render terminal state
```

Optimistic update запрещён. Решение конкурентное, terminal и необратимое;
источником истины остаётся server response.

При `APPROVAL_REQUEST_ALREADY_DECIDED` frontend:

1. сохраняет понятное action-level сообщение;
2. инвалидирует и перезапрашивает detail query;
3. показывает terminal state, записанный выигравшей операцией.

Network или dependency failure не удаляет уже загруженный detail.

## Session и permissions

Текущая сессия читается через `entities/session`, а не через generated
`authGetMe` из feature/page JSX.

Если business query получает `AUTHENTICATION_REQUIRED`, ошибка передаётся
существующему `RouteError`, который очищает session/CSRF state и возвращает
пользователя на login с текущим `returnTo`.

Если create/decide mutation получает `AUTHENTICATION_REQUIRED`, feature
запускает revalidation protected parent route. Session loader остаётся
владельцем повторной проверки, очистки и redirect; business feature не
реализует собственную auth state machine.

Frontend permission checks не заменяют backend RBAC:

- `approval.requests.decide` управляет видимостью decision UI;
- отсутствие read permission не интерпретируется локально;
- backend скрывает недоступный request как
  `APPROVAL_REQUEST_NOT_FOUND`.

## Error contract

UI использует stable `code`, а не сравнивает `title` или `detail`.

### Create

| Условие                   | UI                                                |
| ------------------------- | ------------------------------------------------- |
| `VALIDATION_FAILED`       | `/title` и `/description` становятся field errors |
| `AUTHENTICATION_REQUIRED` | Revalidate protected route и redirect на login    |
| `DEPENDENCY_UNAVAILABLE`  | Безопасное retryable form message                 |
| Network failure           | Сообщение о соединении, значения формы сохранены  |
| `INTERNAL_ERROR`          | Generic message и `requestId`                     |
| Protocol error            | Generic non-retryable protocol message            |

### Detail

| Условие                      | UI                                         |
| ---------------------------- | ------------------------------------------ |
| Invalid route UUID           | Локальное invalid/not-found state без HTTP |
| `APPROVAL_REQUEST_NOT_FOUND` | `Запрос не существует или недоступен`      |
| `AUTHENTICATION_REQUIRED`    | Route-level authentication redirect        |
| `DEPENDENCY_UNAVAILABLE`     | Inline error и `Повторить`                 |
| Network failure              | Inline error и `Повторить`                 |
| `INTERNAL_ERROR`             | Generic message, `requestId`, retry        |
| Protocol error               | Safe non-retryable state                   |

### Decide

| Условие                            | UI                                       |
| ---------------------------------- | ---------------------------------------- |
| `APPROVAL_SELF_DECISION_FORBIDDEN` | `Нельзя согласовать собственный запрос`  |
| `AUTHORIZATION_DENIED`             | `Недостаточно прав для принятия решения` |
| `APPROVAL_REQUEST_ALREADY_DECIDED` | Action message и refetch detail          |
| `APPROVAL_REQUEST_NOT_FOUND`       | Detail становится недоступным            |
| `AUTHENTICATION_REQUIRED`          | Revalidate protected route               |
| `DEPENDENCY_UNAVAILABLE`           | Сохранить detail и разрешить явный retry |
| Network failure                    | Сохранить detail и разрешить явный retry |
| `INTERNAL_ERROR`                   | Generic message и `requestId`            |

Query используют существующую bounded retry policy. Mutations автоматически не
повторяются.

Presentation helpers тестируются отдельно, чтобы JSX не содержал разросшийся
набор transport-specific веток.

## Conditional JSX и TSDoc

Новый JSX следует project contract:

- безальтернативные ветки используют `&&`;
- перед `&&` стоит boolean;
- ternary применяется только для двух осмысленных значений.

Каждый новый или изменённый handwritten export получает русскоязычный TSDoc по
`docs/architecture/tsdoc-guidelines.md`. Для hooks фиксируются provider,
navigation, cache и error side effects. Generated файлы не документируются
вручную.

## Проверка

### OpenAPI и generation

- sync принимает reference OpenAPI с тремя approval operations;
- sync отвергает snapshot без каждой обязательной operation или с неверным
  `operationId`;
- generated `ProblemCode` содержит:
  - `APPROVAL_REQUEST_NOT_FOUND`;
  - `APPROVAL_REQUEST_ALREADY_DECIDED`;
  - `APPROVAL_SELF_DECISION_FORBIDDEN`;
- `api:check` не оставляет generated diff.

### Shared UI

- `TextareaField` связывает label, description и error;
- caller `aria-describedby` сохраняется;
- `aria-invalid` и React Hook Form registration работают;
- sidebar trigger имеет доступное имя;
- active navigation соответствует текущему approval child route;
- AlertDialog поддерживает keyboard focus, Escape/Cancel и возврат focus;
- loading actions используют существующий `Button isLoading`.

### Entity

- каждый UUID получает отдельный detail query key;
- AbortSignal доходит до request adapter;
- cache helper записывает полный server response;
- status presentation покрывает все три значения статуса;
- decision visibility покрывает permission, author и terminal state.

### Features

Create:

- invalid title/description не отправляются;
- server pointers попадают в правильные поля;
- success записывает cache и навигирует;
- network/problem error сохраняет значения;
- повторный submit блокируется во время pending.

Open:

- invalid UUID остаётся field error;
- valid UUID навигирует на canonical detail URL.

Decide:

- dialog открывается с выбранным decision;
- cancel/Escape не отправляют mutation;
- confirm отправляет точное wire value;
- pending блокирует повторное подтверждение;
- success обновляет detail cache;
- already-decided запускает refetch;
- self-decision, authorization, not-found, network и dependency failures имеют
  отдельные безопасные presentations.

### Router, pages и shell

- anonymous deep link перенаправляется на login с полным `returnTo`;
- authenticated user открывает каждый C1 route;
- hub links ведут на `/new` и `/open`;
- create/open сходятся на detail route;
- detail показывает loading, retryable error, not-found, pending и оба terminal
  states;
- query error не удаляет sidebar, кроме короткого authentication redirect;
- dashboard и approval pages используют один app shell;
- mobile drawer и desktop active navigation работают.

### Accessibility и browser QA

Проверяются 320, 768 и 1440 px:

- нет horizontal overflow;
- sidebar trigger доступен с клавиатуры;
- drawer закрывается и возвращает focus;
- form fields имеют label/error association;
- dialog trap/Cancel/Escape/restore focus работают;
- status различим текстом, а не только цветом;
- create и decision buttons сохраняют ширину в loading state;
- длинный email, UUID, title и description не ломают shell.

### Aggregate gates

Используются Node `24.18.0` и pnpm `11.15.1`.

```text
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
git diff --check
```

PASS заявляется только по свежему выводу каждого выполненного gate.

## Real-backend smoke

Если reference backend, PostgreSQL, Redis и два пользователя доступны:

```text
requester login
→ create pending request
→ copy returned UUID
→ reviewer login
→ open UUID
→ confirm approved or rejected
→ requester opens UUID
→ terminal state visible
```

Backend smoke сообщается отдельно от Vitest/MSW, build и browser layout QA.
Если Docker, user provisioning или runtime недоступны, это фиксируется как
`UNVERIFIED` с конкретной причиной и не превращается ни в frontend failure, ни
в ложный PASS.

## Документация

Добавляется `docs/architecture/business-modules.md`:

- линейный happy path подключения модуля;
- ownership generated и handwritten contracts;
- FSD mapping;
- правила query/cache;
- permission и Problem Details integration;
- checklist добавления следующего business capability;
- явный запрет копировать approval slice в универсальные CRUD abstractions без
  второго реального consumer.

Обновляются:

- `README.md` — reference slice и локальный contract update flow;
- `docs/architecture/ui-guidelines.md` — Sidebar, AlertDialog, Badge и
  `TextareaField`;
- route/API documentation, если существующая структура README требует ссылки.

## Стратегия реализации субагентами

После отдельного implementation plan работа выполняется последовательно:

1. один свежий implementer на одну завершённую task boundary;
2. после каждой task — отдельный spec/quality review;
3. следующий implementer получает task brief и только необходимые interfaces;
4. implementation agents не работают параллельно в одном worktree;
5. финальный reviewer оценивает весь branch diff.

Предварительное распределение моделей:

| Работа                                                  | Модель                   |
| ------------------------------------------------------- | ------------------------ |
| Механическая синхронизация OpenAPI и generated contract | `gpt-5.6-terra`, `high`  |
| Shared Base UI primitives и accessibility tests         | `gpt-5.6-terra`, `xhigh` |
| App shell, nested router и session integration          | `gpt-5.6-terra`, `xhigh` |
| Entity/cache/features/error integration                 | `gpt-5.6-terra`, `xhigh` |
| Документация и механические gate repairs                | `gpt-5.6-terra`, `high`  |
| Финальный whole-branch architecture review              | `gpt-5.6-sol`, `xhigh`   |

Конкретная модель указывается явно при каждом dispatch. Если fix loop проходит
три неуспешных раунда, новый implementer получает модель минимум на один уровень
сильнее.

## Acceptance criteria

Slice завершён только когда:

1. frontend snapshot содержит reviewed backend approval contract;
2. generated request/types/Zod outputs воспроизводимы через `api:check`;
3. protected parent route обслуживает dashboard и все C1 approval routes;
4. app shell даёт desktop sidebar и mobile drawer;
5. action hub не изображает отсутствующий list endpoint;
6. create и open flows приводят к canonical detail URL;
7. detail query принадлежит `entities/approval-request` и поддерживает
   cancellation;
8. create и decide используют server response для cache update;
9. approve/reject требуют D2 confirmation;
10. permissions и self-decision управляют UX, не заменяя backend security;
11. все три approval problem codes имеют отдельное безопасное поведение;
12. raw backend `detail`, rejected payload и credentials не попадают в UI или
    diagnostics;
13. shared controls используются вместо feature-level spinner, textarea field,
    dialog или sidebar implementations;
14. Steiger подтверждает FSD/public API boundaries;
15. handwritten exports имеют актуальный русскоязычный TSDoc;
16. релевантные локальные gates имеют свежий фактический результат;
17. real-backend smoke, remote CI и deployment evidence сообщаются отдельно и
    не предполагаются из локального commit.
