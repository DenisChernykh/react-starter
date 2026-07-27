import { describe, expect, it } from 'vitest'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

import { getLoginFormError, mapLoginValidationErrors } from './login-errors'

describe('mapLoginValidationErrors', () => {
  it('maps only known RFC 6901 login pointers', () => {
    expect(
      mapLoginValidationErrors({
        errors: [
          { pointer: '/email', code: 'invalid_email', detail: 'Email invalid' },
          {
            pointer: '/password',
            code: 'too_short',
            detail: 'Password invalid',
          },
          { pointer: '/role', code: 'forbidden', detail: 'Must be ignored' },
        ],
      }),
    ).toEqual({
      email: 'Email invalid',
      password: 'Password invalid',
    })
  })

  it.each([
    [new ApiNetworkError(), 'Не удалось подключиться к серверу.'],
    [new ApiProtocolError(), 'Сервер вернул некорректный ответ.'],
    [
      new ApiProblemError(
        {
          type: 'https://example.test/problem',
          title: 'Rate limited',
          status: 429,
          detail: 'Do not render this text',
          instance: 'urn:request:429',
          code: 'RATE_LIMIT_EXCEEDED',
          requestId: '429',
        },
        10_000,
      ),
      'Слишком много запросов. Повторите попытку позже.',
    ],
  ])('maps a transport error to safe form copy', (error, expected) => {
    expect(getLoginFormError(error)).toBe(expected)
  })
})
