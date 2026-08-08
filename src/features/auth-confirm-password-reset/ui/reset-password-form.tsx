import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  authConfirmPasswordResetSchema,
  type ConfirmPasswordResetRequestDto,
} from '@/shared/api'
import { clearCurrentSession } from '@/entities/session'
import { useZodForm } from '@/shared/lib/form'
import { useConsumedFragmentParameter } from '@/shared/lib/hooks'
import { forgotPasswordPath, loginPath } from '@/shared/routes'
import { Alert, AlertDescription, Button, PasswordField } from '@/shared/ui'
import { useQueryClient } from '@tanstack/react-query'

import { useConfirmPasswordReset } from '../model/use-confirm-password-reset'

const resetFormSchema = authConfirmPasswordResetSchema
  .pick({ newPassword: true })
  .extend({ passwordConfirmation: z.string().min(1, 'Повторите пароль') })
  .refine((value) => value.newPassword === value.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Пароли не совпадают',
  })
const resetTokenSchema = authConfirmPasswordResetSchema.pick({ token: true })

function getResetError(error: unknown) {
  if (error instanceof ApiProblemError && error.code === 'VALIDATION_FAILED')
    return 'Проверьте введённые данные.'
  if (error instanceof ApiProblemError && error.code === 'RATE_LIMIT_EXCEEDED')
    return 'Слишком много запросов. Повторите попытку позже.'
  if (
    error instanceof ApiProblemError &&
    error.code === 'DEPENDENCY_UNAVAILABLE'
  )
    return 'Сервис временно недоступен.'
  if (error instanceof ApiProblemError && error.code === 'NOT_FOUND')
    return 'Регистрация и восстановление сейчас недоступны.'
  if (error instanceof ApiNetworkError)
    return 'Не удалось подключиться к серверу.'
  if (error instanceof ApiProtocolError)
    return 'Сервер вернул некорректный ответ.'
  if (error instanceof ApiProblemError)
    return `Не удалось изменить пароль. Код запроса: ${error.requestId}`
  return 'Не удалось изменить пароль.'
}

export function ResetPasswordForm() {
  const token = useConsumedFragmentParameter('token')
  const location = useLocation()
  const queryClient = useQueryClient()
  const resetPassword = useConfirmPasswordReset()
  const isSubmitInFlight = useRef(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [rejectedToken, setRejectedToken] = useState<string | null>(null)
  const validToken = resetTokenSchema.safeParse({ token }).success
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useZodForm(resetFormSchema, {
    defaultValues: {
      newPassword: '',
      passwordConfirmation: '',
    },
  })

  if (!validToken || rejectedToken === token) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Ссылка недействительна или устарела
          </AlertDescription>
        </Alert>
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={forgotPasswordPath}
        >
          Запросить новую ссылку
        </Link>
      </div>
    )
  }
  if (success)
    return (
      <div className="space-y-4">
        <p>Пароль изменён</p>
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={loginPath}
        >
          Войти
        </Link>
      </div>
    )

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (isSubmitInFlight.current) {
      event.preventDefault()
      return
    }
    isSubmitInFlight.current = true
    void handleSubmit(async (values) => {
      setFormError(null)
      const body: ConfirmPasswordResetRequestDto = {
        token: token as string,
        newPassword: values.newPassword,
      }
      try {
        await resetPassword.execute(body)
        clearCurrentSession(queryClient)
        reset()
        setSuccess(true)
      } catch (error) {
        if (
          error instanceof ApiProblemError &&
          error.code === 'AUTH_TOKEN_INVALID_OR_EXPIRED'
        ) {
          setRejectedToken(token)
          return
        }
        if (
          error instanceof ApiProblemError &&
          error.code === 'VALIDATION_FAILED'
        ) {
          const field = (
            error.problem.errors as
              ReadonlyArray<{ pointer: string; detail: string }> | undefined
          )?.find((item) => item.pointer === '/newPassword')
          if (field !== undefined) {
            setError('newPassword', { type: 'server', message: field.detail })
            return
          }
        }
        setFormError(getResetError(error))
      }
    })(event).finally(() => {
      isSubmitInFlight.current = false
    })
  }

  if (location.hash.length > 0)
    return <p aria-live="polite">Подготавливаем ссылку…</p>
  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <PasswordField
        label="Новый пароль"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <PasswordField
        label="Повторите пароль"
        autoComplete="new-password"
        error={errors.passwordConfirmation?.message}
        {...register('passwordConfirmation')}
      />
      {formError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        className="w-full"
        isLoading={resetPassword.isPending}
        loadingLabel="Изменяем пароль"
      >
        Изменить пароль
      </Button>
    </form>
  )
}
