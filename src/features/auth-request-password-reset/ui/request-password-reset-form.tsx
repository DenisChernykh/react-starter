import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiProblemError, authRequestPasswordResetSchema } from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import { loginPath, registerPath } from '@/shared/routes'
import { Alert, AlertDescription, Button, TextField } from '@/shared/ui'
import {
  getPasswordResetRequestError,
  mapPasswordResetRequestValidationErrors,
} from '../model/errors'
import { useRequestPasswordReset } from '../model/use-request-password-reset'

export function RequestPasswordResetForm() {
  const requestReset = useRequestPasswordReset()
  const isSubmitInFlight = useRef(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useZodForm(authRequestPasswordResetSchema)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (isSubmitInFlight.current) {
      event.preventDefault()
      return
    }
    isSubmitInFlight.current = true
    void handleSubmit(async (body) => {
      setFormError(null)
      try {
        await requestReset.mutateAsync(body)
        reset()
        setSuccess(true)
      } catch (error) {
        if (
          error instanceof ApiProblemError &&
          error.code === 'VALIDATION_FAILED'
        ) {
          const message = mapPasswordResetRequestValidationErrors(error.problem)
          if (message !== undefined) {
            setError('email', { type: 'server', message })
            return
          }
        }
        setFormError(getPasswordResetRequestError(error))
      }
    })(event).finally(() => {
      isSubmitInFlight.current = false
    })
  }
  if (success)
    return (
      <div className="space-y-4">
        <p>Если операция доступна для этого адреса, письмо уже отправлено</p>
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={loginPath}
        >
          Войти
        </Link>
      </div>
    )
  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      {formError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        className="w-full"
        isLoading={requestReset.isPending}
        loadingLabel="Отправляем"
      >
        Отправить письмо
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={registerPath}
        >
          Создать аккаунт
        </Link>
        {' · '}
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={loginPath}
        >
          Войти
        </Link>
      </p>
    </form>
  )
}
