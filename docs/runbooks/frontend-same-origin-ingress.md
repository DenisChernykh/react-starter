# Same-origin ingress для frontend image

## Назначение и граница

Production browser transport использует относительный `/v1`: frontend должен
раздаваться с того же origin, на который browser отправляет API request. Ни
hostname, ни backend URL не baked into frontend image. Этот runbook описывает
host-owned Caddy path routing; он не доказывает, что Caddy, backend, DNS, TLS
или настоящий host уже настроены.

Tracked пример конфигурации находится в
[`config/caddy/frontend-ingress.Caddyfile.example`](../../config/caddy/frontend-ingress.Caddyfile.example).
Скопируйте его в host-owned Caddy config и задайте symbolic env placeholders
для frontend domain, backend upstream и unique frontend edge alias.

## Caddy path-routing contract

```text
frontend domain /v1, /v1/*, /health, /health/* → backend upstream
frontend domain all remaining paths             → unique frontend alias:8080
```

Пример использует named matcher ровно для `/v1`, `/v1/*`, `/health` и
`/health/*`, а backend `handle` расположен перед catch-all frontend `handle`.
Поэтому `/v10`, `/v1-admin`, `/healthcheck`, `/_frontend/health` и
`/_frontend/identity` остаются на frontend fallback. Не заменяйте matcher на
широкий prefix, например `/v1*` или `/health*`.

Frontend image намеренно отвечает non-HTML `404` на API/health paths. Это
защищает от случайного SPA fallback, но не заменяет host ingress routing.

## Frontend, backend и TLS ownership

Frontend image владеет static assets, non-root Nginx на `8080`,
`/_frontend/health` и `/_frontend/identity`. Host Caddy владеет TLS
termination, certificate renewal, HTTP→HTTPS redirect, HSTS и reverse proxy.
Backend, external edge network, DNS, credentials и observability также
остаются host-owned. Compose не публикует frontend port на host.

Frontend copies на одной edge network используют разные
`FRONTEND_EDGE_ALIAS`; Caddy всегда обращается к выбранному alias, а не к
generic service name `frontend`. Caddy config не копируется в browser image.

## Host-side Caddy validation

После копирования example в host-owned config задайте placeholders в host
environment и выполните ровно эти команды:

```bash
: "${FRONTEND_DOMAIN:?set FRONTEND_DOMAIN in the host environment}"
: "${BACKEND_UPSTREAM:?set BACKEND_UPSTREAM in the host environment}"
: "${FRONTEND_EDGE_ALIAS:?set FRONTEND_EDGE_ALIAS in the host environment}"
CADDY_FILE=/path/to/host-owned/frontend-ingress.Caddyfile
caddy adapt --config "$CADDY_FILE" --adapter caddyfile --pretty >/dev/null
caddy validate --config "$CADDY_FILE" --adapter caddyfile
FRONTEND_ORIGIN="https://${FRONTEND_DOMAIN}"
```

Эти команды относятся к host-side evidence. Caddy binary и его reload в
source-only работе не запускались.

## Probes перед эксплуатацией

После явной host настройки запустите credential-free checker с ожидаемыми
source/revision из approved candidate summary и выбранным direct SPA path:

```bash
HOSTED_ROUTING_CHECKER=/path/to/checked-out/react-starter/scripts/production/verify-hosted-routing.sh
EXPECTED_SOURCE=https://github.com/<owner>/<repository>
EXPECTED_REVISION=<full 40-character lowercase Git revision>
DIRECT_SPA_PATH=/login
"$HOSTED_ROUTING_CHECKER" "$FRONTEND_ORIGIN" "$EXPECTED_SOURCE" \
  "$EXPECTED_REVISION" "$DIRECT_SPA_PATH"
```

Checker проверяет frontend health/identity, root, direct SPA path, точные `/v1`
и `/health`, их slash descendants, а также frontend collisions `/v10`,
`/v1-admin` и `/healthcheck`. API/health paths должны получить контролируемый
backend `4xx` с media type `application/problem+json`; non-HTML или
`text/plain 404` от frontend — это не достаточное доказательство правильной
маршрутизации. Browser login/API и credentialed CORS проверяются отдельно с
реальным backend.

Локальный Caddy validation, Caddy reload, VPS restart, DNS/TLS и hosted probes
в этом repository не запускались и не являются local source evidence.
