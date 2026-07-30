import { describe, expect, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

import {
  getCreateApprovalRequestError,
  mapCreateApprovalRequestValidationErrors,
} from './create-approval-request-errors'

describe('mapCreateApprovalRequestValidationErrors', () => {
  it('maps only supported request fields and ignores unknown pointers', () => {
    expect(
      mapCreateApprovalRequestValidationErrors({
        errors: [
          { pointer: '/title', code: 'too_small', detail: 'Введите название' },
          {
            pointer: '/description',
            code: 'too_small',
            detail: 'Введите описание',
          },
          { pointer: '/unknown', code: 'invalid', detail: 'Не показывать' },
        ],
      }),
    ).toEqual({
      title: 'Введите название',
      description: 'Введите описание',
    })
  })

  it('keeps the first error for every supported request field', () => {
    expect(
      mapCreateApprovalRequestValidationErrors({
        errors: [
          { pointer: '/title', code: 'too_small', detail: 'Первое название' },
          { pointer: '/title', code: 'invalid', detail: 'Второе название' },
        ],
      }),
    ).toEqual({ title: 'Первое название' })
  })
})

describe('getCreateApprovalRequestError', () => {
  it.each([
    [new ApiNetworkError(), 'Не удалось подключиться к серверу.'],
    [new ApiProtocolError(), 'Сервер вернул некорректный ответ.'],
    [
      new ApiProblemError(
        {
          type: 'https://example.test/problems/dependency-unavailable',
          title: 'Dependency unavailable',
          status: 503,
          detail: 'Не показывать пользователю',
          instance: 'urn:request:dependency-unavailable',
          code: 'DEPENDENCY_UNAVAILABLE',
          requestId: 'dependency-unavailable',
        },
        null,
      ),
      'Сервис временно недоступен.',
    ],
    [
      new ApiProblemError(
        {
          type: 'https://example.test/problems/conflict',
          title: 'Conflict',
          status: 409,
          detail: 'Не показывать пользователю',
          instance: 'urn:request:request-409',
          code: 'CONFLICT',
          requestId: 'request-409',
        },
        null,
      ),
      'Не удалось создать запрос. Код запроса: request-409',
    ],
  ])('returns safe form copy for API failures', (error, expected) => {
    expect(getCreateApprovalRequestError(error)).toBe(expected)
  })
})
