# Новый проект из React Starter

## Результат

Этот runbook создаёт новый локальный проект из текущей папки `react-starter`:

```text
проверить source и destination
→ скопировать starter без локальных артефактов
→ инициализировать новый Git
→ персонализировать приложение
→ установить зависимости
→ подключить backend OpenAPI
→ запустить backend и frontend
→ проверить auth и reference module
→ выполнить pnpm check
→ создать первый commit
```

Исходный starter не изменяется и не получает новый Git history.
`approval-requests` сохраняется как исполняемый пример подключения
бизнес-модуля.

Перед началом прочитайте [архитектурный обзор](architecture/overview.md).

## 1. Требования

- macOS/Linux shell с `rsync`;
- Git;
- Node.js `24.18.0`;
- pnpm `11.15.1`;
- локальная папка `react-starter`;
- backend с совместимым OpenAPI, cookie auth, CSRF и Problem Details;
- новый путь, в котором ещё нет файла или каталога.

Node и pnpm закреплены в `.nvmrc`, `package.json` и lockfile. Не начинайте
bootstrap на случайной версии runtime.

## 2. Preflight исходного starter

Задайте абсолютные нормализованные пути без завершающего `/`:

```bash
STARTER_DIR=/absolute/path/to/react-starter
PROJECT_DIR=/absolute/path/to/new-project
```

Подставьте реальные пути и проверьте source:

```bash
test -d "$STARTER_DIR/.git"
git -C "$STARTER_DIR" branch --show-current
git -C "$STARTER_DIR" rev-parse HEAD
git -C "$STARTER_DIR" status --short
```

Зафиксируйте branch, commit и состояние working tree. Если `status --short`
показывает изменения, не решайте за пользователя, должны ли они попасть в
новый проект. Уточните это до копирования. Не выполняйте reset, clean, stash
или удаление этих файлов.

Проверьте destination:

```bash
test "$STARTER_DIR" != "$PROJECT_DIR"
test ! -e "$PROJECT_DIR"

case "$PROJECT_DIR/" in
  "$STARTER_DIR/"*)
    echo "PROJECT_DIR must not be inside STARTER_DIR" >&2
    exit 1
    ;;
esac

case "$STARTER_DIR/" in
  "$PROJECT_DIR/"*)
    echo "PROJECT_DIR must not contain STARTER_DIR" >&2
    exit 1
    ;;
esac
```

Если `PROJECT_DIR` уже существует, остановитесь. Не очищайте и не
перезаписывайте его без отдельного явного разрешения.

## 3. Скопировать проект

Создайте destination и скопируйте текущий working tree:

```bash
mkdir -p "$PROJECT_DIR"

rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.superpowers/' \
  --exclude='.DS_Store' \
  "$STARTER_DIR/" "$PROJECT_DIR/"
```

Исключения имеют разный смысл:

| Исключение       | Причина                                            |
| ---------------- | -------------------------------------------------- |
| `.git/`          | новый продукт получает собственную историю         |
| `node_modules/`  | зависимости ставятся из lockfile                   |
| `dist/`          | build output воспроизводится                       |
| `.env`, `.env.*` | локальные значения и secrets не копируются         |
| `.superpowers/`  | локальное состояние инструмента не является source |
| `.DS_Store`      | системный файл macOS                               |

`.env.example` сохраняется благодаря более раннему include. Также копируются
committed `openapi/openapi.json`, generated API source и `docs/superpowers`.
Последний каталог — исторические design/implementation records starter, а не
активный план нового продукта.

Проверьте результат до `git init`:

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

## 4. Инициализировать новый Git

Перейдите в destination и убедитесь, что shell находится в правильной папке:

```bash
cd "$PROJECT_DIR"
pwd
test ! -e .git
git init -b main
git add .
git status --short
```

Не запускайте `git init` в `STARTER_DIR`. После этой точки все изменения
выполняются только в `PROJECT_DIR`.

`git add .` здесь создаёт в index исходную точку сравнения для скопированного
starter, но ещё не создаёт commit. Благодаря этому последующие `git diff` и
`api:check` видят изменения существующих файлов до первого commit. В status
ожидаются строки `A` для source starter; перед первым commit index будет
обновлён ещё раз.

Remote пока не требуется. Добавляйте его после создания отдельного пустого
репозитория для нового продукта:

```bash
git remote add origin git@github.com:OWNER/NEW-PROJECT.git
git remote -v
```

Не используйте remote исходного starter.

## 5. Персонализировать продукт

### Обязательные места

| Файл                                     | Что изменить                                      |
| ---------------------------------------- | ------------------------------------------------- |
| `package.json`                           | `name` на npm-safe slug нового проекта            |
| `index.html`                             | пользовательский `<title>`                        |
| `src/widgets/app-shell/ui/app-shell.tsx` | product label в sidebar                           |
| `README.md`                              | название, назначение и product-specific запуск    |
| `.env.local`                             | необязательный Vite dev proxy target              |
| `.github/workflows/ci.yml`               | PR target branch для выбранной integration branch |
| `.github/workflows/stage-image.yml`      | push branch для candidate image                   |

