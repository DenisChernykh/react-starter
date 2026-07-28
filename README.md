# React starter

Стартовый React-проект для `nest-js-starter`: React Router Data Mode, Feature-Sliced Design, TanStack Query, Axios, Tailwind CSS и OpenAPI-генерация через Orval.

## Требования

- Node.js 24.18.0
- pnpm 11.15.1

## Локальный запуск

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Frontend доступен на `http://localhost:5173`, backend ожидается на `http://localhost:3000`. Для browser-auth backend должен содержать `http://localhost:5173` в `CORS_ORIGINS`.

## Контракт API

`openapi/openapi.json` — committed build-time snapshot backend-контракта. Это не browser asset и не должен раздаваться приложением.

```bash
pnpm api:update # синхронизировать snapshot и сгенерировать клиент
pnpm api:check  # проверить воспроизводимость generated output
```

Каталоги `src/shared/api/generated` и `src/shared/api/generated-zod` создаются только Orval и не редактируются вручную.

## Проверки

```bash
pnpm check
```

Команда последовательно проверяет OpenAPI drift, форматирование, ESLint, FSD-архитектуру, тесты и production build.

## Аутентификация

Backend управляет opaque HttpOnly session cookie. Frontend передаёт credentials и держит CSRF token только в памяти процесса; frontend token storage не используется.
