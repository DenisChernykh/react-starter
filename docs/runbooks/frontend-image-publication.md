# Публикация frontend OCI image

## Что запускается

`.github/workflows/stage-image.yml` запускает один и тот же pipeline для pull
request и push в integration branch:

```text
gate → linux/amd64 build → GHCR digest → Trivy → pull digest → smoke digest
```

Workflow сначала выполняет `pnpm check`, затем публикует image в
`ghcr.io/<owner>/<repository>` с SHA/run tag только как locator. Его identity
и единственный допустимый deployment reference — exact immutable digest вида
`ghcr.io/<owner>/<repository>@sha256:...`.

Image также содержит публичный `/_frontend/identity`: две строки с GitHub
source repository и полным revision. Локальный OCI smoke сверяет этот ответ с
OCI labels, а hosted smoke — с выбранным candidate. Identity помогает
обнаружить чужой frontend runtime, но не заменяет exact digest: связь с digest
до mutation доказывает проверка pulled OCI image.

Для внутреннего pull request publish job выполняется только если head branch
принадлежит тому же repository и actor не Dependabot. Fork и Dependabot
проходят least-privileged gate, но не получают `packages: write`. Упавший
source, Docker, Trivy или digest smoke исправляется в том же pull request до
merge.

PR digest является только pre-merge verification: synthetic PR revision может
отличаться от фактического merge commit, а deployment operator отвергает run с
event `pull_request`. После merge push в integration branch повторяет весь
pipeline для фактического SHA. Только успешный push run создаёт deployable
candidate. Ни одна публикация не настраивает Dokploy/VPS.

## Получить approved candidate

После merge откройте **успешный push run** с завершёнными gate, Trivy и smoke и
скопируйте из `Stage image candidate` summary:

- `Digest` — exact `ghcr.io/...@sha256:...` для будущего оператора;
- `Attempt` — URL конкретной попытки workflow для audit trail;
- `Revision` — commit, которому соответствует candidate.

SHA/run tag удобен для поиска run, но mutable locator не заменяет digest.
Digest с упавшим Trivy scan или smoke не approved, даже если build/push уже
создал его в registry. Не передавайте такой digest оператору.

Для transient runner, network или GHCR failure используйте **Re-run failed
jobs** того же run: новый pull request не нужен. Не заменяйте push evidence
ручным или PR run — deployment preflight намеренно их не принимает.

## GHCR prerequisites

Для каждого copied application настройте package в GitHub Container Registry:

1. package должен быть связан с repository, который запускает workflow;
2. GitHub Actions token workflow имеет `contents: read` для checkout и
   `packages: write` для publication;
3. package access policy позволяет future deployment operator читать exact
   digest без выдачи лишних прав.

Скопированный public frontend и admin — разные приложения: каждый repository
публикует свой image и свой digest. При bootstrap выберите integration branch
и согласованно измените `pull_request` и `push` в `stage-image.yml`. То же
точное имя запишите как `integrationBranch` в release manifest: deployment
preflight связывает с ним GitHub push run attempt. Branch не обязан называться
`stage`.

Официальные справки GitHub: [публикация Docker image через Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
и [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Граница секретов и deployment

Workflow использует только автоматически выданный `GITHUB_TOKEN`; Dokploy API
key, VPS credentials и deployment secret сюда не добавляются. Операторская
настройка начинается после получения approved digest и описания ingress в
[same-origin ingress runbook](frontend-same-origin-ingress.md). Она является
следующим планом и требует отдельного remote/hosted evidence.

## Evidence levels

| Evidence                          | Что доказывает                               | Чего не доказывает                          |
| --------------------------------- | -------------------------------------------- | ------------------------------------------- |
| PR `Stage image` build/scan/smoke | pre-merge image contract                     | deployable stage revision                   |
| Push `Stage image` summary        | gate, scan и smoke фактического stage digest | deployment этого digest                     |
| Локальный `pnpm oci:check`        | local `linux/amd64` image contract           | remote CI, GHCR publication, Dokploy/VPS    |
| Hosted probe                      | source/revision runtime конкретного host     | exact digest без OCI preflight и историю CI |
