# Shadcn UI foundation: дизайн

## Контекст

`react-starter` уже использует React 19, Vite, Tailwind CSS v4, Feature-Sliced
Design, React Hook Form и Zod, но пока не инициализирует shadcn/ui. Текущие
login, logout, dashboard и route-error экраны напрямую создают HTML-кнопки,
поля и карточкоподобные контейнеры с локальными Tailwind-классами. Из-за этого
повторяемые состояния — loading, invalid, disabled, field error и page error —
не имеют единого проектного контракта.

Задача создаёт первый законченный вертикальный UI-срез: от конфигурации shadcn
и переиспользуемых компонентов до их применения в существующих пользовательских
сценариях и автоматических проверок.

## Цели

- Инициализировать shadcn/ui поверх существующих Vite и Tailwind CSS v4.
- Явно выбрать Base UI и пользовательский preset `b3Rs9tMDg`.
- Добавить минимальный набор registry-компонентов, реально используемый
  текущими auth/dashboard экранами.
- Закрепить повторяемые UX-состояния в `src/shared/ui`, а не в feature JSX.
- Добавить проектные контракты `Button isLoading`, `TextField`,
  `PasswordField` и `Container`.
- Перевести существующие login, logout, dashboard и route-error экраны на
  новые компоненты.
- Исключить локальные `.env`-файлы из Git, сохранив `.env.example`.
- Сохранить FSD-границы, доступность и текущую auth/error бизнес-логику.

## Не входит в задачу

- Storybook или отдельный UI Lab.
- Dark-mode toggle или разработка второй цветовой темы.
- Полноценный дизайн dashboard за пределами существующего header.
- Floating label, маски, formatter/parser, debounce и асинхронная валидация
  полей.
- Установка большой коллекции shadcn-компонентов «на будущее».
- Изменения backend, OpenAPI или auth-протокола.
- Публикация ветки или создание PR без отдельного запроса пользователя.

## Визуальная основа

Единственным источником визуальной конфигурации служит preset
`b3Rs9tMDg`:

- style: `lyra`;
- base color: `taupe`;
- theme: `blue`;
- chart color: `lime`;
- icon library: `lucide`;
- font: `inter`;
- heading font: `inherit`;
- radius: `default`;
- menu accent: `subtle`;
- menu color: `default`.

Base UI задаётся явно и не выводится из preset:

```bash
pnpm dlx shadcn@latest init \
  --base base \
  --preset b3Rs9tMDg \
  --yes
```

Инициализация должна использовать существующие:

- Vite;
- React 19;
- Tailwind CSS v4;
- CSS-файл `src/app/styles/index.css`;
- алиас `@/*`;
- каталог `src/shared/ui`.

CLI-результат проверяется перед сохранением: он не должен переносить компоненты
в `src/components/ui`, заменять выбранный preset или создавать второй global
CSS entrypoint.

## Архитектура компонентов

### Registry-слой

В `src/shared/ui` добавляются только компоненты, используемые этим срезом:

- `button`;
- `spinner`;
- `input`;
- `field`;
- `input-group`;
- `card`;
- `alert`.

Скопированные shadcn-компоненты остаются максимально близкими к registry-коду.
Исключение — `Button`, потому что loading является обязательным проектным
контрактом. Все изменённые рукописные экспортируемые API получают русскоязычный
TSDoc по `docs/architecture/tsdoc-guidelines.md`.

Скопированный shadcn registry-код считается редактируемым проектным исходным
кодом, а не автоматически перегенерируемым артефактом наподобие Orval output.
Неизменённые registry-примитивы не документируются вручную; проектные изменения
и новые композиции документируются по общим TSDoc-правилам.

### `Button`

`Button` расширяет shadcn API двумя пропсами:

```ts
type ButtonLoadingProps = {
  isLoading?: boolean
  loadingLabel?: string
}
```

Контракт:

- `isLoading` показывает центрированный `Spinner`, а не видимый loading-текст;
- исходное содержимое остаётся в layout в невидимом виде, поэтому ширина
  кнопки не меняется;
