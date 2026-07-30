import { describe, expect, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  type ProblemCode,
} from '@/shared/api'

import { getApprovalDecisionError } from './decision-errors'

function problem(code: ProblemCode, requestId = 'request-123') {
  return new ApiProblemError(
    {
      type: `https://example.test/problems/${code.toLowerCase()}`,
      title: 'Текст сервера не используется в UI',
      status: 409,
      detail: 'Сырой detail сервера нельзя показывать пользователю',
      instance: `urn:request:${requestId}`,
      code,
      requestId,
    },
    null,
  )
}

describe('getApprovalDecisionError', () => {
  it.each([
    [
      problem('APPROVAL_REQUEST_ALREADY_DECIDED'),
      'Запрос уже обработан. Данные обновлены.',
    ],
    [
      problem('APPROVAL_SELF_DECISION_FORBIDDEN'),
      'Нельзя принять решение по собственному запросу.',
    ],
    [
      problem('APPROVAL_REQUEST_NOT_FOUND'),
      'Запрос недоступен или не существует.',
    ],
    [
      problem('AUTHORIZATION_DENIED'),
      'Недостаточно прав для принятия решения.',
    ],
    [problem('DEPENDENCY_UNAVAILABLE'), 'Сервис временно недоступен.'],
    [new ApiNetworkError(), 'Не удалось подключиться к серверу.'],
    [new ApiProtocolError(), 'Сервер вернул некорректный ответ.'],
    [
      problem('CONFLICT', 'request-409'),
      'Не удалось сохранить решение. Код запроса: request-409',
    ],
    [new Error('unknown'), 'Не удалось сохранить решение.'],
  ])('returns safe copy for a decision failure', (error, expected) => {
    expect(getApprovalDecisionError(error)).toBe(expected)
  })

  it('never returns raw problem detail', () => {
    expect(getApprovalDecisionError(problem('INTERNAL_ERROR'))).not.toContain(
      'Сырой detail сервера нельзя показывать пользователю',
    )
  })
})
