import { Eye, EyeOff } from 'lucide-react'
import { useRef, useState, type ComponentProps, type ReactNode } from 'react'

import { Field, FieldDescription, FieldError, FieldLabel } from './field'
import { useFieldA11y } from './field-a11y'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './input-group'

type PasswordFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
}

/**
 * Рендерит парольное поле с переключателем видимости и ARIA-связями формы.
 *
 * @remarks Переключатель сохраняет значение и возвращает фокус в input; `ref`
 * передаётся дальше, поэтому компонент совместим с React Hook Form.
 */
export function PasswordField({
  label,
  description,
  error,
  id,
  ref,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...inputProps
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const metadata = useFieldA11y({
    id,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    description,
    error,
  })
  const hasDescription = description !== undefined && description !== null
  const hasError = error !== undefined && error !== null

  function setInputRef(node: HTMLInputElement | null) {
    inputRef.current = node

    if (typeof ref === 'function') {
      ref(node)
      return
    }

    if (ref !== null && ref !== undefined) {
      ref.current = node
    }
  }

  return (
    <Field data-invalid={metadata.isInvalid || undefined}>
      <FieldLabel htmlFor={metadata.inputId}>{label}</FieldLabel>
      <InputGroup data-invalid={metadata.isInvalid || undefined}>
        <InputGroupInput
          {...inputProps}
          id={metadata.inputId}
          ref={setInputRef}
          type={isVisible ? 'text' : 'password'}
          aria-describedby={metadata.describedBy}
          aria-invalid={metadata.ariaInvalid}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={isVisible ? 'Скрыть пароль' : 'Показать пароль'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsVisible((current) => !current)
              inputRef.current?.focus()
            }}
          >
            {isVisible ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {hasDescription && (
        <FieldDescription id={metadata.descriptionId}>
          {description}
        </FieldDescription>
      )}
      {hasError && (
        <FieldError id={metadata.errorId} role="alert">
          {error}
        </FieldError>
      )}
    </Field>
  )
}