- `isLoading` принудительно блокирует кнопку, даже если `disabled` не передан;
- кнопка получает `aria-busy="true"`;
- `loadingLabel` задаёт доступное имя loading-состояния и не показывается
  визуально;
- fallback доступного имени — `Загрузка`;
- spinner внутри кнопки скрыт от accessibility tree, чтобы не дублировать
  объявление кнопки;
- обычные shadcn variants, sizes и нативные button props сохраняются.

Login использует `loadingLabel="Входим"`, logout —
`loadingLabel="Выходим"`.

### `Input`

Низкоуровневый `Input` остаётся близким к shadcn registry:

- принимает все нативные input props и `ref`;
- поддерживает React Hook Form `register`;
- использует Lyra/taupe/blue tokens;
- корректно отображает focus-visible, disabled, read-only и
  `aria-invalid` состояния;
- не принимает `label`, `error` или password-specific props.

Это сохраняет примитив обновляемым и не превращает его в универсальный
form-комбайн.

### `TextField`

`TextField` — проектная композиция `Field` + `FieldLabel` + `Input` +
`FieldDescription` + `FieldError`.

Публичный контракт добавляет к нативным input props:

```ts
type TextFieldProps = React.ComponentProps<'input'> & {
  label: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
}
```

Поведение:

- использует переданный `id` или создаёт стабильный через `useId`;
- автоматически связывает label с input;
- автоматически выставляет `aria-invalid`, когда передан `error`, а при
  отсутствии `error` сохраняет явно переданное вызывающим кодом значение;
- объединяет пользовательский `aria-describedby` с id description и error;
- отображает error как доступное динамическое сообщение;
- сохраняет `name`, `ref`, `onChange`, `onBlur` и остальные props из
  React Hook Form;
- не реализует floating label.

### `PasswordField`

`PasswordField` — отдельная проектная композиция `Field` и `InputGroup`.
Она принимает контракт `TextField`, кроме фиксированного `type`.

Поведение:

- по умолчанию рендерит `type="password"`;
- toggle меняет только отображение между `password` и `text`;
- значение, фокус и React Hook Form registration сохраняются;
- toggle доступен с клавиатуры;
- доступное имя toggle меняется между `Показать пароль` и `Скрыть пароль`;
- иконка Lucide декоративна и не дублирует accessible name;
- `autoComplete` остаётся нативным prop; login явно использует
  `current-password`.

Floating label намеренно исключён: он требует отдельного системного решения
для placeholder, autofill, password managers, controlled values и ошибок и не
соответствует выбранной границе первого Lyra-среза.

### `Container`

`Container` — проектный layout primitive, не registry-компонент:

```ts
type ContainerProps = React.ComponentProps<'div'> & {
  as?: 'div' | 'main' | 'section'
}
```

Контракт:

- `as` по умолчанию равен `div`;
- базовые классы:
  `container mx-auto px-4 sm:px-6 lg:px-8`;
- `className` объединяется через `cn`;
- нативные props передаются выбранному элементу;
- корень получает `data-slot="container"`;
- компонент не задаёт вертикальные отступы;
- в первом срезе нет width/size variants и `w-full`.

Вертикальные отступы и page-specific layout остаются ответственностью
потребителя.

## Применение в текущем приложении

### Login

`LoginPage` использует `Container` и `Card`. Карточка остаётся компактной и
центрированной, но переходит с ad-hoc zinc-классов на semantic Lyra tokens.

`LoginForm`:

- заменяет ручные label/input/error блоки на `TextField` и `PasswordField`;
- сохраняет существующий React Hook Form + generated Zod resolver;
- сохраняет mapping backend validation pointers;
- показывает form-level error через destructive `Alert`;
- отправляет форму через полноширинный `Button`;
- использует `isLoading={login.isPending}` и
  `loadingLabel="Входим"`;
- не меняет навигацию, CSRF или session-cache поведение.

### Logout

`LogoutButton`:

- использует outline `Button`;
- передаёт `isLoading={logout.isPending}` и
  `loadingLabel="Выходим"`;
- показывает неустранимую ошибку через destructive `Alert`;
- сохраняет существующую обработку `AUTHENTICATION_REQUIRED`.

### Dashboard

