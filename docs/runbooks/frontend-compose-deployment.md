# Ручной deployment frontend через Docker Compose и Caddy

## Назначение и граница

Этот runbook описывает ручной deployment одного frontend image на уже
подготовленный host. В repository tracked только secret-free Compose contract,
Caddy example и read-only helpers. Runtime directory, shared lock directory,
external edge network, Caddy/TLS, backend, DNS, observability и registry
credentials принадлежат host.

Candidate принимается только из summary успешного push run integration branch
после scan и digest smoke. GitHub API verifier, lease и отдельный deployment
framework не нужны.

Локальные pnpm check, pnpm oci:check, docker compose config и source tests
не доказывают hosted deployment. В source-only работе hosted checker и Caddy
validation остаются NOT RUN; настоящий host operator запускает их отдельно.

## Approved candidate record

Сохраняйте вне repository поля из одной и той же успешной summary:

```text
Event=push
Ref=refs/heads/<chosen integration branch>
Workflow ref=<repository>/.github/workflows/stage-image.yml@refs/heads/<chosen integration branch>
Source=<Source из этой summary>
Revision=<full 40-character lowercase Git revision>
Attempt=<workflow attempt URL>
Digest=ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>
```

Source должен быть точным значением summary
${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}. Workflow ref должен указывать
на .github/workflows/stage-image.yml, а Event — ровно push. Summary появляется
после успешных Trivy scan, pull exact digest и smoke published digest; PR
summary и tag не являются approved candidate. Не смешивайте поля из разных
runs.

## Один раз подготовить host

Выберите host-owned runtime directory, shared lock directory и установленный
Docker Compose. Не встраивайте live path, hostname или credential в repository:

```bash
RUNTIME_DIR=/path/to/frontend-runtime
SHARED_LOCK_ROOT=/path/to/host-shared/frontend-compose-locks
mkdir -p "$RUNTIME_DIR"
test -d "$SHARED_LOCK_ROOT"
cp /path/to/checked-out/react-starter/compose.production.yaml "$RUNTIME_DIR/"
docker network inspect example-edge >/dev/null
```

External edge network должна существовать до Compose operation; external: true
не создаёт её. Shared lock directory должна быть доступна всем frontend copies
на этом host. Не создавайте её внутри каждой runtime directory: lock с тем же
alias должен сериализовать operations между разными copies.

Не редактируйте tracked compose.production.yaml. Создайте host-only
$RUNTIME_DIR/frontend-compose.env с уникальными project, network и alias:

```dotenv
COMPOSE_PROJECT_NAME=frontend-production-copy
FRONTEND_IMAGE=ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>
FRONTEND_EDGE_NETWORK=example-edge
FRONTEND_EDGE_ALIAS=example-react-frontend
```

COMPOSE_PROJECT_NAME и FRONTEND_EDGE_ALIAS должны быть уникальными для
frontend copy на этом host. FRONTEND_IMAGE обязан быть exact lowercase digest;
tags запрещены. Env-файл не коммитится и не передаётся в browser runtime.

Скопируйте config/caddy/frontend-ingress.Caddyfile.example в host-owned Caddy
config. FRONTEND_DOMAIN — только hostname Caddy site address, например
frontend.example.test; он не является checker origin. Для hosted checks
оператор явно строит отдельное значение:

```bash
: "${FRONTEND_DOMAIN:?set Caddy hostname in the host environment}"
FRONTEND_ORIGIN="https://${FRONTEND_DOMAIN}"
```

Задайте в host process environment тот же FRONTEND_DOMAIN,
BACKEND_UPSTREAM и FRONTEND_EDGE_ALIAS. Caddy, TLS и backend не добавляются
в Compose application.

Для скопированного Caddy config точные host-side validation commands такие:

```bash
: "${FRONTEND_DOMAIN:?set Caddy hostname in the host environment}"
: "${BACKEND_UPSTREAM:?set backend upstream in the host environment}"
: "${FRONTEND_EDGE_ALIAS:?set frontend edge alias in the host environment}"
CADDY_FILE=/path/to/host-owned/frontend-ingress.Caddyfile
caddy adapt --config "$CADDY_FILE" --adapter caddyfile --pretty >/dev/null
caddy validate --config "$CADDY_FILE" --adapter caddyfile
```

