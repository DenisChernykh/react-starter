import { describe, expect, it } from 'vitest'

import type {
  ApprovalRequestResponseDto,
  CurrentUserResponseDto,
} from '@/shared/api'
import { approvalRequestDetailsPath } from '@/shared/routes'

import {
  formatApprovalRequestDate,
  getApprovalDecisionAvailability,
  getApprovalRequestStatusPresentation,
} from './approval-request-presentation'

const pending = {
  createdAt: '2026-07-29T06:15:00.000Z',
  createdByUserId: 'author-1',
  decidedAt: null,
  decidedByUserId: null,
  description: 'Проверить договор',
  id: 'request-1',
  status: 'pending',
  title: 'Согласовать договор',
} satisfies ApprovalRequestResponseDto

const reviewer = {
  normalizedEmail: 'reviewer@example.com',
  permissions: ['approval.requests.decide'],
  roleKeys: ['reviewer'],
  userId: 'reviewer-1',
} satisfies CurrentUserResponseDto

const author = {
  ...reviewer,
  userId: pending.createdByUserId,
} satisfies CurrentUserResponseDto

const userWithoutPermission = {
  ...reviewer,
  permissions: [],
} satisfies CurrentUserResponseDto

describe('approval request presentation', () => {
  it.each([
    ['pending', 'Ожидает решения', 'secondary'],
    ['approved', 'Одобрен', 'default'],
    ['rejected', 'Отклонён', 'destructive'],
  ] as const)(
    'maps %s to a Russian badge contract',
    (status, label, variant) => {
      expect(getApprovalRequestStatusPresentation(status)).toEqual({
        label,
        variant,
      })
    },
  )

  it('prevents one caller from corrupting later status presentations', () => {
    const presentation = getApprovalRequestStatusPresentation('pending')

    Reflect.set(presentation, 'label', 'Повреждено')

    expect(getApprovalRequestStatusPresentation('pending')).toEqual({
      label: 'Ожидает решения',
      variant: 'secondary',
    })
  })

  it('formats a request date in Russian', () => {
    expect(formatApprovalRequestDate('2026-07-29T06:15:00.000Z', 'UTC')).toBe(
      '29.07.2026, 06:15',
    )
  })

  it('makes a pending request available to a reviewer', () => {
    expect(getApprovalDecisionAvailability(pending, reviewer)).toBe('available')
  })

  it('treats a terminal request as terminal before ownership and permissions', () => {
    expect(
      getApprovalDecisionAvailability(
        { ...pending, status: 'approved' },
        { ...author, permissions: [] },
      ),
    ).toBe('terminal')
  })

  it('prevents an author from deciding their own request', () => {
    expect(getApprovalDecisionAvailability(pending, author)).toBe('own-request')
  })

  it('requires decision permission after author check', () => {
    expect(
      getApprovalDecisionAvailability(pending, userWithoutPermission),
    ).toBe('missing-permission')
  })
})

describe('approval request routes', () => {
  it('encodes a caller-provided details segment', () => {
    expect(approvalRequestDetailsPath('id/with/slash')).toBe(
      '/approval-requests/id%2Fwith%2Fslash',
    )
  })
})