`DashboardPage` заменяет raw page padding на `Container` с локальным
вертикальным отступом. Содержимое и session query не меняются.

### Route error

`RouteError`:

- использует `Container`, `Alert` и `Button`;
- сохраняет request id, retry и authentication redirect;
- loading redirect не получает новый spinner, потому что это отдельный
  navigation fallback, а не button loading state.

После миграции неиспользуемый `ErrorMessage` удаляется вместе с barrel-export.

## UI-правило для будущих задач

Создаётся `docs/architecture/ui-guidelines.md` с короткой матрицей:

- повторяемый control/state сначала ищется в `src/shared/ui`;
- если контракта нет, расширяется shared-компонент, а не feature JSX;
- button loading реализуется только через `Button isLoading`;
- form-поля используют `TextField`/`PasswordField`;
- page width и horizontal gutters задаёт `Container`;
- ad-hoc raw controls допустимы только когда shared-компонент семантически не
  подходит.

`AGENTS.md` получает короткое policy-правило и ссылку на документ, без
перечисления всех визуальных состояний.

## Environment-файлы

`.gitignore` получает:

```gitignore
.env
.env.*
!.env.example
```

Существующий пользовательский `.env` не читается, не изменяется и не
переносится в worktree. `.env.example` остаётся tracked.

## Тестирование

### Component tests

`Button`:

- обычное состояние сохраняет label и остаётся enabled;
- `isLoading` показывает spinner;
- loading-состояние disabled и имеет `aria-busy`;
- accessible name берётся из `loadingLabel`;
- исходный контент остаётся в DOM для сохранения layout;
- переданный `disabled` продолжает работать без loading.

`TextField`:

- связывает label и input;
- автоматически связывает description/error;
- выставляет `aria-invalid` при ошибке, а без ошибки сохраняет явно переданное
  значение;
- сохраняет пользовательский `aria-describedby`;
- принимает registration props и native attributes.

`PasswordField`:

- начинает с password type;
- toggle меняет type и accessible name;
- повторный toggle возвращает password type;
- значение сохраняется.

`Container`:

- по умолчанию рендерит `div`;
- поддерживает `main` и `section`;
- передаёт props;
- содержит базовые и пользовательские классы;
- имеет `data-slot="container"`.

### Integration tests

Существующие login/logout/route-error tests обновляются так, чтобы проверять
пользовательское поведение, а не старые raw elements:

- pending login находит disabled кнопку по имени `Входим` и spinner;
- pending logout получает отдельный regression test;
- form validation остаётся связанной с полями;
- destructive alerts не раскрывают raw backend detail;
- route retry продолжает вызывать revalidation.

### Gates

Все команды выполняются под Node `24.18.0` и pnpm `11.15.1`.

Обязательные проверки:

```bash
pnpm api:check
pnpm format:check
pnpm lint
pnpm architecture
pnpm test
pnpm build
git diff --check
```

Если pnpm wrapper повторно запускает dependency preflight и падает до целевой
команды, допускается запуск соответствующего бинарника из `node_modules/.bin`
с отдельным указанием этой границы. PASS заявляется только по свежему выводу.

### Визуальная проверка

Login, dashboard и route-error проверяются в реальном браузере:

- ширины 320, 768 и 1440 px;
- keyboard focus;
- normal, invalid и loading состояния;
- отсутствие horizontal overflow;
- отсутствие layout shift у loading-кнопок;
- password toggle остаётся клавиатурно доступным.

## Критерии готовности

- `components.json` фиксирует Base UI, стиль `base-lyra`, пользовательский
  preset и FSD-алиасы.
- Ни один существующий auth/dashboard экран не создаёт raw button/input для
  покрытых shared-компонентами сценариев.
- Loading-кнопки показывают spinner, сохраняют ширину и доступны для screen
  reader.
- Login использует `TextField` и `PasswordField` без изменения auth-логики.
- `Container` используется на трёх page-level поверхностях и не управляет
  вертикальным spacing.
- `.env` и `.env.*` игнорируются, `.env.example` остаётся tracked.
- Русскоязычный TSDoc соответствует проектному руководству.
- Автоматические gates и browser-check дают свежие проверяемые результаты.