Это host-side evidence. Caddy binary в source-only gate не требуется и здесь
локально не запускался.

## Общая checked POSIX operation

Каждая bootstrap, promotion, rollback или return-to-current operation начинается
в отдельном shell с set -eu, finite timeout и shared atomic lock. Ожидаемые
project/network/alias берутся из выбранного host-only target record и передаются
в topology helper; env-файлы не source-ятся:

```bash
set -eu
umask 077

RUNTIME_DIR=/path/to/frontend-runtime
SHARED_LOCK_ROOT=/path/to/host-shared/frontend-compose-locks
COMPOSE_FILE="$RUNTIME_DIR/compose.production.yaml"
ENV_FILE="$RUNTIME_DIR/frontend-compose.env"
COMPOSE_IMAGE_HELPER=/path/to/checked-out/react-starter/scripts/production/verify-compose-image.sh
COMPOSE_TOPOLOGY_HELPER=/path/to/checked-out/react-starter/scripts/production/verify-compose-topology.sh
HOSTED_ROUTING_CHECKER=/path/to/checked-out/react-starter/scripts/production/verify-hosted-routing.sh
WAIT_TIMEOUT=180

TARGET_ENV_FILE=/path/to/host-only/frontend-target.env
TARGET_COMPOSE_PROJECT_NAME=frontend-production-copy
TARGET_FRONTEND_EDGE_NETWORK=example-edge
TARGET_FRONTEND_EDGE_ALIAS=example-react-frontend

fail() {
  printf 'frontend-compose-operation: %s\n' "$1" >&2
  exit 1
}

case "$WAIT_TIMEOUT" in
  ''|0|*[!0-9]*) fail 'wait timeout must be finite and positive' ;;
esac
for value in "$TARGET_COMPOSE_PROJECT_NAME" "$TARGET_FRONTEND_EDGE_NETWORK" "$TARGET_FRONTEND_EDGE_ALIAS"; do
  case "$value" in
    ''|*[!A-Za-z0-9_.-]*) fail 'project, network and alias must use safe names' ;;
  esac
done
[ -d "$SHARED_LOCK_ROOT" ] || fail 'shared lock directory is missing'
LOCK_DIR="$SHARED_LOCK_ROOT/$TARGET_FRONTEND_EDGE_ALIAS.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail 'operation lock exists; verify it manually before retrying'
fi

DOCKER_CONFIG_DIR=''
RECORD_TEMP_FILE=''
CURRENT_ENV_TEMP_FILE=''
cleanup() {
  if [ -n "$RECORD_TEMP_FILE" ]; then
    rm -f "$RECORD_TEMP_FILE" 2>/dev/null || true
  fi
  if [ -n "$CURRENT_ENV_TEMP_FILE" ]; then
    rm -f "$CURRENT_ENV_TEMP_FILE" 2>/dev/null || true
  fi
  if [ -n "$DOCKER_CONFIG_DIR" ]; then
    rm -rf "$DOCKER_CONFIG_DIR" 2>/dev/null || true
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
```

cleanup привязан только к EXIT; signal traps явно завершают shell и тем самым
сначала запускают тот же EXIT cleanup. Held/stale lock останавливает процедуру
и требует human verification; его нельзя удалять автоматически.

## Effective Compose identity и alias preflight

Сначала проверяйте exact effective interpolation выбранного target env:

```bash
verify_effective_compose_identity() {
  target_env_file=$1
  if ! "$COMPOSE_TOPOLOGY_HELPER" \
    "$COMPOSE_FILE" "$target_env_file" \
    "$TARGET_COMPOSE_PROJECT_NAME" \
    "$TARGET_FRONTEND_EDGE_NETWORK" \
    "$TARGET_FRONTEND_EDGE_ALIAS"; then
    fail 'effective Compose project, network or alias mismatch'
  fi
  EFFECTIVE_COMPOSE_PROJECT_NAME="$TARGET_COMPOSE_PROJECT_NAME"
  EFFECTIVE_FRONTEND_EDGE_NETWORK="$TARGET_FRONTEND_EDGE_NETWORK"
  EFFECTIVE_FRONTEND_EDGE_ALIAS="$TARGET_FRONTEND_EDGE_ALIAS"
}

verify_edge_alias() {
  network_name=$1
  wanted_alias=$2
  current_container_id=$3

  if ! attached_ids=$(docker network inspect "$network_name" \
    --format '{{range $id, $container := .Containers}}{{$id}}{{"\n"}}{{end}}' 2>/dev/null); then
    printf 'frontend-compose-operation: edge network inspect failed\n' >&2
    return 1
  fi

  aliases_template='{{range $networkName, $network := .NetworkSettings.Networks}}{{if eq $networkName "'$network_name'"}}{{range $network.Aliases}}{{printf "%s\n" .}}{{end}}{{end}}{{end}}'
  for attached_id in $attached_ids; do
    [ -n "$attached_id" ] || continue
    [ "$attached_id" = "$current_container_id" ] && continue
    if ! attached_aliases=$(docker inspect "$attached_id" \
      --format "$aliases_template" 2>/dev/null); then
      printf 'frontend-compose-operation: attached container inspect failed\n' >&2
      return 1
    fi
    for attached_alias in $attached_aliases; do
      if [ "$attached_alias" = "$wanted_alias" ]; then
        printf 'frontend-compose-operation: edge alias collision\n' >&2
        return 1
      fi
    done
  done
}

verify_effective_compose_identity "$TARGET_ENV_FILE"
if ! CURRENT_CONTAINER_ID=$(docker compose --env-file "$TARGET_ENV_FILE" \
  -f "$COMPOSE_FILE" ps -q frontend 2>/dev/null); then
  fail 'current frontend lookup failed'
fi
if ! verify_edge_alias \
  "$EFFECTIVE_FRONTEND_EDGE_NETWORK" \
  "$EFFECTIVE_FRONTEND_EDGE_ALIAS" \
  "$CURRENT_CONTAINER_ID"; then
  fail 'edge alias preflight failed before mutation'
fi
```

verify-compose-topology.sh runs Compose config without sourcing the env file and
requires the effective project name, external network name and unique alias to
equal the approved target values. A mismatch stops before network inspection,
registry pull, env install or up. Alias comparison is exact and quoted; the
current Compose frontend container is the only allowed owner. The shared lock
serializes same-alias operations across runtime directories, and the same
preflight is repeated after up.

## Target preflight: private GHCR and exact effective image

For every bootstrap, promotion, rollback and return-to-current target, keep one
temporary Docker config for the whole operation. Target preflight ends after
authenticated pull and OCI label comparisons; it never runs Compose up, post-up
checks or hosted checks:

