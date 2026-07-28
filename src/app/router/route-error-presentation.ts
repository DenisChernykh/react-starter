import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

/**
 * Данные для отображения ошибки маршрута пользователю.
 *
 * @remarks `retryable` управляет доступностью повторной валидации маршрута, а
 * `requestId` показывается для внутренних ошибок, которые можно передать в поддержку.
 */
export type ErrorPresentation = {
  message: string
  requestId?: string
  retryable: boolean
}

/**
 * Преобразует ошибку API в безопасное для пользователя представление.
 *
 * @returns Локализованное сообщение, идентификатор запроса при наличии и признак
 * возможности повторить загрузку маршрута.
 */
export function getRouteErrorPresentation(error: unknown): ErrorPresentation {
  if (error instanceof ApiNetworkError) {
    return {
      message: 'Не удалось подключиться к серверу.',
      retryable: true,
    }
  }
  if (error instanceof ApiProtocolError) {
    return {
      message: 'Сервер вернул некорректный ответ.',
      retryable: false,
    }
  }
  if (error instanceof ApiProblemError) {
    switch (error.code) {
      case 'AUTHORIZATION_DENIED':
        return { message: 'Недостаточно прав', retryable: false }
      case 'RATE_LIMIT_EXCEEDED':
        return {
          message: 'Слишком много запросов. Повторите попытку позже.',
          retryable: false,
        }
      case 'DEPENDENCY_UNAVAILABLE':
        return {
          message: 'Сервис временно недоступен.',
          retryable: true,
        }
      case 'INTERNAL_ERROR':
        return {
          message: 'Не удалось выполнить запрос.',
          requestId: error.requestId,
          retryable: true,
        }
    }
  }
  return {
    message: 'Произошла непредвиденная ошибка.',
    retryable: false,
  }
}
