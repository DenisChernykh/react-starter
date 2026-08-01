# Immutable deployment foundation для React Starter

## Статус

Дизайн одобрен 30 июля 2026 года для реализации в `react-starter`.

## Контекст

`react-starter` уже имеет полный source gate `pnpm check`, но не имеет
deployable OCI image, публикации в registry и воспроизводимого оператора
Dokploy.

Текущий browser runtime зависит от абсолютного `VITE_API_BASE_URL`:

```text
VITE_API_BASE_URL
→ Vite вшивает значение в browser bundle
→ Axios использует абсолютный baseURL
→ cookie credentials отправляются на этот origin
```

Из-за этого собранный frontend привязан к окружению. Один digest нельзя
продвигать между разными доменами без повторной сборки, а credentialed CORS
становится частью production happy path.

Текущий GitHub workflow запускает `pnpm check` и для pull request в `stage`, и
для `push` в `stage`, но ничего не публикует. Merge, локальный container smoke,
GHCR publication и Dokploy deployment являются разными уровнями доказательств
и не должны смешиваться.

## Решение

Starter получает общую deployment foundation:

```text
pull request в stage
→ source gate
→ merge
→ push event ветки stage
→ повторный source gate
→ immutable linux/amd64 image
→ GHCR exact digest
→ vulnerability scan
→ smoke опубликованного digest
→ проверенный кандидат
→ отдельный ручной Dokploy promotion
→ HTTPS smoke
→ при необходимости отдельный ручной rollback
```

Production browser использует same-origin API. Один frontend digest не
содержит environment-specific API URL и может быть развёрнут в любом
подготовленном окружении.

Merge в `stage` только создаёт проверенный кандидат. Он не меняет состояние
Dokploy или VPS.

## Цели

1. Собирать минимальный non-root frontend image с воспроизводимым runtime.
2. Публиковать image после merge в `stage` как immutable GHCR digest.
3. Проверять опубликованный digest сканированием и container smoke.
4. Развёртывать только явно выбранный digest через отдельный ручной оператор.
5. Защищать promotion от stale preflight и конкурентного изменения приложения.
6. Сохранять известный предыдущий digest для явного проверяемого rollback.
7. Не привязывать foundation к `production`, конкретному домену или Dokploy
   application ID.
8. Описать bootstrap и эксплуатацию так, чтобы foundation сохранялась после
   копирования starter в отдельный frontend или admin-продукт.

## Не входит в scope

- установка или обновление Dokploy на VPS;
- чтение или изменение live VPS;
- Caddy-to-Traefik cutover;
- создание live Dokploy project, environment или application;
- настройка DNS, TLS, firewall или GHCR credentials на сервере;
- публикация текущего commit в GHCR;
- реальный deployment frontend, admin или backend;
- изменение `nest-js-starter` или Amazing EKB repositories;
- автоматический deployment после merge;
- автоматический rollback;
- backend migrations, database backups и schema compatibility;
- multi-architecture image;
- runtime JavaScript-конфигурация, меняющая API URL после сборки;
- managed Dokploy Cloud как обязательная зависимость.

Эти операции требуют отдельной задачи и отдельной авторизации. Текущая работа
подготавливает только source, локальные проверки, workflow и runbooks.

## Архитектурные границы

Foundation состоит из четырёх независимых блоков:

| Блок                 | Ответственность                                            |
| -------------------- | ---------------------------------------------------------- |
| Browser runtime      | relative API requests и dev-only proxy                     |
| OCI runtime          | static files, SPA routing, health, headers и lifecycle     |
| Publication workflow | source gate, build, GHCR, scan и smoke exact digest        |
| Deployment operator  | preflight, bootstrap, promotion, polling, smoke и rollback |

Каждый блок имеет собственный интерфейс и проверяется отдельно. Dokploy не
собирает frontend source, browser не знает адрес backend-контейнера, а
publication workflow не имеет production credentials.

## Same-origin HTTP contract

### Production

Generated OpenAPI operations уже используют пути `/v1/...`. Axios больше не
задаёт `baseURL`, поэтому browser отправляет запросы на текущий origin:

```text
GET /v1/auth/me
POST /v1/auth/login
GET /v1/auth/csrf
```

