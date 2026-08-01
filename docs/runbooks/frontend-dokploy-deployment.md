# Ручной deployment frontend через Dokploy

## Граница и авторизация

Этот runbook начинается после публикации approved candidate из
[runbook frontend image](frontend-image-publication.md). Он управляет только
image одного уже подготовленного Dokploy Application. Создание Application,
настройка registry, domain, Traefik, DNS, TLS и environment — отдельная
операция на VPS и требует явного разрешения пользователя.

Локальные тесты operator проверяют порты на fake-границах. Они не доказывают,
что API установленной версии Dokploy совместим с адаптером. До первого
deployment отдельно проверьте разрешённые Application и Deployment endpoints
на целевом instance без изменения его конфигурации.

## Один раз подготовить Application

Отдельно авторизованный оператор создаёт или выбирает один Application и
настраивает его через UI/API установленного Dokploy:

- source/provider — Docker image;
- GHCR connection хранится внутри Dokploy;
- container port — `8080`;
- health path — `/_frontend/health`;
- auto-deploy webhook отключён;
- domains и path routing соответствуют
  [same-origin ingress runbook](frontend-same-origin-ingress.md);
- API key имеет минимально доступные scope и срок жизни, которые поддерживает
  установленная версия Dokploy.

Для public frontend и admin нужны разные Applications, images и evidence.
Backend остаётся отдельным upstream. Не объединяйте три runtime в один
Application только ради одного operator command.

Официальная документация Dokploy:

- [Application API](https://docs.dokploy.com/docs/api/reference-application);
- [Deployment API](https://docs.dokploy.com/docs/api/reference-deployment);
- [Docker registry](https://docs.dokploy.com/docs/core/registry);
- [Domains](https://docs.dokploy.com/docs/core/domains).

## Локальное окружение оператора

Команды читают ровно семь process-only переменных:

```text
DOKPLOY_BASE_URL
DOKPLOY_API_KEY
DOKPLOY_APPLICATION_ID
GITHUB_TOKEN
GHCR_REGISTRY_URL
GHCR_USERNAME
GHCR_PASSWORD
```

`DOKPLOY_BASE_URL` — credential-free HTTPS origin. `GHCR_REGISTRY_URL` должен
быть ровно `https://ghcr.io`. Передавайте значения через одобренный secret
manager или изолированную operator shell; не записывайте их в repository,
manifest, evidence, shell history или отчёт.

`GHCR_PASSWORD` используется локально только для временного `docker login`,
pull exact digest и проверки OCI labels. CLI создаёт отдельный Docker config и
удаляет его после проверки. Это значение не копируется в Dokploy: registry
connection целевого Application настраивается и хранится отдельно в Dokploy.

## Подготовить release manifest

Скопируйте подходящий symbolic example во внешний локальный путь:

- [bootstrap example](frontend-release-manifest.bootstrap.example.json) —
  первое развёртывание;
- [promotion example](frontend-release-manifest.promotion.example.json) —
  замена известного текущего digest.

Замените `integrationBranch`, repository, workflow attempt URL, public origin,
exact digest и полный Git revision данными выбранного product repository и
успешного `Stage image candidate` summary. `integrationBranch` должен точно
совпадать с push branch в `stage-image.yml`. Promotion также требует
`expectedCurrent` с точными digest и revision текущей версии. Manifest не
содержит secrets.

## Read-only preflight

```bash
pnpm deployment:preflight -- --manifest /absolute/path/release.json
```

Preflight требует live credentials, но не вызывает Dokploy mutation. Он:

1. проверяет конкретный успешный GitHub Actions run attempt, integration branch
   и revision;
2. входит во временный GHCR Docker config, тянет exact digest и проверяет OCI
   source/revision/workflow labels;
3. читает Application и deployments из Dokploy;
4. сверяет source type, текущий exact image и известную deployment history.

Успешный preflight не резервирует состояние. Между ним и apply другой оператор
может изменить Application, поэтому apply всегда повторяет полный preflight.

## Bootstrap

```bash
pnpm deployment:bootstrap -- --manifest /absolute/path/release.json --apply
```

Bootstrap разрешён только для неиспользованного Docker Application: image ещё
не задан и successful deployment history отсутствует. `expectedCurrent` в
manifest равен `null`. У bootstrap нет application-level rollback: предыдущего
known-good digest ещё нет. После неуспешной mutation Application уже может
содержать candidate image. В этом случае отдельный авторизованный оператор
сначала сверяет live state и явно возвращает Application в действительно
неиспользованное состояние; только затем допустим новый bootstrap. Rollback-
команда для такого evidence не подходит.

## Promotion

```bash
pnpm deployment:promote -- --manifest /absolute/path/release.json --apply
```

Promotion требует, чтобы configured image всё ещё точно совпадал с
`expectedCurrent`. После повторного preflight operator:

```text
snapshot deployments
→ update Application на candidate exact digest
→ deploy один раз
→ найти новую deployment по уникальному title
→ закрепить deployment ID и дождаться terminal status
→ проверить hosted frontend и same-origin API boundary
→ записать evidence
```

Команда не меняет Traefik, domains, DNS, TLS, Application environment, registry
credentials или webhook. Она никогда не выполняет rollback автоматически.

## Evidence и критерий успеха

Каждая принятая операция пишет новый redacted JSON в
`.deployment/evidence`. Каталог имеет mode `0700`, файл — `0600`; существующий
final path не перезаписывается. В evidence входят только environment,
application/deployment IDs, exact images/revisions, timestamps, terminal
status и hosted smoke result. Credentials, headers и response bodies туда не
попадают.

Успех можно заявлять только когда одновременно известны:

- exact target digest и revision;
- deployment ID со статусом `done`;
- успешный hosted smoke всех UI paths, `/_frontend/health` и non-HTML `/v1`
  probe;
- путь нового evidence-файла.

Локальный `pnpm check`, `pnpm oci:check`, успешный workflow или mock operator
tests по отдельности не являются deployment PASS. Hosted drill на настоящем
Dokploy/VPS выполняется отдельно и только по явному запросу.
