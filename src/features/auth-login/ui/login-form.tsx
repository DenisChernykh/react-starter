import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  ApiProblemError,
  authLoginSchema,
  type LoginRequestDto,
} from '@/shared/api'
import { ErrorMessage } from '@/shared/ui'

import {
  getLoginFormError,
  mapLoginValidationErrors,
} from '../model/login-errors'
import { useLogin } from '../model/use-login'

type LoginFormProps = {
  returnTo: string | null
}

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
    <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          {...register('email')}
        />
        {errors.email?.message ? (
          <ErrorMessage id="email-error">{errors.email.message}</ErrorMessage>
        ) : null}
      </div>

      <div>
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password !== undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          {...register('password')}
        />
        {errors.password?.message ? (
          <ErrorMessage id="password-error">
            {errors.password.message}
          </ErrorMessage>
        ) : null}
      </div>

      {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}

      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-md bg-zinc-950 px-4 py-2 text-white disabled:opacity-50"
      >
        {login.isPending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  )
}