```bash
DOCKER_CONFIG_DIR="$(mktemp -d)"

: "${GHCR_USERNAME:?set GHCR_USERNAME in the process environment}"
printf '%s' "${GHCR_READ_ONLY_PAT:?set GHCR_READ_ONLY_PAT in the process environment}" |
  docker --config "$DOCKER_CONFIG_DIR" login ghcr.io \
    --username "$GHCR_USERNAME" --password-stdin >/dev/null

APPROVED_FRONTEND_IMAGE=ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>
EXPECTED_SOURCE=<Source from the same successful summary>
EXPECTED_REVISION=<full 40-character lowercase Git revision>
EXPECTED_WORKFLOW_RUN_URL=https://github.com/<owner>/<repository>/actions/runs/<id>/attempts/<attempt>

verify_target_preflight() {
  target_env_file=$1
  approved_image=$2

  verify_effective_compose_identity "$target_env_file"
  if ! current_container_id=$(docker compose --env-file "$target_env_file" \
    -f "$COMPOSE_FILE" ps -q frontend 2>/dev/null); then
    fail 'current frontend lookup failed'
  fi
  if ! verify_edge_alias \
    "$EFFECTIVE_FRONTEND_EDGE_NETWORK" \
    "$EFFECTIVE_FRONTEND_EDGE_ALIAS" \
    "$current_container_id"; then
    fail 'edge alias preflight failed before pull'
  fi

  RESOLVED_FRONTEND_IMAGE="$($COMPOSE_IMAGE_HELPER \
    "$COMPOSE_FILE" "$target_env_file" "$approved_image")"

  if ! docker --config "$DOCKER_CONFIG_DIR" pull "$RESOLVED_FRONTEND_IMAGE" >/dev/null; then
    fail 'approved target digest pull failed'
  fi
  if ! SOURCE_LABEL=$(docker --config "$DOCKER_CONFIG_DIR" image inspect \
    "$RESOLVED_FRONTEND_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.source"}}' 2>/dev/null); then
    fail 'approved target source label inspect failed'
  fi
  if ! REVISION_LABEL=$(docker --config "$DOCKER_CONFIG_DIR" image inspect \
    "$RESOLVED_FRONTEND_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null); then
    fail 'approved target revision label inspect failed'
  fi
  if ! WORKFLOW_LABEL=$(docker --config "$DOCKER_CONFIG_DIR" image inspect \
    "$RESOLVED_FRONTEND_IMAGE" --format '{{index .Config.Labels "io.github.actions.workflow-run-url"}}' 2>/dev/null); then
    fail 'approved target workflow label inspect failed'
  fi
  [ "$SOURCE_LABEL" = "$EXPECTED_SOURCE" ] || fail 'approved target source mismatch'
  [ "$REVISION_LABEL" = "$EXPECTED_REVISION" ] || fail 'approved target revision mismatch'
  [ "$WORKFLOW_LABEL" = "$EXPECTED_WORKFLOW_RUN_URL" ] || fail 'approved target workflow mismatch'
}

verify_target_preflight "$TARGET_ENV_FILE" "$APPROVED_FRONTEND_IMAGE"
```

All registry operations use docker --config "$DOCKER_CONFIG_DIR". There is no
unauthenticated docker compose pull. RESOLVED_FRONTEND_IMAGE is derived only by
the image helper and is the exact value used for pull, OCI inspection and later
the --pull never deployment. If the local image is missing, --pull never fails;
no tag fallback or second mutation is allowed.

## Host-only records and checked deployment step

Previous and failed records use versioned host-only paths. Publication copies
fully written content to a same-directory temporary file and atomically creates
a no-clobber hard link; an existing destination stops the operation:

