# UI-компоненты

## Владение

Повторяемые controls и UI-состояния сначала ищутся в `src/shared/ui`. Если
нужного контракта нет, расширь shared-компонент и покрой его тестом до
использования в feature/page JSX.

Скопированный shadcn registry-код является редактируемым проектным source.
Сохраняй неизменённые примитивы близкими к upstream; проектное поведение
добавляй только при повторяемом сценарии.

## Обязательные пути

| Сценарий                        | Использовать                        |
| ------------------------------- | ----------------------------------- |
| Action                          | `Button`                            |
| Pending action                  | `Button isLoading` + `loadingLabel` |
| Обычное form-поле               | `TextField`                         |
| Поле пароля                     | `PasswordField`                     |
| Многострочное form-поле         | `TextareaField`                     |
| Page width и horizontal gutters | `Container`                         |
| Form/page error                 | `Alert variant="destructive"`       |
| Необратимое общее действие      | `AlertDialog` с подтверждением      |

Не создавай feature-level spinner, raw form control или локальный page
container, если shared-контракт семантически подходит. Vertical spacing
остаётся ответственностью потребителя `Container`.

## Композиция и layout

App-wide повторяемый layout, например защищённая shell-навигация, принадлежит
`widgets`. Route-specific композиция страниц и `Outlet` остаётся в `pages` и
`app`; widget получает готовый content, но не владеет router tree.

Для необратимого shared action используй `AlertDialog` с явным подтверждением,
отменой и восстановлением фокуса на trigger. Многострочный пользовательский
ввод проходит через `TextareaField`, чтобы label, description, error и
accessibility contract не собирались локально.

Base UI composition использует prop `render`; Radix `asChild` в этом проекте не
используется. Когда `render` возвращает ссылку, соблюдай контракт конкретного
primitive, включая `nativeButton={false}` для `Button`.
