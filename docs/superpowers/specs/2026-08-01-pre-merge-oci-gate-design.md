# Pre-merge publication gate для frontend image

## Проблема

Текущий pull request workflow проверяет только `pnpm check`. Docker build,
Trivy и runtime smoke впервые выполняются после merge в `stage`. Поэтому
детерминированная ошибка image или HTTP-контракта может быть обнаружена уже
после изменения integration branch и потребовать отдельный исправляющий pull
request.

`nest-js-starter` решает эту границу иначе: один и тот же `Stage image`
workflow запускается на pull request и на push в `stage`. Внутренний pull
request публикует проверочный candidate до merge, а push после merge повторяет
pipeline для фактического stage revision.

## Решение

Применить тот же жизненный цикл к `react-starter`, сохранив более строгую
границу deployment operator:

```text
внутренний pull request в stage
→ pnpm check
→ linux/amd64 build и push в GHCR
→ Trivy exact digest
→ pull и OCI smoke exact digest
→ pre-merge candidate, не разрешённый для deployment

merge/push в stage
→ повторить тот же pipeline для фактического stage SHA
→ verified stage candidate, разрешённый для deployment preflight
```

`.github/workflows/stage-image.yml` становится единым workflow для
`pull_request.branches: [stage]` и `push.branches: [stage]`.
`.github/workflows/ci.yml` удаляется, чтобы `pnpm check` не выполнялся дважды в
одном pull request. Job `gate` остаётся least-privileged и запускается для
любого PR. Job `publish` запускается только для:

- push в `stage`;
- pull request из того же repository, если actor не `dependabot[bot]`.

Fork и Dependabot проходят source gate, но не получают `packages: write` и не
публикуют image. Внутренние feature branches могут публиковать проверочный
candidate через автоматически выданный `GITHUB_TOKEN`.

`workflow_dispatch` не добавляется. Основной recovery конкретного transient
сбоя — **Re-run failed jobs**; повтор сохраняет исходный event `push` или
`pull_request`. Это важно, потому что deployment operator намеренно принимает
только успешный `push` run exact `stage` revision и отвергает PR/manual runs.

## Deployment eligibility

PR candidate доказывает, что source, Dockerfile, vulnerability gate и runtime
contract проходят до merge. Он не является deployable artifact: synthetic PR
merge SHA может отличаться от фактического merge commit.

Существующий `GithubWorkflowAdapter` остаётся без изменений и требует:

- `event === 'push'`;
- `head_branch === integrationBranch`;
- `head_sha === manifest revision`;
- успешный exact attempt `.github/workflows/stage-image.yml`.

Таким образом, release manifest не может сослаться на PR candidate даже при
успешной публикации его digest. После merge workflow заново строит image для
реального `stage` SHA, и только этот push run может пройти deployment
preflight.

## Почему repository остаётся private

`nest-js-starter` также private и на GitHub Free не имеет branch protection.
Его преимущество не связано с visibility: publication failures обнаруживаются
в исходном pull request.

`react-starter` остаётся private. Временное public-окно и настройка branch
protection отменяются. Пользователь вручную выполняет merge только после
зелёного `Stage image` run. Постоянное техническое принуждение всё ещё
потребует public repository или GitHub Pro, но не нужно для выбранного
pre-merge publication lifecycle.

## Ошибки и recovery

- Source, Docker, Trivy или digest smoke упал в pull request: исправить в том
  же PR и дождаться нового run.
- Fork/Dependabot PR: проверить только least-privileged gate; publication
  намеренно skipped.
- Post-merge publication упал из-за transient runner/network/GHCR failure:
  повторить failed jobs без нового PR.
- Post-merge pipeline обнаружил состояние, которого не было в PR: не считать
  candidate approved; реальная source/security ошибка требует corrective PR.
- Ни PR, ни push workflow не вызывает Dokploy и не выполняет deployment.

## Проверка

Static workflow tests должны доказать:

1. единый workflow реагирует на PR и push только для `stage`;
2. gate использует `contents: read`, закреплённый toolchain, frozen install и
   ровно один `pnpm check`;
3. publish зависит от gate и имеет только `contents: read`, `packages: write`;
4. publish condition разрешает push и доверенный внутренний PR, но исключает
   fork и Dependabot;
5. один immutable digest проходит Trivy, pull, smoke и summary;
6. `workflow_dispatch`, Dokploy/VPS credentials и deployment calls
   отсутствуют;
7. deployment adapter продолжает отвергать `pull_request` run.

TDD начинается с изменения static workflow tests и наблюдаемого RED на
текущих YAML. После GREEN выполняются focused tests и один финальный
`pnpm check`. После push remote PR должен показать успешные jobs `gate` и
`publish`; это доказывает pre-merge publication candidate, но не post-merge
stage publication и не deployment.
