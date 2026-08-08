import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRevalidator } from 'react-router'

import {
  accountDetailSnapshotFromResponse,
  getAccountActionAvailability,
  getRoleCatalogErrorMessage,
  invalidateAdminAccountLists,
  removeAdminAccount,
  refreshAdminAccount,
  refreshAdminRoleCatalog,
  setAdminAccount,
  type AccountDetailSnapshot,
  useAdminRoleCatalog,
} from '@/entities/account'
import {
  adminAuthLogoutAll,
  adminAuthReplaceAccountRoles,
  adminAuthRequestPasswordReset,
  adminAuthResendAccountInvitation,
  adminAuthRetireAccount,
  adminAuthUpdateAccountStatus,
  ApiProblemError,
  ApiProtocolError,
  isProblemCode,
  type CurrentUserResponseDto,
} from '@/shared/api'
import { Alert, AlertDescription, Button } from '@/shared/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui'
import { adminAccountsPath } from '@/shared/routes'

type AccountActionsProps = Readonly<{
  currentUser: CurrentUserResponseDto
  snapshot: AccountDetailSnapshot
}>

type AccountActionsContentProps = AccountActionsProps &
  Readonly<{
    message: string | null
    setMessage: (message: string | null) => void
  }>

function getActionError(error: unknown): string {
  if (
    error instanceof ApiProblemError &&
    error.code === 'AUTH_ACCOUNT_PRECONDITION_FAILED'
  )
    return 'Данные аккаунта изменились. Они обновлены.'
  if (error instanceof ApiProblemError && error.code === 'CONFLICT')
    return 'Действие недоступно для текущего состояния аккаунта.'
  if (error instanceof ApiProblemError)
    return `Не удалось выполнить действие. Код запроса: ${error.requestId}`
  return 'Не удалось выполнить действие.'
}

function getDeliveryMessage(mailDelivery: 'delivered' | 'failed'): string {
  return mailDelivery === 'delivered'
    ? 'Письмо отправлено.'
    : 'Данные сохранены, но письмо не отправлено. Повторите действие после восстановления SMTP.'
}

export function AccountActions({ currentUser, snapshot }: AccountActionsProps) {
  const [message, setMessage] = useState<string | null>(null)
  return (
    <AccountActionsContent
      key={`${snapshot.account.id}:${snapshot.account.revision}`}
      currentUser={currentUser}
      snapshot={snapshot}
      message={message}
      setMessage={setMessage}
    />
  )
}

