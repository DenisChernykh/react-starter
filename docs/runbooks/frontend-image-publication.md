# Публикация frontend OCI image

## Что запускается

`.github/workflows/ci.yml` запускает `pnpm check` для pull request в
integration branch. После merge (точнее, push в эту branch) workflow
`.github/workflows/stage-image.yml` создаёт candidate image:

```text
gate → linux/amd64 build → GHCR digest → Trivy → pull digest → smoke digest
```

Workflow сначала выполняет `pnpm check`, затем публикует image в
`ghcr.io/<owner>/<repository>` с SHA/run tag только как locator. Его identity
и единственный допустимый deployment reference — exact immutable digest вида
`ghcr.io/<owner>/<repository>@sha256:...`.

Успешный push/merge может создать проверенный candidate, но публикация не
является deployment и не настраивает Dokploy/VPS.

## Получить approved candidate

После **успешных** gate, Trivy и smoke откройте завершённый GitHub Actions run
и скопируйте из `Stage image candidate` summary:

- `Digest` — exact `ghcr.io/...@sha256:...` для будущего оператора;
- `Attempt` — URL конкретной попытки workflow для audit trail;
- `Revision` — commit, которому соответствует candidate.

SHA/run tag удобен для поиска run, но mutable locator не заменяет digest.
Digest с упавшим Trivy scan или smoke не approved, даже если build/push уже
создал его в registry. Не передавайте такой digest оператору.

## GHCR prerequisites

Для каждого copied application настройте package в GitHub Container Registry:

1. package должен быть связан с repository, который запускает workflow;
2. GitHub Actions token workflow имеет `contents: read` для checkout и
   `packages: write` для publication;
3. package access policy позволяет future deployment operator читать exact
   digest без выдачи лишних прав.

Скопированный public frontend и admin — разные приложения: каждый repository
публикует свой image и свой digest. При bootstrap выберите integration branch
и согласованно измените `pull_request` в `ci.yml` и `push` в
`stage-image.yml`; не предполагается, что branch всегда называется `stage`.

Официальные справки GitHub: [публикация Docker image через Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
и [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Граница секретов и deployment

Workflow использует только автоматически выданный `GITHUB_TOKEN`; Dokploy API
key, VPS credentials и deployment secret сюда не добавляются. Операторская
настройка начинается после получения approved digest и описания ingress в
[same-origin ingress runbook](frontend-same-origin-ingress.md). Она является
следующим планом и требует отдельного remote/hosted evidence.

## Evidence levels

| Evidence                      | Что доказывает                        | Чего не доказывает                           |
| ----------------------------- | ------------------------------------- | -------------------------------------------- |
| `pnpm check` в PR             | source gates в конкретном CI run      | image publication или hosted runtime         |
| Stage image candidate summary | gate, scan и smoke конкретного digest | deployment этого digest                      |
| Локальный `pnpm oci:check`    | local `linux/amd64` image contract    | remote CI, GHCR publication, Dokploy/VPS     |
| Hosted probe                  | runtime конкретного host              | историю source/CI без связанных run и digest |
