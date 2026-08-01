# Pre-merge Image Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запускать полный frontend image pipeline внутри доверенного pull
request, повторять его для фактического `stage` SHA после merge и не допускать
PR candidate в deployment operator.

**Architecture:** Один `.github/workflows/stage-image.yml` владеет source gate
и публикацией для `pull_request` и `push` в `stage`. Gate всегда least-privileged;
publish получает `packages: write` только в отдельном job и выполняется для push
или внутреннего non-Dependabot PR. Существующий deployment adapter продолжает
принимать только `push` run.

**Tech Stack:** GitHub Actions YAML, Node `24.18.0`, pnpm `11.15.1`, Docker
Buildx, GHCR, Trivy, Vitest, `yaml` parser.

## Global Constraints

- Repository остаётся private; public/private переключение отменено.
- Не изменять Dokploy, VPS, Traefik, DNS, TLS или live deployment state.
- Не добавлять long-lived secrets; использовать только scoped
  `${{ secrets.GITHUB_TOKEN }}` внутри publish job.
- Fork и Dependabot выполняют gate, но не publish.
- PR workflow result не является deployable evidence; deployment adapter
  продолжает требовать `event === 'push'`.
- Не запускать aggregate gates повторно: один focused RED/GREEN цикл и один
  финальный `pnpm check`.

---

### Task 1: Объединить PR gate и image publication

**Files:**

- Modify: `scripts/ci/stage-image-workflow.test.ts`
- Modify: `.github/workflows/stage-image.yml`
- Delete: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: существующие pinned actions, `pnpm check`, exact-digest Trivy и
  `pnpm oci:check -- --image ...`.
- Produces: jobs `gate` и `publish` одного `Stage image` workflow для PR/push.

- [ ] **Step 1: Написать failing static workflow test**

Изменить `scripts/ci/stage-image-workflow.test.ts`, чтобы он читал единый
workflow и проверял реальные YAML boundaries:

```ts
const { document: stageImage } = await readWorkflow(
  '.github/workflows/stage-image.yml',
)
const triggers = requireRecord(stageImage.on, 'Stage image triggers')
const pullRequest = requireRecord(triggers.pull_request, 'pull_request trigger')
const push = requireRecord(triggers.push, 'push trigger')
const gate = requireJob(stageImage, 'gate')
const publish = requireJob(stageImage, 'publish')

expect(pullRequest.branches).toEqual(['stage'])
expect(push.branches).toEqual(['stage'])
expect(triggers).not.toHaveProperty('workflow_dispatch')
expect(stageImage.permissions).toEqual({ contents: 'read' })
expect(gate.permissions).toEqual({ contents: 'read' })
expect(publish.needs).toBe('gate')
expect(publish.if).toBe(
  "github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]')",
)
expect(publish.permissions).toEqual({
  contents: 'read',
  packages: 'write',
})
```

Проверить gate commands отдельно:

```ts
expect(
  requireSteps(gate)
    .map((step) => step.run)
    .filter(Boolean),
).toEqual([
  'corepack enable',
  expect.stringContaining('test "$(node --version)" = "v24.18.0"'),
  'pnpm install --frozen-lockfile',
  'pnpm check',
])
```

Убрать чтение `ci.yml` из action-pin test и ожидать pins всех steps единого
workflow. Добавить проверку отсутствия отдельного workflow:

```ts
await expect(
  readFile('.github/workflows/ci.yml', 'utf8'),
).rejects.toMatchObject({ code: 'ENOENT' })
```

- [ ] **Step 2: Запустить focused test и подтвердить RED**

Run:

```bash
PATH=/Users/denischernykh/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin \
  corepack pnpm exec vitest run scripts/ci/stage-image-workflow.test.ts
```

Expected: FAIL, потому что `stage-image.yml` ещё не имеет `pull_request` и
publish condition, а `ci.yml` всё ещё существует.

- [ ] **Step 3: Реализовать единый workflow**

В `.github/workflows/stage-image.yml` задать два trigger:

