# Same-origin ingress для frontend image

## Назначение и граница

Production browser transport использует относительный `/v1`: публичный и
admin frontend должны раздаваться с того же origin, на который browser
отправляет API request. Ни hostname, ни backend URL не baked into frontend
image. Этот runbook описывает контракт для будущей ingress/Dokploy/VPS
настройки; он не является доказательством, что такой оператор или host уже
существует.

Примеры hostnames ниже условны. Замените их реальными product hosts при
операторской настройке, не добавляя их в image build.

## Обязательная path-routing table

```text
public host /v1, /v1/*, /health, /health/* → backend
public host all remaining paths            → public frontend:8080
admin host /v1, /v1/*, /health, /health/*  → backend
admin host all remaining paths             → admin frontend:8080
api host all paths                          → backend
```

Path router имеет приоритет над frontend fallback. Сначала сопоставьте
точный `/v1` или его slash descendants `/v1/*`, а также точный `/health` или
его slash descendants `/health/*` с backend, затем направьте оставшиеся
public/admin paths в соответствующий frontend. Prefix collisions `/v10`,
`/v1-admin` и `/healthcheck` не являются backend routes и должны оставаться во
frontend. Не отправляйте `api` host во frontend: это отдельный backend-only
host.

```text
browser /v1/auth/me
→ public.example.test or admin.example.test
→ ingress exact API/health route
→ backend

browser /approval-requests
→ public.example.test or admin.example.test
→ frontend:8080
→ SPA fallback /index.html
```

Frontend image намеренно отвечает non-HTML `404` на точные `/v1`, `/health` и
их slash descendants. Это защищает от случайного SPA fallback, но не заменяет
ingress routing.

## Health и misrouting probes

`/_frontend/health` принадлежит только frontend image и возвращает `200 ok`.
Ingress может использовать его как upstream health probe для public/admin
frontend. Не путайте его с backend readiness/liveness endpoints.

Перед эксплуатацией проверьте каждый public и admin host:

```bash
curl -i https://public.example.test/_frontend/health
curl -i https://admin.example.test/_frontend/health
curl -i https://public.example.test/v1/__frontend_deployment_probe__
curl -i https://admin.example.test/health/__frontend_deployment_probe__
```

Первые два probe должны попасть в соответствующий frontend. Два API/health
probe должны получить ответ backend и никогда не HTML frontend shell. Подберите
безопасный несуществующий path, который backend обработает как non-HTML `404`;
не включайте credentials, cookies или secrets в diagnostic commands.

## TLS и security ownership

TLS termination, certificate renewal, redirect HTTP→HTTPS и HSTS принадлежат
ingress. Frontend image не добавляет HSTS, потому что не знает публичный host и
не должен навязывать transport policy для всего домена. Его security headers
являются only application response headers; настройка TLS/HSTS проверяется
отдельно на настоящем ingress.

## Подготовка Dokploy/VPS

Будущий Dokploy/VPS оператор должен предоставить три upstreams: backend,
public frontend image и admin frontend image. Он выбирает exact approved
digest для каждой frontend copy и применяет таблицу выше. Эта часть остаётся
подготовкой: данный repository не содержит Dokploy secret, live VPS inventory,
hostnames или deployment evidence.

Связанная supply-chain граница описана в
[runbook публикации frontend image](frontend-image-publication.md).
