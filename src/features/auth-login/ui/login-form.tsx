import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  ApiProblemError,
  authLoginSchema,
  type LoginRequestDto,
} from '@/shared/api'
import {
  Alert,
  AlertDescription,
  Button,
  PasswordField,
  TextField,
} from '@/shared/ui'

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
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginRequestDto>({
    resolver: zodResolver(authLoginSchema),
  })
  const emailError = errors.email?.message
  const passwordError = errors.password?.message

  const submit = handleSubmit(async (credentials) => {
    setFormError(null)
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

      <Button
        type="submit"
        className="w-full"
        isLoading={login.isPending}
        loadingLabel="Входим"
      >
        Войти
      </Button>
    </form>
  )
}
