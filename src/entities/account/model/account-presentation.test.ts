import { describe, expect, it } from 'vitest'

import type {
  AdminAccountResponseDto,
  CurrentUserResponseDto,
} from '@/shared/api'

import {
  getAccountActionAvailability,
  getAccountStatePresentation,
} from './account-presentation'

const account = {
  createdAt: '2026-08-08T08:00:00.000Z',
  email: 'member@example.test',
  emailVerifiedAt: '2026-08-08T08:00:00.000Z',
  id: 'c9c6cbca-47e6-4ab0-932e-30f7a0e97184',
  retiredAt: null,
  revision: 2,
  roleKeys: ['approval.reviewer'],
  state: 'active',
  updatedAt: '2026-08-08T09:00:00.000Z',
} satisfies AdminAccountResponseDto

const administrator = {
  normalizedEmail: 'admin@example.test',
  permissions: ['auth.accounts.manage', 'auth.accounts.roles.manage'],
  roleKeys: ['system.admin'],
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
} satisfies CurrentUserResponseDto

describe('admin account presentation', () => {
  it('presents every durable account state safely', () => {
    expect(getAccountStatePresentation('invited')).toEqual({
      label: 'Приглашён',
      variant: 'secondary',
    })
    expect(getAccountStatePresentation('retired')).toEqual({
      label: 'Архивирован',
      variant: 'outline',
    })
  })

  it('allows every administrator action only for an eligible non-self account', () => {
    expect(getAccountActionAvailability(account, administrator)).toEqual({
      canLogoutAll: true,
      canReplaceRoles: true,
      canRequestPasswordReset: true,
      canRetire: true,
      canResendInvitation: false,
      canUpdateStatus: true,
    })
  })

  it('never exposes self-mutations even when the session has permissions', () => {
    expect(
      getAccountActionAvailability(
        { ...account, id: administrator.userId },
        administrator,
      ),
    ).toEqual({
      canLogoutAll: false,
      canReplaceRoles: false,
      canRequestPasswordReset: false,
      canRetire: false,
      canResendInvitation: false,
      canUpdateStatus: false,
    })
  })

  it('limits invitation and password actions to their server-eligible states', () => {
    expect(
      getAccountActionAvailability(
        { ...account, emailVerifiedAt: null, state: 'invited' },
        administrator,
      ),
    ).toMatchObject({
      canRequestPasswordReset: false,
      canResendInvitation: true,
      canUpdateStatus: false,
    })
  })
})
