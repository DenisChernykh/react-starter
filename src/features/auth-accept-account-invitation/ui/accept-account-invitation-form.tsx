import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'

import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  authAcceptAccountInvitationSchema,
  type AcceptAccountInvitationRequestDto,
} from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import { useConsumedFragmentParameter } from '@/shared/lib/hooks'
import { loginPath } from '@/shared/routes'
import { Alert, AlertDescription, Button, PasswordField } from '@/shared/ui'

import { useAcceptAccountInvitation } from '../model/use-accept-account-invitation'

const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/u
const acceptInvitationFormSchema = authAcceptAccountInvitationSchema
  .pick({ password: true })
  .extend({ passwordConfirmation: z.string().min(1, 'Повторите пароль') })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Пароли не совпадают',
  })

function getAcceptInvitationError(error: unknown): string {
  if (
    error instanceof ApiProblemError &&
    error.code === 'AUTH_TOKEN_INVALID_OR_EXPIRED'
  )
    return 'Ссылка недействительна или устарела'
  if (error instanceof ApiProblemError && error.code === 'RATE_LIMIT_EXCEEDED')
    return 'Слишком много запросов. Повторите попытку позже.'
  if (
    error instanceof ApiProblemError &&
    error.code === 'DEPENDENCY_UNAVAILABLE'
  )
    return 'Сервис временно недоступен.'
  if (error instanceof ApiProblemError && error.code === 'NOT_FOUND')
    return 'Приглашения сейчас недоступны.'
  if (error instanceof ApiNetworkError)
    return 'Не удалось подключиться к серверу.'
  if (error instanceof ApiProtocolError)
    return 'Сервер вернул некорректный ответ.'
  if (error instanceof ApiProblemError)
    return `Не удалось принять приглашение. Код запроса: ${error.requestId}`
  return 'Не удалось принять приглашение.'
}

export function AcceptAccountInvitationForm() {
  const token = useConsumedFragmentParameter('token')
  const location = useLocation()
  const acceptInvitation = useAcceptAccountInvitation()
  const submissionLock = useRef(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const validToken =
    typeof token === 'string' && invitationTokenPattern.test(token)
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useZodForm(acceptInvitationFormSchema, {
    defaultValues: { password: '', passwordConfirmation: '' },
  })

  if (!validToken) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Ссылка недействительна или устарела</AlertDescription>
      </Alert>
    )
  }
  if (success) {
    return (
      <div className="space-y-4">
        <p>Аккаунт активирован</p>
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={loginPath}
        >
          Войти
        </Link>
      </div>
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (submissionLock.current) {
      event.preventDefault()
      return
    }
    submissionLock.current = true
    void handleSubmit(async (values) => {
      setFormError(null)
      try {
        const input: AcceptAccountInvitationRequestDto = {
          password: values.password,
          token,
        }
        await acceptInvitation.execute(input)
        reset()
        setSuccess(true)
      } catch (error) {
        if (
          error instanceof ApiProblemError &&
          error.code === 'VALIDATION_FAILED'
        ) {
          const passwordError = (
            error.problem.errors as
              ReadonlyArray<{ pointer: string; detail: string }> | undefined
          )?.find((item) => item.pointer === '/password')
          if (passwordError !== undefined) {
            setError('password', {
              type: 'server',
              message: passwordError.detail,
            })
            return
          }
        }
        setFormError(getAcceptInvitationError(error))
      }
    })(event).finally(() => {
      submissionLock.current = false
    })
  }

  if (location.hash.length > 0)
    return <p aria-live="polite">Подготавливаем приглашение…</p>

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <PasswordField
        label="Пароль"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
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
        isLoading={acceptInvitation.isPending}
        loadingLabel="Активируем аккаунт"
      >
        Принять приглашение
      </Button>
    </form>
  )
}