`withCredentials: true`, in-memory CSRF и существующая normalization ошибок
сохраняются. Меняется только выбор origin.

`VITE_API_BASE_URL`, `publicEnv` и обязательная browser runtime env validation
удаляются. Если `src/shared/config` после этого не содержит другого контракта,
удаляется и его пустой public API. Production build не принимает API URL ни как
build argument, ни как runtime variable.

### Development

Vite dev server проксирует:

- `/v1` и все вложенные пути;
- `/health` и все вложенные пути.

Target задаётся переменной Node-процесса `DEV_API_PROXY_TARGET` и по умолчанию
равен `http://localhost:3000`. Переменная не имеет префикса `VITE_`, не
попадает в browser bundle и валидируется в `vite.config.ts` как абсолютный
HTTP(S) origin.

Локальный browser также обращается к relative `/v1`. CORS не является частью
обычного dev flow, потому что внешний browser origin остаётся origin Vite.

Vitest и MSW используют relative request URLs. Тесты transport не зависят от
публичного API origin.

### Ingress

На подготовленном окружении внешний reverse proxy владеет маршрутизацией:

```text
public host /v1/*      → backend
public host /health/*  → backend
public host /*         → public frontend

admin host /v1/*       → backend
admin host /health/*   → backend
admin host /*          → admin frontend

api host /*            → backend
```

`api` host остаётся полезным для server-to-server clients, OpenAPI и внешних
интеграций. Browser public/admin frontend не обязан использовать его.

Конкретные host names не коммитятся в reusable runtime image.

## OCI image

### Build

Dockerfile использует multi-stage build:

1. закреплённый по digest Node 24 build image;
2. установка pnpm 11.15.1 через зафиксированный package manager contract;
3. `pnpm install --frozen-lockfile`;
4. production build;
5. копирование только `dist` и HTTP-server config в runtime stage.

Implementation plan выбирает актуальные maintained base images и фиксирует
каждый из них immutable digest. Плавающие `node:24`, `latest` и аналогичные
runtime references не допускаются.

Первый контракт публикует только `linux/amd64`, соответствующий целевому VPS.

### Runtime

Runtime использует `nginxinc/nginx-unprivileged`, закреплённый по immutable
digest, и слушает container port `8080`.

В final image отсутствуют:

- frontend source;
- `node_modules`;
- package manager и build tools;
- OpenAPI snapshot;
- `.env` files;
- registry, GitHub или Dokploy credentials.

Процесс работает от non-root user. Конфигурация совместима с read-only root
filesystem и записывает временные файлы только в явно предоставленный
`tmpfs`.

### HTTP routing

HTTP-server предоставляет:

- `GET /_frontend/health` — `200`, фиксированный короткий body и `no-store`;
- существующие static assets;
- SPA fallback на `index.html` для UI routes, включая `/login` и прямые deep
  links;
- явный `404` для `/v1`, `/v1/*`, `/health` и `/health/*`.

API и backend health paths не могут попасть в SPA fallback. Если ingress
ошибочно отправит их во frontend-контейнер, ошибка останется видимой как `404`,
а не замаскируется успешным HTML.

### Cache и headers

- `index.html` возвращается без долгого кеширования;
- hashed assets получают долгий `immutable` cache;
- frontend health использует `no-store`;
- ответы получают `X-Content-Type-Options: nosniff`;
- ответы получают ограничивающий `Referrer-Policy`;
- embedding запрещается через frame policy;
- server version не публикуется.

TLS termination и HSTS принадлежат ingress, потому что frontend-контейнер
обслуживает внутренний HTTP.

### OCI metadata

Image содержит стандартные OCI labels:

- `org.opencontainers.image.source`;
- `org.opencontainers.image.revision`;
- `org.opencontainers.image.created`.

`revision` равна полному Git commit SHA. Source указывает репозиторий, из
которого собран image. Дополнительный label фиксирует точный GitHub Actions
workflow run URL. Он связывает registry digest с publication run, чей итог
проверяет deployment operator.

## Локальный OCI gate

Добавляется отдельная команда:

```bash
pnpm oci:check
```

Она:

1. собирает image из текущего checkout;
2. передаёт ожидаемые source и revision labels;
3. запускает container с read-only root filesystem и `tmpfs`;
4. выбирает свободный host port;
5. проверяет non-root process;
6. проверяет `/`, `/login` и защищённый deep link;
7. проверяет `/_frontend/health`;
8. доказывает, что `/v1/*` и `/health/*` возвращают `404`, а не HTML;
9. проверяет cache и security headers;
10. проверяет OCI revision;
11. отправляет `SIGTERM` и требует bounded clean shutdown.

`pnpm oci:check` не включается в `pnpm check`: Docker доступен не во всех
локальных средах. Publication workflow обязан выполнить оба gate.

## GitHub Actions

### Pull request gate

Текущий `.github/workflows/ci.yml` остаётся source gate, но запускается только
для pull request в `stage`:

```text
pull request
→ pnpm install --frozen-lockfile
→ pnpm check
```

Он не получает `packages: write` и не собирает release image.

### Stage publication

Отдельный workflow запускается на GitHub `push` event ветки `stage`. Обычный
happy path этого event — завершившийся merge pull request; workflow не является
рекомендацией разработчику делать прямой push.

Порядок:

1. checkout точного event SHA;
2. установка Node 24.18.0 и pnpm 11.15.1;
3. `pnpm install --frozen-lockfile`;
4. один полный `pnpm check`;
5. build и push `linux/amd64` image в GHCR;
6. получение registry digest;
7. Trivy scan опубликованного `image@sha256:...` для `HIGH` и `CRITICAL`;
8. pull того же digest;
9. OCI smoke того же digest без повторной сборки;
10. публикация digest, revision и результатов в GitHub Actions Summary.

Workflow использует:

- `contents: read`;
- `packages: write`;
- GitHub-provided token для GHCR;
- external Actions, закреплённые полным commit SHA.

Image получает уникальный технический tag вида
`sha-<full-commit-sha>-run-<run-id>-attempt-<attempt>`. Tag нужен только как
registry locator при push и не является deployment identity. `latest`,
`stage-latest`, environment tags и повторное перемещение release tag не
используются. Deployment contract всегда принимает digest, а не tag.

Если scan или smoke завершается ошибкой, digest может физически остаться в
GHCR, но не считается проверенным кандидатом. Publication workflow не содержит
Dokploy URL, API key, application ID или VPS credentials.

## Deployment operator

### Интерфейс

Repository предоставляет TypeScript CLI через package scripts:

```bash
pnpm deployment:preflight -- --manifest <path>
pnpm deployment:bootstrap -- --manifest <path>
pnpm deployment:promote -- --manifest <path>
pnpm deployment:rollback -- --evidence <path>
```

Реализация разделяется на небольшие units:

- schema и manifest parser;
- GitHub workflow verifier;
- OCI registry inspector;
- Dokploy API client;
- deployment polling;
- HTTPS smoke;
- evidence writer и redaction.

Transport adapters изолируются от orchestration, чтобы status transitions,
timeouts, drift protection и redaction проверялись без live Dokploy.

### Release manifest

Коммитятся schema и безопасный example manifest. Конкретный release manifest
создаётся оператором для выбранного кандидата и не содержит credentials.

Он фиксирует:

```text
schemaVersion
mode: bootstrap | promotion
environment
repository
workflowRunUrl
publicBaseUrl
candidate.image@sha256
candidate.revision
expectedCurrent.image@sha256 | null
expectedCurrent.revision | null
smokePaths
```

Для `promotion` `expectedCurrent` обязателен. Candidate и rollback image должны
быть разными exact digests. Для `bootstrap` оба поля `expectedCurrent` равны
`null`.

Application identity и secrets не входят в manifest. Они поступают через
process environment:

- Dokploy base URL;
- Dokploy API key;
- Dokploy application ID;
- GitHub token для проверки workflow;
- GHCR username/token, когда package закрытый.

Dokploy registry credentials настраиваются в самом Dokploy отдельно. CLI не
переносит registry token из локального окружения в application settings.

### Read-only preflight

`deployment:preflight` не вызывает mutating API и проверяет:

1. manifest schema;
2. HTTPS для внешних GitHub, Dokploy и application URLs;
3. exact digest syntax и запрет mutable reference;
4. существование candidate manifest в GHCR;
5. совпадение OCI revision и manifest revision;
6. совпадение workflow run URL в manifest и OCI label;
7. успешный publication workflow для того же repository, `stage` SHA и
   revision;
