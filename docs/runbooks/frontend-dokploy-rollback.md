# Явный rollback frontend в Dokploy

## Когда команда допустима

Rollback — отдельное осознанное действие после неуспешного или
неопределённого promotion. Источник — сохранённый evidence, у которого:

- `operation` равен `promote`;
- `outcome` равен `failed` или `indeterminate`;
- `previous` содержит известный exact digest и revision;
- application ID совпадает с текущим operator environment.

Bootstrap evidence имеет `previous: null` и не может использовать эту
команду. Rollback evidence также нельзя откатывать ещё раз автоматически.

## Команда

```bash
pnpm deployment:rollback -- --evidence /absolute/path/failed-evidence.json --apply
```

CLI сначала строго читает evidence и только затем создаёт live adapters. Input
файл никогда не изменяется и не перезаписывается. Новое rollback evidence
автоматически создаётся в `.deployment/evidence` по схеме:

```text
<environment>-rollback-<revision12>-<UTC timestamp>.json
```

## Защита от drift

До первой mutation operator:

1. проверяет previous image как доступный exact GHCR digest;
2. сверяет его OCI source и revision labels;
3. читает Application;
4. требует, чтобы configured image всё ещё совпадал с неуспешным
   `sourceEvidence.target.imageRef`;
5. сохраняет snapshot существующих deployments.

Workflow URL для previous image повторно не требуется: identity задают exact
digest, revision, OCI source label и уже сохранённая связь в evidence. Если
Application уже переключён другим оператором, команда останавливается до
mutation с `current_drift` и не затирает более новое состояние.

## Выполнение и evidence

После проверок команда ровно один раз переключает Application на previous
digest и запускает deployment с уникальным rollback title. Затем она:

```text
находит только новую deployment
→ закрепляет её ID
→ poll до terminal status
→ повторяет hosted smoke исходного public origin и UI paths
→ пишет отдельное rollback evidence
```

В rollback evidence направления меняются явно:

```text
previous = failed promotion target
target   = failed promotion previous
workflowRunUrl = null
```

Файл сохраняется с mode `0600` внутри игнорируемой `.deployment/evidence`.
Source evidence остаётся неизменным и продолжает объяснять причину rollback.

## Почему rollback не автоматический

Ошибка mutation, timeout, abort или неоднозначная deployment может означать,
что внешний state уже изменился, но точный результат неизвестен. Автоматическая
вторая mutation могла бы перезаписать более новое ручное исправление или
усугубить инцидент. Поэтому operator пишет `failed` или `indeterminate`
evidence и останавливается.

Перед повторным действием человек сверяет deployment ID, configured image и
hosted runtime. Новый rollback или promotion запускается только отдельной
командой после fresh preflight. Local fake-adapter tests не заменяют реальный
hosted rollback drill.