```bash
OPERATION_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
PREVIOUS_ENV_RECORD="$RUNTIME_DIR/frontend-compose.previous.$OPERATION_ID.env"
FAILED_ENV_RECORD="$RUNTIME_DIR/frontend-compose.failed.$OPERATION_ID.env"

record_no_clobber() {
  source_file=$1
  destination_file=$2
  RECORD_TEMP_FILE="$destination_file.tmp.$$"
  if ! (set -C; : > "$RECORD_TEMP_FILE") 2>/dev/null; then
    fail 'record temporary path already exists; verify it manually'
  fi
  if ! cp "$source_file" "$RECORD_TEMP_FILE"; then
    fail 'record content write failed'
  fi
  if ! ln "$RECORD_TEMP_FILE" "$destination_file" 2>/dev/null; then
    fail 'record already exists or atomic publication failed'
  fi
  rm "$RECORD_TEMP_FILE"
  RECORD_TEMP_FILE=''
}

install_current_env() {
  source_file=$1
  CURRENT_ENV_TEMP_FILE="$ENV_FILE.tmp.$OPERATION_ID"
  if ! (set -C; : > "$CURRENT_ENV_TEMP_FILE") 2>/dev/null; then
    fail 'current env temporary path already exists; verify it manually'
  fi
  if ! cp "$source_file" "$CURRENT_ENV_TEMP_FILE"; then
    fail 'current env write failed'
  fi
  if ! mv "$CURRENT_ENV_TEMP_FILE" "$ENV_FILE"; then
    fail 'current env install failed'
  fi
  CURRENT_ENV_TEMP_FILE=''
}

record_failed_target() {
  target_env_file=$1
  record_no_clobber "$target_env_file" "$FAILED_ENV_RECORD"
}

deploy_target_once() {
  resolved_image=$1
  deployed_target_env_file=$2

  if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
    up --detach --wait --wait-timeout "$WAIT_TIMEOUT" --pull never frontend; then
    record_failed_target "$deployed_target_env_file"
    fail 'compose up failed; target recorded for human verification'
  fi
  if ! CURRENT_CONTAINER_ID=$(docker compose --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" ps -q frontend 2>/dev/null); then
    record_failed_target "$deployed_target_env_file"
    fail 'frontend lookup failed after up; target recorded'
  fi
  if ! LIVE_IMAGE=$(docker inspect "$CURRENT_CONTAINER_ID" \
    --format '{{.Config.Image}}' 2>/dev/null); then
    record_failed_target "$deployed_target_env_file"
    fail 'live image inspect failed; target recorded'
  fi
  if [ "$LIVE_IMAGE" != "$resolved_image" ]; then
    record_failed_target "$deployed_target_env_file"
    fail 'live image drift after up; target recorded'
  fi
  if ! docker inspect "$CURRENT_CONTAINER_ID" \
    --format '{{json .State.Health}}' >/dev/null 2>/dev/null; then
    record_failed_target "$deployed_target_env_file"
    fail 'health inspect failed after up; target recorded'
  fi
  if ! verify_edge_alias \
    "$EFFECTIVE_FRONTEND_EDGE_NETWORK" \
    "$EFFECTIVE_FRONTEND_EDGE_ALIAS" \
    "$CURRENT_CONTAINER_ID"; then
    record_failed_target "$deployed_target_env_file"
    fail 'edge alias collision after up; target recorded'
  fi
  if ! "$HOSTED_ROUTING_CHECKER" "$FRONTEND_ORIGIN" "$EXPECTED_SOURCE" \
    "$EXPECTED_REVISION" "${DIRECT_SPA_PATH:-/login}"; then
    record_failed_target "$deployed_target_env_file"
    fail 'hosted routing check failed; target recorded'
  fi
}
```

deploy_target_once is the only mutation step and contains exactly one Compose
up. It is called only after target preflight, and after record_no_clobber for
promotion. Callers perform install_current_env exactly once immediately before
it. Every up and hosted checker failure records the target before stopping; there
is never an automatic rollback.

## Bootstrap

Bootstrap has no previous digest. Prepare TARGET_ENV_FILE with the first
approved digest and the same project/network/unique alias values. Set target
identity variables, acquire the shared lock, run verify_target_preflight, then:

```bash
install_current_env "$TARGET_ENV_FILE"
deploy_target_once "$RESOLVED_FRONTEND_IMAGE" "$TARGET_ENV_FILE"
```

The first successful digest becomes the known-good current image. Do not create a
previous record retroactively: bootstrap starts without a rollback target.

## Promotion

Prepare a host-only TARGET_ENV_FILE for the approved candidate and set its
FRONTEND_IMAGE to the candidate digest. Set expected source, revision and
workflow URL from the same summary. Under the checked operation lock:

1. set target project/network/alias values and verify exact effective Compose
   identity with verify_target_preflight;
2. run the shared-lock alias preflight and authenticated target pull/OCI label
   comparisons; target preflight performs both and no up;
3. save current known-good ENV_FILE with
   record_no_clobber "$ENV_FILE" "$PREVIOUS_ENV_RECORD";
4. run install_current_env "$TARGET_ENV_FILE" exactly once;
5. run deploy_target_once "$RESOLVED_FRONTEND_IMAGE" "$TARGET_ENV_FILE"
   exactly once.

The previous record is the exact rollback target for this promotion. A failed,
timed-out or unknown deployment writes a versioned failed target record and
stops for human verification. Never reuse or overwrite a prior record and never
run an automatic rollback.

## Explicit rollback and return-to-current