Starter инициализируется с branch `main`, а исходные CI и candidate-image
workflow слушают `stage`. Выберите один процесс осознанно и измените обе
workflow-конфигурации согласованно:

- оставить `main` и заменить `stage` на `main` в обоих workflow;
- либо создать `stage`, сделать её integration branch и сохранить workflow.

Не выполняйте слепую глобальную замену `react-starter`, `nest-js-starter` или
`approval-requests`. Эти строки могут обозначать:

- архитектурное происхождение;
- sibling backend;
- Problem Details type URI или test fixture;
- required OpenAPI operation;
- сохраняемый reference module.

Сначала найдите product-facing употребления:

```bash
rg -n "react-started|React Starter|react-starter|nest-js-starter|approval-requests" \
  package.json index.html README.md AGENTS.md docs src scripts .github
```

Изменяйте только те места, смысл которых действительно стал product-specific.

### Environment

По умолчанию Vite dev server proxy направляет `/v1` и `/health` на
`http://localhost:3000`; `.env.local` не нужен. Создайте его только для
другого локального backend:

```bash
cp .env.example .env.local
```

`DEV_API_PROXY_TARGET` — абсолютный HTTP(S) origin без path. Это server-only
настройка команды `vite serve`, а не runtime API origin production bundle:

```dotenv
DEV_API_PROXY_TARGET=http://localhost:3000
```

Browser transport всегда запрашивает относительный same-origin `/v1`; не
задавайте production backend hostname через `VITE_*`. Не помещайте secrets,
session tokens или приватные credentials в локальный env.

## 6. Установить зависимости

Выберите закреплённый Node и проверьте toolchain:

```bash
nvm use
node --version
pnpm --version
```

Ожидается:

```text
v24.18.0
11.15.1
```

Установите ровно lockfile:

```bash
pnpm install --frozen-lockfile
```

Не обновляйте зависимости во время bootstrap. Upgrade — отдельная задача с
проверкой текущей документации библиотек и новым lockfile diff.

## 7. Подключить backend OpenAPI

### Выбрать source

Если совместимый `nest-js-starter` находится рядом с frontend, `api:sync`
попытается найти:

```text
../nest-js-starter/docs/api/openapi.json
```

Для другого расположения передайте источник явно:

```bash
OPENAPI_SPEC_SOURCE=/absolute/path/to/backend/openapi.json pnpm api:update
```

Поддерживаются локальный путь, `file:` URL и HTTP(S) URL.

Текущий sync contract требует auth operations и операции эталонного
`approval-requests`. Если backend их не публикует, команда должна завершиться
ошибкой. Не обходите эту проверку и не удаляйте required operations
автоматически: сначала согласуйте новый foundation/reference contract.

### Просмотреть generation

После `api:update` проверьте:

```bash
git add -N -- openapi/openapi.json \
  src/shared/api/generated \
  src/shared/api/generated-zod
git status --short -- openapi/openapi.json \
  src/shared/api/generated \
  src/shared/api/generated-zod
git diff -- openapi/openapi.json \
  src/shared/api/generated \
  src/shared/api/generated-zod
git add -- openapi/openapi.json \
  src/shared/api/generated \
  src/shared/api/generated-zod
pnpm api:check
```

`git add -N` добавляет новые generated-файлы в index только как
`intent-to-add`, поэтому они тоже попадают в review diff и не маскируются как
untracked. Сначала просмотрите полный API diff, затем обычным `git add`
зафиксируйте в index принятую generation. После этого `api:check` повторяет
generation и доказывает, что она не создаёт нового unstaged diff относительно
принятого результата.

Orval создаёт:

- Axios/React Query operations;
- DTO и union types;
- query keys/options;
- строгие Zod schemas.

