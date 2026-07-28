import { useId, type ComponentProps, type ReactNode } from 'react'

type FieldA11yOptions = Pick<
  ComponentProps<'input'>,
  'id' | 'aria-describedby' | 'aria-invalid'
> & {
  description?: ReactNode
  error?: ReactNode
}

/**
 * Строит стабильные id и ARIA-связи для проектных form-field композиций.
 *
 * @returns Идентификаторы description/error, итоговый `aria-describedby` и
 * invalid-состояние. Наличие `error` имеет приоритет над переданным
 * `aria-invalid`.
 */
export function useFieldA11y({
  id,
  'aria-describedby': externalDescription,
  'aria-invalid': externalInvalid,
  description,
  error,
}: FieldA11yOptions) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hasDescription = description !== undefined && description !== null
  const hasError = error !== undefined && error !== null
  const descriptionId = hasDescription ? `${inputId}-description` : undefined
  const errorId = hasError ? `${inputId}-error` : undefined
  const describedBy =
    [externalDescription, descriptionId, errorId].filter(Boolean).join(' ') ||
    undefined
  const ariaInvalid = hasError ? true : externalInvalid
  const isInvalid =
    ariaInvalid === true ||
    ariaInvalid === 'true' ||
    ariaInvalid === 'grammar' ||
    ariaInvalid === 'spelling'

  return {
    ariaInvalid,
    describedBy,
    descriptionId,
    errorId,
    inputId,
    isInvalid,
  }
}
