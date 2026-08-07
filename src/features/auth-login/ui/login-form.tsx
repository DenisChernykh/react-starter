import { useState } from 'react'
import { Link } from 'react-router'

import {
  ApiProblemError,
  authLoginSchema,
  type LoginRequestDto,
} from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import {
  Alert,
  AlertDescription,
  Button,
  PasswordField,
  TextField,
} from '@/shared/ui'
import {
  forgotPasswordPath,
  registerPath,
  resendEmailVerificationPath,
} from '@/shared/routes'

import {
  getLoginFormError,
  mapLoginValidationErrors,
} from '../model/login-errors'
import { useLogin } from '../model/use-login'

type LoginFormProps = {
  returnTo: string | null
}

/**
 * Отображает форму входа с обработкой ошибок API и валидации.
 *
 * @remarks Использует React Hook Form и Zod для клиентской проверки. Ошибки
 * `VALIDATION_FAILED` сопоставляет с полями формы, остальные показывает как общую
 * ошибку mutation из `useLogin`.
 */
export function LoginForm({ returnTo }: LoginFormProps) {
  const login = useLogin(returnTo)
  const [formError, setFormError] = useState<string | null>(null)
  const [verificationRequired, setVerificationRequired] = useState(false)
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useZodForm(authLoginSchema)
  const emailError = errors.email?.message
  const passwordError = errors.password?.message

  const submit = handleSubmit(async (credentials) => {
    setFormError(null)
    setVerificationRequired(false)
    try {
      await login.mutateAsync(credentials)
    } catch (error) {
      if (
        error instanceof ApiProblemError &&
        error.code === 'VALIDATION_FAILED'
      ) {
        const fieldErrors = mapLoginValidationErrors(error.problem)
        for (const [field, message] of Object.entries(fieldErrors)) {
          setError(field as keyof LoginRequestDto, {
            type: 'server',
            message,
          })
        }
        if (Object.keys(fieldErrors).length > 0) return
      }
      if (
        error instanceof ApiProblemError &&
        error.code === 'EMAIL_VERIFICATION_REQUIRED'
      ) {
        setVerificationRequired(true)
      }
      setFormError(getLoginFormError(error))
    }
  })

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={emailError}
        {...register('email')}
      />

      <PasswordField
        label="Пароль"
        autoComplete="current-password"
        error={passwordError}
        {...register('password')}
      />

      {formError !== null && formError.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {verificationRequired && (
        <Link
          className="block text-sm text-primary underline-offset-4 hover:underline"
          to={resendEmailVerificationPath}
        >
          Запросить новое письмо
        </Link>
      )}

      <Button
        type="submit"
        className="w-full"
        isLoading={login.isPending}
        loadingLabel="Входим"
      >
        Войти
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
          to={forgotPasswordPath}
        >
          Забыли пароль?
        </Link>
      </p>
    </form>
  )
}
