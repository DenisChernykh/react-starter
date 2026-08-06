# Публикация frontend OCI image

## Что запускается

`.github/workflows/stage-image.yml` выполняет один pipeline для pull request и
push в integration branch:

```text
gate → linux/amd64 build → GHCR digest → Trivy → pull digest → smoke digest
```

Workflow сначала запускает `pnpm check`, затем публикует image в
`ghcr.io/<owner>/<repository>` с SHA/run tag только как locator. Единственный
допустимый deployment reference — exact immutable digest вида
`ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>`.

Image также содержит публичный `/_frontend/identity` с source repository и
полным build revision. Локальный OCI smoke сверяет identity с OCI labels, а
hosted smoke — с выбранным candidate. Identity помогает обнаружить чужой
frontend runtime, но не заменяет exact digest.

Для внутреннего pull request publish job выполняется только если head branch
принадлежит тому же repository и actor не Dependabot. Fork и Dependabot
проходят least-privileged gate, но не получают `packages: write`. Упавший
source, Docker, Trivy или digest smoke исправляется в том же pull request до
merge.

PR digest является pre-merge verification: synthetic PR revision может
отличаться от merge commit. После merge push в integration branch повторяет
pipeline для фактического SHA. Только успешный push run создаёт deployable
candidate. Workflow не настраивает host, Caddy, backend, TLS или deployment.

## Получить approved candidate

После merge откройте успешный **push run** с завершёнными gate, Trivy и smoke и
скопируйте из одной `Stage image candidate` summary:

```text
Event=push
Ref=refs/heads/<chosen integration branch>
Workflow ref=<repository>/.github/workflows/stage-image.yml@refs/heads/<chosen integration branch>
Revision=<full 40-character lowercase Git revision>
Attempt=<workflow attempt URL>
Digest=ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>
Source=<Source from the same successful summary>
```

Summary создаётся только после успешных Trivy scan, pull exact digest и smoke
published digest. `Event` должен быть ровно `push`, `Ref` — exact
`refs/heads/<chosen integration branch>`, `Source` — exact
`${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`, а `Workflow ref` — ref для
`.github/workflows/stage-image.yml`. Не смешивайте поля из разных runs.

SHA/run tag удобен для поиска run, но mutable locator не заменяет digest.
Digest с упавшим Trivy scan или smoke не approved, даже если build/push уже
создал его в registry. Не передавайте такой digest ручному host operator.

Для transient runner, network или GHCR failure используйте **Re-run failed
jobs** того же run. Не заменяйте push evidence PR run или ручной image.

## GHCR prerequisites

Для каждого copied application настройте package в GitHub Container Registry:

1. package связан с repository, который запускает workflow;
2. workflow token имеет `contents: read` и `packages: write`;
3. host operator имеет read-only право pull approved exact digest.

Public frontend и admin — разные приложения: каждый repository публикует свой
image и свой digest. При bootstrap выберите integration branch и согласованно
измените `pull_request` и `push` в `stage-image.yml`. То же имя branch должен
использовать host candidate record. Manual Compose operator дополнительно
проверяет effective image через `scripts/production/verify-compose-image.sh`
перед pull/deployment; GitHub API verifier и lease не добавляются.

Официальные справки GitHub: [публикация Docker image через Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
и [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Граница секретов и deployment

Workflow использует только автоматически выданный `GITHUB_TOKEN`; GHCR
read-only PAT для host login не добавляется в workflow или image. После
получения approved digest host operator применяет tracked
`compose.production.yaml` и host-owned Caddy example по
[manual Compose deployment runbook](frontend-compose-deployment.md). Runtime
env, current/previous digest files, Caddy/TLS/backend coordinates и registry
credentials остаются на host, не в repository и не в browser image.

## Evidence levels

| Evidence                          | Что доказывает                             | Чего не доказывает                                          |
| --------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| PR `Stage image` build/scan/smoke | pre-merge image contract                   | deployable integration-branch candidate                     |
| Push `Stage image` summary        | gate, scan и smoke фактического digest     | deployment этого digest                                     |
| Локальный `pnpm oci:check`        | local `linux/amd64` image contract         | remote CI, GHCR publication, host/VPS                       |
| `docker compose config --quiet`   | syntax/interpolation tracked Compose       | network existence, container health или hosted state        |
| Hosted probe                      | source/revision runtime конкретного origin | exact digest без pulled OCI label check и workflow evidence |
