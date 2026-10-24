# React Application Starter

Основа React-приложения для работы с HTTP API: маршрутизация, авторизация, серверное состояние и UI-компоненты.

## Возможности

- Публичные и защищённые маршруты, cookie-сессии и CSRF.
- TanStack Query, Axios, OpenAPI и Orval.
- FSD, shared UI, Vitest, Testing Library и MSW.

## Инженерные акценты

- Формирование архитектуры и инженерных правил для новых приложений.
- Типизированная интеграция frontend/backend и обработка API-ошибок.
- Повторно используемые пользовательские сценарии с автоматизированными проверками.

## Стек

React, TypeScript, TanStack Query, React Router, Tailwind CSS, Vite, Vitest.

## Навигация по коду

- [src/](src/) — исходный код.
- [docs/](docs/) — архитектура и документация.

## Разработка

Инструменты: Node.js 24, pnpm@11.15.1.

```sh
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm lint
```

Параметры окружения перечислены в [.env.example](.env.example). Локальные значения задаются вне Git.
