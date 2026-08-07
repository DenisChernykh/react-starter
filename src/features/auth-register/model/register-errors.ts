import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

export type RegisterField = 'email' | 'password'

type ValidationProblem = {
  errors?: ReadonlyArray<{ pointer: string; detail: string }>
}

const fieldByPointer: Readonly<Record<string, RegisterField>> = {
  '/email': 'email',
  '/password': 'password',
}

export function mapRegisterValidationErrors(problem: ValidationProblem) {
  const result: Partial<Record<RegisterField, string>> = {}
  for (const error of problem.errors ?? []) {
    const field = fieldByPointer[error.pointer]
    if (field !== undefined && result[field] === undefined)
      result[field] = error.detail
  }
  return result
}

export function getRegisterFormError(error: unknown) {
  if (
    error instanceof ApiProblemError &&
    error.code === 'RATE_LIMIT_EXCEEDED'
  ) {
    return 'Слишком много запросов. Повторите попытку позже.'
  }
  if (
    error instanceof ApiProblemError &&
    error.code === 'DEPENDENCY_UNAVAILABLE'
  ) {
    return 'Сервис временно недоступен.'
  }
  if (error instanceof ApiProblemError && error.code === 'NOT_FOUND') {
    return 'Регистрация и восстановление сейчас недоступны.'
  }
  if (error instanceof ApiNetworkError)
    return 'Не удалось подключиться к серверу.'
  if (error instanceof ApiProtocolError)
    return 'Сервер вернул некорректный ответ.'
  if (error instanceof ApiProblemError) {
    return `Не удалось создать аккаунт. Код запроса: ${error.requestId}`
  }
  return 'Не удалось создать аккаунт.'
}