Rollback requires selected FAILED_ENV_RECORD and PREVIOUS_ENV_RECORD; both are
host-only versioned files. Set failed candidate image and current target
provenance from the records/approved notes. Before any rollback mutation, verify
current effective image, live image and alias ownership:

```bash
verify_effective_compose_identity "$ENV_FILE"
if ! CURRENT_RESOLVED_FRONTEND_IMAGE="$($COMPOSE_IMAGE_HELPER \
  "$COMPOSE_FILE" "$ENV_FILE" "$FAILED_CANDIDATE_IMAGE")"; then
  fail 'current image resolution failed before rollback'
fi
[ "$CURRENT_RESOLVED_FRONTEND_IMAGE" = "$FAILED_CANDIDATE_IMAGE" ] ||
  fail 'current env image drift before rollback'
if ! CURRENT_CONTAINER_ID=$(docker compose --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" ps -q frontend 2>/dev/null); then
  fail 'current frontend lookup failed before rollback'
fi
if ! LIVE_IMAGE=$(docker inspect "$CURRENT_CONTAINER_ID" \
  --format '{{.Config.Image}}' 2>/dev/null); then
  fail 'live image inspect failed before rollback'
fi
[ "$LIVE_IMAGE" = "$FAILED_CANDIDATE_IMAGE" ] ||
  fail 'live image drift before rollback'
if ! verify_edge_alias \
  "$EFFECTIVE_FRONTEND_EDGE_NETWORK" \
  "$EFFECTIVE_FRONTEND_EDGE_ALIAS" \
  "$CURRENT_CONTAINER_ID"; then
  fail 'edge alias collision before rollback'
fi
```

Then set the previous target identity variables and run the same
verify_target_preflight against PREVIOUS_ENV_RECORD. Only after its exact digest
pull and OCI comparisons:

```bash
install_current_env "$PREVIOUS_ENV_RECORD"
deploy_target_once "$RESOLVED_FRONTEND_IMAGE" "$PREVIOUS_ENV_RECORD"
```

Rollback uses --pull never through deploy_target_once; missing local images,
provenance mismatch, effective identity drift or alias ownership stop before
mutation. Return-to-current is a separate operation, never an error-handler
branch: current env/live image must equal the rollback target, then the failed
candidate target undergoes the same topology, alias, pull, OCI and --pull never
checks before install_current_env and one deployment step.

## Status and restart recovery

Read-only local checks after a successful operation:

```bash
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=150 --no-color frontend
CONTAINER_ID="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q frontend)"
docker inspect "$CONTAINER_ID" --format '{{json .State.Health}}'
docker inspect "$CONTAINER_ID" --format '{{json .NetworkSettings.Ports}}'
```

There is no host port publication; Caddy reaches the unique edge alias on
container port 8080. restart: unless-stopped allows Docker to restart the
container after a daemon/VPS restart. Recovery still starts with the shared
lock, effective topology check, alias preflight, current env/live image drift
checks and exact target preflight; it does not silently pull or mutate. Caddy
restart/attachment remains host-owned.

## Hosted routing checker

The credential-free scripts/production/verify-hosted-routing.sh accepts the
exact FRONTEND_ORIGIN (https:// plus hostname, without path/query/credentials),
expected GitHub source, full lowercase 40-character revision and an optional
direct SPA path (default /login). It uses bounded curl requests without
redirects, keeps body/headers under a temporary directory, prints no response
data, and asserts:

- frontend health is 200 text/plain with exact body ok;
- frontend identity is 200 text/plain with exact source and revision;
- / and the direct SPA path are 200 text/html with <div id="root"></div>;
- exact /v1, /v1/**frontend_deployment_probe**, /health and
  /health/**frontend_deployment_probe** are backend-controlled 4xx
  application/problem+json, never the SPA root;
- /v10, /v1-admin and /healthcheck remain 200 text/html SPA fallback;
- any redirect fails because requests are not followed and expected statuses
  are strict.

The checker has local fake-curl tests, including the complete ordered request
set, and uses no network. Its execution against a real origin is hosted
evidence and was NOT RUN in source-only work.
