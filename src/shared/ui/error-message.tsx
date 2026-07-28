import type { ReactNode } from 'react'

type ErrorMessageProps = {
  children: ReactNode
  id?: string
}

/**
 * Отображает доступное сообщение об ошибке формы или страницы.
 *
 * @remarks Использует `role="alert"`, чтобы ассистивные технологии объявляли
 * новое сообщение об ошибке.
 */
export function ErrorMessage({ children, id }: ErrorMessageProps) {
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-red-700">
      {children}
    </p>
  )
}
