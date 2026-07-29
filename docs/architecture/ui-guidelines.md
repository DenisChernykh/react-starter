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
| Page width и horizontal gutters | `Container`                         |
| Form/page error                 | `Alert variant="destructive"`       |

Не создавай feature-level spinner, raw form control или локальный page
container, если shared-контракт семантически подходит. Vertical spacing
остаётся ответственностью потребителя `Container`.