8. доступность Dokploy API и точное соответствие application ID;
9. текущий configured image приложения;
10. совпадение текущего image с `expectedCurrent`;
11. допустимость bootstrap или promotion mode.

`deployment:promote` повторяет полный preflight непосредственно перед первой
mutation. Результат более раннего ручного preflight не является lock.

### Bootstrap

Bootstrap применяется только к Dokploy application без успешного предыдущего
deployment.

Оператор:

1. доказывает отсутствие предыдущего успешного deployment;
2. требует `mode: bootstrap` и `expectedCurrent: null`;
3. явно сообщает, что application-level rollback ещё невозможен;
4. выполняет deployment и обычный smoke;
5. сохраняет candidate как первую известную good revision только после
   успешного завершения.

Если приложение уже имеет deployment history или configured exact image,
bootstrap завершается без mutation. Existing mutable или неизвестный image не
превращается автоматически в rollback target.

Infrastructure rollback во время первоначального Caddy-to-Traefik cutover
описывается отдельным VPS runbook и не является обязанностью frontend CLI.

### Promotion

Promotion выполняет:

```text
fresh preflight
→ snapshot current exact digest
→ update Dokploy application на candidate exact digest
→ trigger один deployment
→ определить его deployment ID
→ poll только этот deployment
→ дождаться terminal success
→ выполнить HTTPS smoke
→ записать evidence
```

Mutating requests не повторяются автоматически. Если Dokploy trigger response
не возвращает однозначный deployment ID, оператор сравнивает snapshot до
операции со списком после неё и требует ровно один новый deployment. Ноль или
несколько кандидатов считаются неоднозначностью и завершают команду ошибкой.

Polling имеет фиксированный deadline и bounded interval. Success одного старого
deployment не может подтвердить новую операцию.

### Hosted smoke

После успешного Dokploy status оператор проверяет:

- TLS и `GET /_frontend/health`;
- `GET /`;
- `GET /login`;
- настроенный direct deep link;
- что заведомо отсутствующий `/v1` probe не возвращает frontend HTML.

Smoke paths задаются manifest, но frontend health и API-routing probe
обязательны. Успешный Dokploy status без успешного HTTPS smoke не является
готовым deployment.

### Failure и rollback

При timeout, terminal failure или smoke failure CLI:

- завершается с non-zero status;
- не выполняет автоматический rollback;
- сохраняет redacted evidence;
- сохраняет известный предыдущий digest;
- выводит точную rollback-команду без secrets.

Rollback читает evidence и перед mutation проверяет, что current configured
image всё ещё равен неуспешному candidate digest. Это защищает более новое
ручное исправление от перезаписи.

Затем rollback:

1. переключает application на предыдущий exact digest;
2. запускает ровно один deployment;
3. ждёт только его terminal status;
4. повторяет hosted smoke;
5. пишет отдельное rollback evidence.

Изменение configured image без успешного deployment и smoke не считается
восстановлением.

### Evidence и секреты

Evidence создаётся атомарно с filesystem mode `0600` в gitignored каталоге.
Файл содержит:

- environment и application identity без API key;
- operation и timestamps;
- workflow URL;
- previous и candidate exact digests/revisions;
- Dokploy deployment ID;
- polling outcome;
- smoke results;
- итоговый status.

API keys, authorization headers, registry credentials, cookies, CSRF tokens и
raw sensitive response bodies не записываются и не выводятся. Redaction
применяется до format/log serialization, а не постобработкой готового файла.

## Ошибки и fail-closed policy

Оператор останавливается без mutation при:

- невалидном manifest;
- mutable image reference;
- несовпадении digest, revision или workflow SHA;
- неуспешном либо незавершённом publication workflow;
- недоступном registry;
- неожиданной форме ответа Dokploy;
- несовпадении `expectedCurrent`;
- попытке bootstrap существующего приложения;
- отсутствии rollback target для promotion;
- HTTP timeout.

Read-only requests могут иметь ограниченный retry для transient network/`5xx`
errors. Mutating update/deploy requests автоматически не повторяются, потому
что повтор может создать вторую операцию.

