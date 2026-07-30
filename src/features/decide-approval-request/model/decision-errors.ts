import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

/**
 * Возвращает безопасное для UI сообщение об ошибке принятия решения.
 *
 * @remarks Не показывает `problem.detail`. Неизвестная Problem Details-ошибка
 * содержит только `requestId`, пригодный для диагностики без раскрытия ответа API.
 *
 * @returns Русскоязычный текст, допустимый для отображения пользователю.
 */
export function getApprovalDecisionError(error: unknown): string {
  if (error instanceof ApiProblemError) {
    switch (error.code) {
      case 'APPROVAL_REQUEST_ALREADY_DECIDED':
        return 'Запрос уже обработан. Данные обновлены.'
      case 'APPROVAL_SELF_DECISION_FORBIDDEN':
        return 'Нельзя принять решение по собственному запросу.'
      case 'APPROVAL_REQUEST_NOT_FOUND':
        return 'Запрос недоступен или не существует.'
      case 'AUTHORIZATION_DENIED':
        return 'Недостаточно прав для принятия решения.'
      case 'DEPENDENCY_UNAVAILABLE':
        return 'Сервис временно недоступен.'
      default:
        return `Не удалось сохранить решение. Код запроса: ${error.requestId}`
    }
  }
  if (error instanceof ApiNetworkError) {
    return 'Не удалось подключиться к серверу.'
  }
  if (error instanceof ApiProtocolError) {
    return 'Сервер вернул некорректный ответ.'
  }
  return 'Не удалось сохранить решение.'
}
