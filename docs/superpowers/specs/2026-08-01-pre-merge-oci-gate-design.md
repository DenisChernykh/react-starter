# Pre-merge OCI gate и повтор публикации stage

## Проблема

Текущий pull request workflow проверяет только `pnpm check`. Docker build и
runtime smoke впервые выполняются после merge в `stage` внутри publication
workflow. Детерминированная ошибка Dockerfile или HTTP-контракта поэтому может
быть обнаружена уже после изменения integration branch и потребовать отдельный
исправляющий pull request.

При этом не каждое падение publication требует изменения source. Временный
сбой GitHub runner, сети или GHCR должен устраняться повторным запуском того же
workflow run. Ручной новый запуск также должен быть возможен для текущего
`stage`, но не для произвольной feature branch.

## Решение

Оставить разделение source verification и publication, но сдвинуть локальный
OCI-контракт в обе стороны границы:

```text
pull request в stage
→ check: pnpm check
→ oci: pnpm oci:check
→ оператор ждёт два успешных checks перед merge

push в stage или manual dispatch текущего stage
→ повторный source gate
→ linux/amd64 build и push в GHCR
→ Trivy scan exact digest
→ pull и smoke exact digest
→ verified candidate summary
```

`ci.yml` получает отдельный параллельный job `oci`. Он использует закреплённые
Node `24.18.0` и pnpm `11.15.1`, frozen install и существующий локальный
`pnpm oci:check`. Раздельные jobs уменьшают wall-clock относительно
последовательного запуска и дают отдельный проверяемый check contract.

Текущий repository приватный и использует GitHub Free. Live Branch Protection
API вернул, что защита `stage` требует GitHub Pro или public repository. Для
текущего pull request используется ограниченное public-окно:

1. workflow-изменения реализуются и локально проверяются, пока repository
   private;
2. изменения отправляются в текущий pull request;
3. repository временно переводится в public;
4. для `stage` включаются required checks `check` и `oci`;
5. после зелёного CI пользователь самостоятельно выполняет merge;
6. пользователь сообщает о merge, оператор проверяет terminal result
   `Stage image`;
7. после проверки publication repository обязательно возвращается в private.

После возврата в private на GitHub Free branch protection больше недоступен.
То есть эта процедура технически защищает текущий merge, но не создаёт
постоянную защиту будущих pull requests. Для постоянного enforcement нужен
public repository или GitHub Pro.

`stage-image.yml` сохраняет `push.branches: [stage]` и получает
`workflow_dispatch` без inputs. Первым шагом gate проверяет, что `github.ref`
равен `refs/heads/stage`. Поэтому ручной запуск с feature branch завершается до
install, registry login, build или publication. Репозиторий уже использует
`stage` как default branch, поэтому обычный UI manual run выбирает нужную
границу по умолчанию.

Существующая кнопка **Re-run failed jobs** остаётся основным восстановлением
конкретного упавшего publication run. `workflow_dispatch` нужен как явный
fallback для новой попытки публикации текущего `stage`, а не как замена rerun.

## Почему не другие варианты

### Публиковать candidate до merge

Это сильнее сокращает post-merge работу, но создаёт GHCR artifacts для
непринятых pull requests и усложняет связь digest с итоговым merge/squash SHA.
Для starter это лишняя supply-chain сложность.

### Убрать post-merge source gate

PR checks могут относиться к другому synthetic merge commit, если `stage`
изменился перед merge. Повторный `pnpm check` на фактическом commit в `stage`
остаётся полезной защитой перед publication.

### Запускать Trivy image scan до merge

Текущий `pnpm oci:check` намеренно удаляет принадлежащий ему локальный image.
Повторная сборка только ради pre-merge Trivy увеличит время и сложность. Trivy
остаётся обязательным scan опубликованного exact digest. Если он находит
реальную уязвимость, исправляющий PR является корректным результатом, а не
ошибкой recovery design.

## Ошибки и recovery

- `check` или `oci` упал в pull request: временная branch protection блокирует
  merge, а исправление остаётся в том же pull request.
- Publication упал из-за transient runner/network/GHCR failure: повторить
  failed jobs без нового pull request.
- Publication требует новой попытки для текущего `stage`: запустить
  `Stage image` вручную на `stage`.
- Manual dispatch выбран не на `stage`: gate падает до side effects.
- Trivy нашёл реальную HIGH/CRITICAL уязвимость или source gate упал на
  фактическом stage commit: создать исправляющий pull request.
- Ни один из workflows не вызывает Dokploy и не выполняет deployment.
- Если взаимодействие приостанавливается во время public-окна, repository не
  считается завершённым: оператор должен продолжить после сообщения
  пользователя о merge и вернуть private после проверки publication.

## Проверка

Static workflow tests должны доказать:

1. `ci.yml` реагирует только на pull request в `stage`;
2. оба PR jobs имеют read-only `contents` и закреплённый toolchain;
3. OCI job выполняет frozen install и `pnpm oci:check`;
4. publication реагирует на push в `stage` и `workflow_dispatch`;
5. stage ref проверяется до checkout/install/login/build;
6. publication по-прежнему сканирует и smoke-проверяет exact digest;
7. workflow не содержит Dokploy/VPS credentials или deployment calls.

После RED/GREEN focused test выполняется один финальный `pnpm check`. После
push текущего pull request remote CI должен показать отдельные успешные jobs
`check` и `oci`. Локальные и remote gates не доказывают GHCR publication до
фактического merge/push в `stage`.

## Операторская граница после merge

Успешный `Stage image` создаёт только verified GHCR candidate. Он не меняет
Dokploy Application, Traefik, DNS, TLS или VPS. Deployment candidate digest
остаётся отдельной явно авторизованной операцией.