```yaml
on:
  pull_request:
    branches: [stage]
  push:
    branches: [stage]
```

У `publish` сохранить `needs: gate` и добавить exact condition:

```yaml
if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]')
```

Не менять exact-digest build/Trivy/pull/smoke chain. Удалить
`.github/workflows/ci.yml`, чтобы PR не запускал второй `pnpm check`.

- [ ] **Step 4: Запустить focused test и подтвердить GREEN**

Run: команда из Step 2.

Expected: `scripts/ci/stage-image-workflow.test.ts` PASS.

- [ ] **Step 5: Зафиксировать workflow change**

```bash
git add .github/workflows/ci.yml .github/workflows/stage-image.yml scripts/ci/stage-image-workflow.test.ts
git commit -m "ci: publish image candidate before merge"
```

---

### Task 2: Обновить operator-facing документацию

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/runbooks/frontend-image-publication.md`

**Interfaces:**

- Consumes: jobs `gate`/`publish`, PR candidate versus push candidate и
  push-only `GithubWorkflowAdapter` contract.
- Produces: точный recovery runbook без public/private действий.

- [ ] **Step 1: Обновить публикационный happy path**

В `docs/runbooks/frontend-image-publication.md` описать два запуска:

```text
trusted PR → gate → GHCR/Trivy/digest smoke → pre-merge verification only
push stage → gate → GHCR/Trivy/digest smoke → deployable candidate
```

Явно записать:

- fork/Dependabot publish skipped;
- PR digest не передаётся deployment operator;
- transient failure исправляется `Re-run failed jobs`;
- source/security failure исправляется в текущем PR до merge;
- только успешный push attempt попадает в release manifest.

- [ ] **Step 2: Синхронизировать architecture/bootstrap/agent boundaries**

В `docs/architecture/overview.md`, `docs/getting-started.md` и `AGENTS.md`
удалить утверждение об отдельном `ci.yml`, назвать единый `Stage image`
workflow и сохранить границу «publication не является deployment».

- [ ] **Step 3: Проверить docs diff и форматирование**

```bash
corepack pnpm exec prettier --write \
  AGENTS.md \
  docs/architecture/overview.md \
  docs/getting-started.md \
  docs/runbooks/frontend-image-publication.md
git diff --check
```

- [ ] **Step 4: Зафиксировать documentation change**

```bash
git add AGENTS.md docs/architecture/overview.md docs/getting-started.md docs/runbooks/frontend-image-publication.md
git commit -m "docs(ci): explain pre-merge image candidates"
```

---

### Task 3: Финальная локальная и remote verification

**Files:**

- Verify only: весь текущий checkout и PR #9.

**Interfaces:**

- Consumes: итоговый source tree и существующий PR branch.
- Produces: fresh local gate, pushed commits и remote PR publication evidence.

- [ ] **Step 1: Выполнить один aggregate source gate**

```bash
PATH=/Users/denischernykh/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin \
  corepack pnpm check
```

Expected: formatting, lint, architecture, tests and production build PASS.

- [ ] **Step 2: Проверить границы перед publication**

```bash
git diff --check
git status --short --branch
gh repo view DenisChernykh/react-starter --json visibility,isPrivate
```

Expected: worktree clean after commits; repository `PRIVATE`.

- [ ] **Step 3: Отправить текущую branch в PR #9**

```bash
git push origin feat/frontend-deployment-foundation
```

- [ ] **Step 4: Дождаться remote workflow terminal state**

Проверить PR head SHA и jobs `gate`/`publish`. Успех заявлять только если оба
job завершились `SUCCESS`; `publish` должен реально пройти GHCR build, Trivy,
pull и exact-digest smoke для PR candidate.

- [ ] **Step 5: Передать merge пользователю**

Сообщить ссылку на PR, exact head SHA и remote checks. Не выполнять merge,
Dokploy deployment или VPS operations. После пользовательского merge отдельно
проверить новый push `Stage image`; это следующая явно инициированная операция.
