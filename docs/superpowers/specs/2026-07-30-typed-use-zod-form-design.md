# Типизированный shared-хук `useZodForm`

## Статус

Дизайн одобрен 30 июля 2026 года для реализации GitHub issue
`DenisChernykh/react-starter#7`.

## Контекст

Starter использует React Hook Form 7, `@hookform/resolvers` 5 и Zod 4.
Три существующие формы повторяют одну связку `useForm + zodResolver`:

- login;
- создание запроса согласования;
- открытие запроса согласования по UUID.

Установленные декларации библиотек уже различают:

- значения controls и `defaultValues` как `TFieldValues`;
- результат успешного resolver и submit как `TTransformedValues`;
- Zod schema input как `z.input<TSchema>`;
- Zod schema output как `z.output<TSchema>`.

Общий hook должен связать эти контракты без потери типов и без новой
UI-абстракции.

## Цель

Добавить UI-agnostic `useZodForm`, который:

1. принимает Zod schema для объектных form values;
2. хранит form state в типе `z.input<TSchema>`;
3. передаёт успешному submit значение `z.output<TSchema>`;
4. всегда устанавливает `zodResolver(schema)` внутри;
5. оставляет form policy конкретному consumer.

## Не входит в scope

- UI/form-field adapter;
- новый form framework или schema factory;
- общие defaults для `mode`, `reValidateMode` или `defaultValues`;
- reset и server-error policy;
- изменение global `z.config(ru())`;
- изменение generated OpenAPI или generated Zod;
- новые e2e-тесты;
- обновление зависимостей.

## Публичный контракт

Hook размещается в `src/shared/lib/form` и экспортируется через локальный
`index.ts`:

```ts
useZodForm<TSchema>(
  schema,
  options?,
): UseFormReturn<z.input<TSchema>, unknown, z.output<TSchema>>
```

`options` совместимы с
`UseFormProps<z.input<TSchema>, unknown, z.output<TSchema>>`, кроме свойства
`resolver`. Параметр опционален, чтобы consumer без собственной policy не
передавал пустой объект.

Экспортируется только hook. Вспомогательные generic-типы остаются приватными,
потому что не образуют самостоятельный reusable API.

## Ограничение schema

React Hook Form работает с объектными `FieldValues`, тогда как Zod schema в
общем случае может описывать primitive. Внутренняя generic-граница:

- проверяет, что `z.input<TSchema>` совместим с `FieldValues`;
- сохраняет конкретные input и output schema;
- отклоняет primitive schema на этапе TypeScript;
- не использует `any`, type assertion или untyped resolver.

Реализация вызывает:

```ts
useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
  ...options,
  resolver: zodResolver(schema),
})
```

При необходимости generics `zodResolver` задаются явно по установленным
declarations, но публичный контракт не расширяется и не ослабляется.

## Data flow

```text
native control
→ React Hook Form хранит z.input<TSchema>
→ handleSubmit
→ zodResolver(schema)
→ Zod validation и transform
→ submit получает z.output<TSchema>
```

Hook не владеет UI, mutation, navigation, reset или отображением ошибок.
Generated schema остаётся transport-контрактом в `shared/api`, а feature
передаёт её в hook через curated public API.

## Миграция consumers

Следующие формы заменяют прямые `useForm + zodResolver` на
`useZodForm(schema)`:

- `LoginForm`;
- `CreateApprovalRequestForm`;
- `OpenApprovalRequestForm`.

DTO-типы сохраняются там, где они нужны для allowlist server field errors.
Поведение submit, navigation, cache, session revalidation и безопасных ошибок
не меняется.

## Проверка

### Focused hook tests

1. Локальная schema принимает строку с пробелами и преобразует её в значение
   другого типа. Тест доказывает одновременно:
   - до submit RHF хранит исходный string input;
   - submit получает преобразованный Zod output.
2. Generated `approvalRequestPathSchema` успешно работает через shared hook и
   сохраняет допустимое написание UUID.

Тесты используют реальный React Hook Form, resolver и Zod без mock resolver.

### Regression tests

Запускаются существующие тесты login, create approval request и open approval
request. После focused checks выполняется свежий полный gate:

```bash
pnpm check
```

Все команды выполняются на Node `24.18.0` и pnpm `11.15.1`.

## Документация

Экспортируемый hook получает русский TSDoc:

- summary объясняет назначение;
- `@remarks` фиксирует caller-owned policy и встроенный resolver;
- `@returns` описывает различие между input form state и transformed submit.

Generated-файлы не документируются и не изменяются.

## Доставка

Работа выполняется в ветке `feat/typed-use-zod-form`. После успешного
`pnpm check` ветка публикуется, и создаётся ready PR в `stage` с
`Closes #7`. Merge остаётся вне scope.