function AccountActionsContent({
  currentUser,
  message,
  setMessage,
  snapshot,
}: AccountActionsContentProps) {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  const availability = getAccountActionAvailability(
    snapshot.account,
    currentUser,
  )
  const roleCatalog = useAdminRoleCatalog(availability.canReplaceRoles)
  const [selectedRoles, setSelectedRoles] = useState<readonly string[]>(
    snapshot.account.roleKeys,
  )
  const recoverFromMutationError = async (
    error: unknown,
    refreshRoles = false,
  ) => {
    if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
      await revalidator.revalidate()
      return
    }
    if (error instanceof ApiProtocolError) {
      let refreshed = false
      try {
        await refreshAdminAccount(queryClient, snapshot.account.id)
        refreshed = true
      } catch {
        removeAdminAccount(queryClient, snapshot.account.id)
      }
      await invalidateAdminAccountLists(queryClient)
      setMessage(
        refreshed
          ? 'Сервер вернул некорректный ответ. Данные аккаунта перечитаны.'
          : 'Сервер вернул некорректный ответ. Актуальные данные аккаунта получить не удалось.',
      )
      return
    }
    const refreshAccount =
      isProblemCode(error, 'AUTH_ACCOUNT_PRECONDITION_FAILED') ||
      isProblemCode(error, 'AUTH_ACCOUNT_PRECONDITION_REQUIRED') ||
      isProblemCode(error, 'AUTH_ACCOUNT_ETAG_MALFORMED') ||
      isProblemCode(error, 'CONFLICT') ||
      isProblemCode(error, 'NOT_FOUND')
    setMessage(getActionError(error))
    const accountRecovery = refreshAccount
      ? refreshAdminAccount(queryClient, snapshot.account.id)
      : Promise.resolve(undefined)
    const roleRecovery = refreshRoles
      ? refreshAdminRoleCatalog(queryClient)
      : Promise.resolve(undefined)
    const [, roleResult] = await Promise.allSettled([
      accountRecovery,
      roleRecovery,
    ])
    if (roleResult.status === 'fulfilled' && roleResult.value !== undefined) {
      const availableRoleKeys = new Set(
        roleResult.value.roles.map((role) => role.key),
      )
      setSelectedRoles((current) =>
        current.filter((roleKey) => availableRoleKeys.has(roleKey)),
      )
    }
  }
  const updateStatus = useMutation({
    mutationFn: (status: 'active' | 'disabled') =>
      adminAuthUpdateAccountStatus(
        { accountId: snapshot.account.id },
        { status },
        { headers: { 'If-Match': snapshot.etag } },
      ),
    onSuccess: async (response) => {
      setAdminAccount(
        queryClient,
        accountDetailSnapshotFromResponse(response, snapshot.account.id),
      )
      await invalidateAdminAccountLists(queryClient)
      setMessage('Аккаунт обновлён')
    },
    onError: (error) => recoverFromMutationError(error),
  })
  const replaceRoles = useMutation({
    mutationFn: () =>
      adminAuthReplaceAccountRoles(
        { accountId: snapshot.account.id },
        { roleKeys: [...selectedRoles] },
        { headers: { 'If-Match': snapshot.etag } },
      ),
    onSuccess: async (response) => {
      setAdminAccount(
        queryClient,
        accountDetailSnapshotFromResponse(response, snapshot.account.id),
      )
      await invalidateAdminAccountLists(queryClient)
      setMessage('Роли аккаунта обновлены')
    },
    onError: (error) =>
      recoverFromMutationError(error, isProblemCode(error, 'CONFLICT')),
  })
  const resendInvitation = useMutation({
    mutationFn: () =>
      adminAuthResendAccountInvitation({ accountId: snapshot.account.id }),
    onSuccess: (response) =>
      setMessage(getDeliveryMessage(response.mailDelivery)),
    onError: (error) => recoverFromMutationError(error),
  })
  const requestPasswordReset = useMutation({
    mutationFn: () =>
      adminAuthRequestPasswordReset({ accountId: snapshot.account.id }),
    onSuccess: (response) =>
      setMessage(getDeliveryMessage(response.mailDelivery)),
    onError: (error) => recoverFromMutationError(error),
  })
  const logoutAll = useMutation({
    mutationFn: () => adminAuthLogoutAll({ accountId: snapshot.account.id }),
    onSuccess: async () => {
      await refreshAdminAccount(queryClient, snapshot.account.id)
      await invalidateAdminAccountLists(queryClient)
      setMessage('Все сессии аккаунта отозваны')
    },
    onError: (error) => recoverFromMutationError(error),
  })
  const retire = useMutation({
    mutationFn: () =>
      adminAuthRetireAccount(
        { accountId: snapshot.account.id },
        { headers: { 'If-Match': snapshot.etag } },
      ),
    onSuccess: async () => {
      removeAdminAccount(queryClient, snapshot.account.id)
      await invalidateAdminAccountLists(queryClient)
      void navigate(adminAccountsPath)
    },
    onError: (error) => recoverFromMutationError(error),
  })

  const nextStatus = snapshot.account.state === 'active' ? 'disabled' : 'active'
  const actionLabel =
    nextStatus === 'disabled' ? 'Отключить аккаунт' : 'Активировать аккаунт'

  const toggleRole = (roleKey: string) => {
    setSelectedRoles((current) =>
      current.includes(roleKey)
        ? current.filter((value) => value !== roleKey)
        : [...current, roleKey],
    )
  }

  const hasActions = Object.values(availability).some(Boolean)
  if (!hasActions) return null

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Управление доступом</h2>
      <div className="flex flex-wrap gap-2">
        {availability.canUpdateStatus && (
          <Button
            type="button"
            variant={nextStatus === 'disabled' ? 'destructive' : 'default'}
            isLoading={updateStatus.isPending}
            loadingLabel="Обновляем аккаунт"
            onClick={() => updateStatus.mutate(nextStatus)}
          >
            {actionLabel}
          </Button>
        )}
        {availability.canResendInvitation && (
          <Button
            type="button"
            variant="outline"
            isLoading={resendInvitation.isPending}
            loadingLabel="Отправляем приглашение"
            onClick={() => resendInvitation.mutate()}
          >
            Отправить приглашение повторно
          </Button>
        )}
        {availability.canRequestPasswordReset && (
          <Button
            type="button"
            variant="outline"
            isLoading={requestPasswordReset.isPending}
            loadingLabel="Запрашиваем сброс"
            onClick={() => requestPasswordReset.mutate()}
          >
            Отправить сброс пароля
          </Button>
        )}
        {availability.canLogoutAll && (
          <Button
            type="button"
            variant="outline"
            isLoading={logoutAll.isPending}
            loadingLabel="Отзываем сессии"
            onClick={() => logoutAll.mutate()}
          >
            Завершить все сессии
          </Button>
        )}
      </div>
      {availability.canReplaceRoles && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="font-medium">Роли</h3>
          {roleCatalog.isPending ? (
            <p aria-live="polite">Загружаем роли…</p>
          ) : roleCatalog.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="space-y-2">
                <p>{getRoleCatalogErrorMessage(roleCatalog.error)}</p>
                <Button
                  type="button"
                  variant="outline"
                  isLoading={roleCatalog.isFetching}
                  loadingLabel="Загружаем роли"
                  onClick={() => void roleCatalog.refetch()}
                >
                  Повторить загрузку ролей
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roleCatalog.data?.roles.map((role) => (
                <Button
                  key={role.key}
                  type="button"
                  variant={
                    selectedRoles.includes(role.key) ? 'default' : 'outline'
                  }
                  aria-pressed={selectedRoles.includes(role.key)}
                  onClick={() => toggleRole(role.key)}
                >
                  {role.key}
                </Button>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={roleCatalog.isPending || roleCatalog.isError}
            isLoading={replaceRoles.isPending}
            loadingLabel="Обновляем роли"
            onClick={() => replaceRoles.mutate()}
          >
            Сохранить роли
          </Button>
        </div>
      )}
      {availability.canRetire && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Архивировать аккаунт
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Архивировать аккаунт?</AlertDialogTitle>
              <AlertDialogDescription>
                Доступ, роли, сессии и одноразовые токены будут удалены без
                возможности восстановления.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={retire.isPending}>
                Отмена
              </AlertDialogCancel>
              <AlertDialogAction
                isLoading={retire.isPending}
                loadingLabel="Архивируем аккаунт"
                onClick={() => retire.mutate()}
              >
                Архивировать
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {message !== null && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
