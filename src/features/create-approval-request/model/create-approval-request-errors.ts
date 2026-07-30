import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

/** Поля формы создания запроса, для которых API поддерживает ошибки валидации. */
export type CreateApprovalRequestField = 'title' | 'description'

/** Проверенное Problem Details-представление ошибок полей формы. */
type ValidationProblem = {
  errors?: ReadonlyArray<{
    pointer: string
    code: string
    detail: string
  }>
}

const fieldByPointer: Readonly<Record<string, CreateApprovalRequestField>> = {
  '/title': 'title',
  '/description': 'description',
}

/**
 * Сопоставляет поддерживаемые pointer-ошибки API с полями формы создания запроса.
 *
 * @remarks Использует только первые ошибки `/title` и `/description`. Неизвестные
 * pointers игнорируются, поэтому их server detail не попадает в интерфейс.
 */
export function mapCreateApprovalRequestValidationErrors(
  problem: ValidationProblem,
): Partial<Record<CreateApprovalRequestField, string>> {
  const result: Partial<Record<CreateApprovalRequestField, string>> = {}
  for (const error of problem.errors ?? []) {
    const field = fieldByPointer[error.pointer]
    if (field !== undefined && result[field] === undefined) {
      result[field] = error.detail
    }
  }
  return result
}

/**
 * Возвращает безопасное для формы сообщение об ошибке создания запроса.
 *
 * @remarks Не показывает `problem.detail`. Для неизвестного Problem Details
 * сохраняет только `requestId`, пригодный для диагностики без раскрытия данных API.
 *
 * @returns Русскоязычный текст, допустимый для отображения пользователю.
 */
export function getCreateApprovalRequestError(error: unknown): string {
  if (
    error instanceof ApiProblemError &&
    error.code === 'DEPENDENCY_UNAVAILABLE'
  ) {
    return 'Сервис временно недоступен.'
  }
  if (error instanceof ApiNetworkError) {
    return 'Не удалось подключиться к серверу.'
  }
  if (error instanceof ApiProtocolError) {
    return 'Сервер вернул некорректный ответ.'
  }
  if (error instanceof ApiProblemError) {
    return `Не удалось создать запрос. Код запроса: ${error.requestId}`
  }
  return 'Не удалось создать запрос.'
}