Неизвестный status Dokploy не трактуется как успех. Timeout не трактуется как
failure сервера: evidence сохраняет неопределённое состояние и требует
операторской проверки перед новым mutating действием.

## Reusable topology

Foundation не требует три домена, но поддерживает типовой вариант:

| Приложение      | Публичная граница                                    |
| --------------- | ---------------------------------------------------- |
| Backend         | API host и same-origin `/v1`/`health` router targets |
| Public frontend | public host, кроме backend path prefixes             |
| Admin frontend  | admin host, кроме backend path prefixes              |

Public frontend и admin остаются отдельными repositories, images и Dokploy
applications. Backend также является отдельным application. Они могут жить в
одном Dokploy Project/Environment, но не собираются одним workflow и не
продвигаются одним digest.

Первый frontend implementation поддерживает один выбранный Dokploy application
за запуск. Environment и application задаются снаружи, поэтому следующий target
добавляется конфигурацией, а не fork CLI.

Self-hosted Dokploy может использовать эту схему без платной Dokploy
подписки. Стоимость VPS, storage, traffic и доменов остаётся внешней.

## Проверки

### Source tests

`pnpm check` включает существующие gates и новые unit/component tests:

- relative Axios URLs и сохранённые cookie/CSRF semantics;
- Vite proxy target validation;
- release manifest parsing;
- immutable digest validation;
- workflow/revision mismatch;
- bootstrap guards;
- stale `expectedCurrent`;
- успешный promotion;
- terminal failure;
- timeout и неизвестный status;
- неоднозначный deployment ID;
- hosted smoke failure;
- rollback drift protection;
- redaction.

Adapters тестируются через controlled fakes без live GitHub, GHCR или Dokploy.

### Container tests

`pnpm oci:check` доказывает runtime contract локально. Publication workflow
повторяет smoke после pull exact published digest.

### Workflow review

Workflow проверяется на:

- точные triggers;
- отсутствие deploy secrets;
- минимальные permissions;
- action pins;
- полное соответствие event SHA, tag, OCI revision и digest;
- отсутствие mutable release tags;
- scan и smoke именно опубликованного digest.

### Remote evidence

Уровни доказательств остаются раздельными:

1. source review;
2. локальный `pnpm check`;
3. локальный `pnpm oci:check`;
4. remote pull request CI;
5. GHCR publication конкретного digest;
6. Dokploy deployment конкретного environment;
7. hosted HTTPS smoke.

Локальные gates не доказывают уровни 4–7. Успешная GHCR publication не
доказывает deployment.

## Документация и bootstrap

Реализация обновляет:

- `AGENTS.md` — маршрутизация deployment-задач и verification boundaries;
- `README.md` — короткие ссылки на OCI/deployment runbooks;
- `docs/architecture/overview.md` — same-origin runtime и deployment flow;
- `docs/getting-started.md` — dev proxy и персонализация GHCR/Dokploy;
- отдельный OCI/publication runbook;
- отдельный Dokploy operator runbook;
- `.env.example` — только dev proxy target, без production API URL;
- безопасные example manifests.

После копирования starter владелец продукта должен:

1. выбрать integration branch;
2. подтвердить GHCR package name и visibility;
3. настроить repository Actions permissions;
4. создать Dokploy application;
5. подключить GHCR registry в Dokploy;
6. настроить domain/path routes;
7. передать application ID и secrets локальному оператору;
8. выполнить bootstrap только после отдельного environment preflight.

В новый product не копируются `.env`, release manifests с локальными target
данными и deployment evidence.

## Критерии готовности реализации

Source-реализация готова, когда:

1. same-origin transport и dev proxy покрыты тестами;
2. `pnpm check` проходит на Node 24.18.0 и pnpm 11.15.1;
3. production image проходит свежий `pnpm oci:check`;
4. workflow diff проверен и не содержит environment secrets;
5. operator tests покрывают promotion, failure, bootstrap и rollback;
6. runbooks согласованы с командами и example manifests;
7. итоговый diff не содержит generated drift, secrets или placeholders.

Реализация не получает статус «опубликована» или «развёрнута» без отдельного
remote GHCR/Dokploy evidence.
