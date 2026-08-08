import type {
  AdminAccountResponseDto,
  AdminAccountResponseDtoState,
  CurrentUserResponseDto,
} from '@/shared/api'
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'

type AccountStatePresentation = Readonly<{
  label: string
  variant: 'default' | 'destructive' | 'outline' | 'secondary'
}>

type AccountActionAvailability = Readonly<{
  canLogoutAll: boolean
  canReplaceRoles: boolean
  canRequestPasswordReset: boolean
  canRetire: boolean
  canResendInvitation: boolean
  canUpdateStatus: boolean
}>

const statePresentation: Readonly<
  Record<AdminAccountResponseDtoState, AccountStatePresentation>
> = Object.freeze({
  active: Object.freeze({ label: 'Активен', variant: 'default' }),
  disabled: Object.freeze({ label: 'Отключён', variant: 'destructive' }),
  invited: Object.freeze({ label: 'Приглашён', variant: 'secondary' }),
  retired: Object.freeze({ label: 'Архивирован', variant: 'outline' }),
})

export function getAccountStatePresentation(
  state: AdminAccountResponseDtoState,
): AccountStatePresentation {
  return statePresentation[state]
}

export function getRoleCatalogErrorMessage(error: unknown): string {
  if (error instanceof ApiNetworkError)
    return 'Не удалось подключиться к серверу ролей.'
  if (error instanceof ApiProtocolError)
    return 'Сервер вернул некорректный каталог ролей.'
  if (error instanceof ApiProblemError) {
    return `Не удалось загрузить каталог ролей. Код запроса: ${error.requestId}`
  }
  return 'Не удалось загрузить каталог ролей.'
}

export function getAccountActionAvailability(
  account: AdminAccountResponseDto,
  currentUser: CurrentUserResponseDto,
): AccountActionAvailability {
  const isSelf = account.id.toLowerCase() === currentUser.userId.toLowerCase()
  const canManage =
    !isSelf && currentUser.permissions.includes('auth.accounts.manage')
  const canManageRoles =
    !isSelf && currentUser.permissions.includes('auth.accounts.roles.manage')
  const isActiveOrDisabled =
    account.state === 'active' || account.state === 'disabled'

  return {
    canLogoutAll: canManage && isActiveOrDisabled,
    canReplaceRoles: canManageRoles && account.state !== 'retired',
    canRequestPasswordReset:
      canManage &&
      account.state === 'active' &&
      account.emailVerifiedAt !== null,
    canRetire: canManage && account.state !== 'retired',
    canResendInvitation: canManage && account.state === 'invited',
    canUpdateStatus: canManage && isActiveOrDisabled,
  }
}
