import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'

import {
  ApiProblemError,
  authRegisterSchema,
  type RegisterUserRequestDto,
} from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import {
  forgotPasswordPath,
  loginPath,
  resendEmailVerificationPath,
} from '@/shared/routes'
import {
  Alert,
  AlertDescription,
  Button,
  PasswordField,
  TextField,
} from '@/shared/ui'

import {
  getRegisterFormError,
  mapRegisterValidationErrors,
} from '../model/register-errors'
import { useRegister } from '../model/use-register'

const registerFormSchema = authRegisterSchema
  .extend({ passwordConfirmation: z.string().min(1, 'Повторите пароль') })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Пароли не совпадают',
  })

export function RegisterForm() {
  const registration = useRegister()
  const isSubmitInFlight = useRef(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useZodForm(registerFormSchema)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (isSubmitInFlight.current) {
      event.preventDefault()
      return
    }
    isSubmitInFlight.current = true
    void handleSubmit(async (values) => {
      setFormError(null)
      const credentials: RegisterUserRequestDto = {
        email: values.email,
        password: values.password,
      }
      try {
        await registration.execute(credentials)
        reset()
        setSuccess(true)
      } catch (error) {
        if (
          error instanceof ApiProblemError &&
          error.code === 'VALIDATION_FAILED'
        ) {
          const fieldErrors = mapRegisterValidationErrors(error.problem)
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as 'email' | 'password', {
              type: 'server',
              message,
            })
          }
          if (Object.keys(fieldErrors).length > 0) return
        }
        setFormError(getRegisterFormError(error))
      }
    })(event).finally(() => {
      isSubmitInFlight.current = false
    })
  }

  if (success) {
    return (
      <div className="space-y-4">
        <p>
          Если регистрация доступна для этого адреса, письмо с подтверждением
          уже отправлено
        </p>
        <p className="flex flex-wrap gap-3 text-sm">
          <Link
            className="text-primary underline-offset-4 hover:underline"
            to={resendEmailVerificationPath}
          >
            Отправить письмо ещё раз
          </Link>
          <Link
            className="text-primary underline-offset-4 hover:underline"
            to={loginPath}
          >
            Войти
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
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
        isLoading={registration.isPending}
        loadingLabel="Создаём аккаунт"
      >
        Создать аккаунт
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{' '}
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={loginPath}
        >
          Войти
        </Link>
      </p>
      <Link
        className="block text-center text-sm text-primary underline-offset-4 hover:underline"
        to={forgotPasswordPath}
      >
        Забыли пароль?
      </Link>
    </form>
  )
}