Не редактируйте generated source вручную. Handwritten-код получает минимально
необходимые экспорты через `src/shared/api/index.ts`. Подробный контракт
описан в [архитектурном обзоре](architecture/overview.md#openapi-и-генерация-orval).

## 8. Подготовить backend runtime

Frontend ожидает cookie-based browser auth. Backend должен:

- быть доступным по `DEV_API_PROXY_TARGET` для Vite dev server;
- разрешать точный frontend origin с credentials;
- выставлять session cookie;
- выдавать session-bound CSRF token;
- возвращать ошибки как `application/problem+json`;
- иметь пользователя, которым можно войти;
- предоставлять операции эталонного `approval-requests`.

Для стандартного Vite port:

```text
frontend origin: http://localhost:5173
backend origin:  http://localhost:3000
```

Backend `CORS_ORIGINS` должен содержать именно фактический frontend origin и
проверять реальный browser `Origin`, даже когда Vite proxy направляет request
к backend. Если Vite выбрал `5174`, значение `http://localhost:5173` уже не
подходит.

Успешная компиляция backend watcher не гарантирует HTTP readiness. Проверьте
его health endpoint и listener отдельно.

## 9. Запустить frontend

```bash
pnpm dev
```

Проверьте в браузере:

1. `/login` открывается без white screen;
2. login отправляет cookie credentials;
3. после входа открывается `/`;
4. protected shell показывает текущего пользователя;
5. `/approval-requests` доступен как reference module;
6. deep link защищён parent session loader;
7. logout очищает локальную session/CSRF state и возвращает на login;
8. network, protocol и Problem Details ошибки отображаются безопасно.

Если initial render пустой, сначала проверьте `/v1/auth/me`, backend listener и
CORS. Route loader блокирует mounting защищённой ветки до authentication
decision.

## 10. Выполнить проверки

Aggregate gate:

```bash
pnpm check
```

Она последовательно выполняет:

```text
api:check
→ format:check
→ lint
→ architecture
→ test
→ build
```

При ошибке остановитесь на первом упавшем gate и исправьте причину. Не
переписывайте generated output вручную, не отключайте Steiger и не удаляйте
тест, чтобы получить зелёный результат.

После gate:

```bash
git diff --check
git status --short
```

`pnpm check` доказывает локальную воспроизводимость source, но не доказывает:

- что backend был запущен;
- что browser CORS/cookie/CSRF flow работает;
- что remote CI прошёл;
- что commit опубликован;
- что приложение развёрнуто.

Если Docker daemon доступен, отдельно выполните OCI gate:

```bash
pnpm oci:check
```

Он локально собирает `linux/amd64` frontend image, проверяет image metadata и
HTTP contract, затем удаляет созданные smoke container и image. Этот
Docker-dependent gate не входит в `pnpm check`; его успешное завершение также
не доказывает remote CI, GHCR publication или deployment.

## 11. Первый commit

Перед commit убедитесь, что в status нет `.env*`, dependencies, build output
или локального tool-state:

```bash
git status --short
git diff --check
```

Добавьте source нового проекта:

```bash
git add .
git status --short
git commit -m "chore: initialize project from react starter"
```

Push выполняется только после добавления проверенного remote и отдельного
разрешения на публикацию.

## Типичные проблемы

| Симптом                                  | Вероятная граница                 | Что проверить                                       |
| ---------------------------------------- | --------------------------------- | --------------------------------------------------- |
| pnpm сообщает unsupported engine         | shell выбрал другой Node          | `nvm use`, `node --version`                         |
| install меняет lockfile                  | выполнен upgrade или не тот pnpm  | pnpm `11.15.1`, `--frozen-lockfile`                 |
| `api:sync` не находит операцию           | несовместимый backend snapshot    | source path, `operationId`, required operations     |
| `api:check` показывает diff              | snapshot/generated drift          | выполнить осознанный `api:update`, просмотреть diff |
| white screen                             | route loader ждёт/получил ошибку  | `/v1/auth/me`, backend health, route error          |
| browser блокирует запрос                 | exact-origin CORS                 | scheme, host, frontend port, credentials            |
| unsafe request получает validation error | неверное JSON/body/CSRF окружение | generated body, Axios interceptor, CSRF endpoint    |
| `401` ведёт не туда                      | нарушен auth error contract       | stable `AUTHENTICATION_REQUIRED`, `returnTo`        |
| server text попал в UI                   | UI использует raw `detail`        | stable `code`, safe mapper, pointer allowlist       |
| architecture gate падает                 | нарушен FSD public API            | imports между slices, `index.ts`, слой-владелец     |

## Definition of Done

### Source

- новый Git находится только в `PROJECT_DIR`;
- local env, dependencies, build output и `.superpowers` не скопированы;
- product-facing имя и CI branch персонализированы;
- `approval-requests` сохранён как reference implementation;
- OpenAPI snapshot и generated output согласованы.

### Local gates

- используются Node `24.18.0` и pnpm `11.15.1`;
- `pnpm check` завершился с exit code `0`;
- при доступном Docker `pnpm oci:check` завершился с exit code `0`;
- `git diff --check` не показывает ошибок;
- первый commit содержит только ожидаемый source.

### Browser/runtime

- backend readiness проверена отдельно;
- login, protected shell, approval reference и logout пройдены в браузере;
- фактический frontend origin разрешён credentialed CORS.

### Publication

Remote, push, pull request, merge и deployment не входят в bootstrap по
умолчанию. После персонализации workflow push в integration branch может
опубликовать candidate image в GHCR, но не выполняет deployment. Для GHCR
нужны package linkage с repository и permissions `contents: read` и
`packages: write`; public frontend и admin публикуют отдельные images.
Подробности — в [runbook публикации](runbooks/frontend-image-publication.md).
