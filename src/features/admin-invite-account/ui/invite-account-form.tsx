import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRevalidator } from 'react-router'

import {
  getRoleCatalogErrorMessage,
  invalidateAdminAccountLists,
  refreshAdminRoleCatalog,
  useAdminRoleCatalog,
} from '@/entities/account'
import {
  adminAccountInvitationSchema,
  adminAuthCreateAccountInvitation,
  ApiProblemError,
  isProblemCode,
  type CreateAccountInvitationRequestDto,
} from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import { Alert, AlertDescription, Button, TextField } from '@/shared/ui'

import { mapInvitationValidationErrors } from '../model/invitation-errors'

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiProblemError) {
    return `Не удалось создать приглашение. Код запроса: ${error.requestId}`
  }
  return 'Не удалось создать приглашение.'
}

export function InviteAccountForm() {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()
  const roles = useAdminRoleCatalog()
  const [message, setMessage] = useState<string | null>(null)
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useZodForm(adminAccountInvitationSchema, {
    defaultValues: { email: '', roleKeys: [] },
  })
  const invitation = useMutation({
    mutationFn: (data: CreateAccountInvitationRequestDto) =>
      adminAuthCreateAccountInvitation(data),
    onSuccess: async (result) => {
      await invalidateAdminAccountLists(queryClient)
      reset()
      setMessage(
        result.mailDelivery === 'delivered'
          ? 'Приглашение создано, письмо отправлено.'
          : 'Приглашение создано, но письмо не отправлено. Повторите отправку после восстановления SMTP.',
      )
    },
    onError: async (error) => {
      if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
        await revalidator.revalidate()
        return
      }
      if (isProblemCode(error, 'VALIDATION_FAILED')) {
        const fieldErrors = mapInvitationValidationErrors(error.problem)
        for (const [field, message] of Object.entries(fieldErrors)) {
          setError(field as 'email' | 'roleKeys', {
            type: 'server',
            message,
          })
        }
        if (Object.keys(fieldErrors).length > 0) return
      }
      setMessage(getErrorMessage(error))
      if (isProblemCode(error, 'CONFLICT')) {
        try {
          const catalog = await refreshAdminRoleCatalog(queryClient)
          const availableRoleKeys = new Set(
            catalog.roles.map((role) => role.key),
          )
          setValue(
            'roleKeys',
            getValues('roleKeys').filter((roleKey) =>
              availableRoleKeys.has(roleKey),
            ),
          )
        } catch {
          // The query owns its recoverable error state and retry action.
        }
      }
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    void handleSubmit((values) => {
      setMessage(null)
      invitation.mutate(values)
    })(event)
  }
  const selectedRoles = watch('roleKeys', getValues('roleKeys'))

  return (
    <section className="space-y-4 border p-4">
      <div>
        <h2 className="font-semibold">Пригласить аккаунт</h2>
        <p className="text-sm text-muted-foreground">
          Письмо содержит одноразовую ссылку для установки пароля.
        </p>
      </div>
      <form className="space-y-4" noValidate onSubmit={submit}>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Роли</p>
          {roles.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="space-y-2">
                <p>{getRoleCatalogErrorMessage(roles.error)}</p>
                <Button
                  type="button"
                  variant="outline"
                  isLoading={roles.isFetching}
                  loadingLabel="Загружаем роли"
                  onClick={() => void roles.refetch()}
                >
                  Повторить загрузку ролей
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.data?.roles.map((role) => {
                const selected = selectedRoles.includes(role.key)
                return (
                  <Button
                    key={role.key}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    onClick={() =>
                      setValue(
                        'roleKeys',
                        selected
                          ? selectedRoles.filter((key) => key !== role.key)
                          : [...selectedRoles, role.key],
                        { shouldValidate: true },
                      )
                    }
                  >
                    {role.key}
                  </Button>
                )
              })}
            </div>
          )}
          {errors.roleKeys?.message && (
            <p className="text-sm text-destructive" role="alert">
              {errors.roleKeys.message}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={roles.isPending || roles.isError}
          isLoading={invitation.isPending}
          loadingLabel="Создаём приглашение"
        >
          Создать приглашение
        </Button>
      </form>
      {message !== null && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
