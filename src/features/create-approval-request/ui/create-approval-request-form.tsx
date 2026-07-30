import { type FormEvent, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'

import {
  ApiProblemError,
  approvalRequestCreateSchema,
  type CreateApprovalRequestDto,
} from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import {
  Alert,
  AlertDescription,
  Button,
  TextareaField,
  TextField,
} from '@/shared/ui'

import {
  getCreateApprovalRequestError,
  mapCreateApprovalRequestValidationErrors,
} from '../model/create-approval-request-errors'
import { useCreateApprovalRequest } from '../model/use-create-approval-request'

/**
 * Отображает форму создания запроса согласования с безопасной обработкой ошибок API.
 *
 * @remarks Требует React Router и `QueryClientProvider`. Проверяет поля generated
 * Zod schema, записывает поддерживаемые server validation errors в поля, а при
 * `AUTHENTICATION_REQUIRED` запускает revalidation protected router без показа
 * устаревшей business-ошибки. Синхронный ref блокирует повторный submit до
 * rerender и освобождается в `finally` для каждого исхода mutation. Успешную
 * запись и навигацию выполняет mutation hook.
 */
export function CreateApprovalRequestForm() {
  const createApprovalRequest = useCreateApprovalRequest()
  const revalidator = useRevalidator()
  const isSubmitInFlight = useRef(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useZodForm(approvalRequestCreateSchema)
  const titleError = errors.title?.message
  const descriptionError = errors.description?.message
  const hasFormError = formError !== null && formError.length > 0

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (isSubmitInFlight.current) {
      event.preventDefault()
      return
    }
    isSubmitInFlight.current = true
    void handleSubmit(async (request) => {
      setFormError(null)
      try {
        await createApprovalRequest.mutateAsync(request)
      } catch (error) {
        if (
          error instanceof ApiProblemError &&
          error.code === 'AUTHENTICATION_REQUIRED'
        ) {
          void revalidator.revalidate()
          return
        }
        if (
          error instanceof ApiProblemError &&
          error.code === 'VALIDATION_FAILED'
        ) {
          const fieldErrors = mapCreateApprovalRequestValidationErrors(
            error.problem,
          )
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof CreateApprovalRequestDto, {
              type: 'server',
              message,
            })
          }
          if (Object.keys(fieldErrors).length > 0) return
        }
        setFormError(getCreateApprovalRequestError(error))
      }
    })(event).finally(() => {
      isSubmitInFlight.current = false
    })
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <TextField label="Название" error={titleError} {...register('title')} />

      <TextareaField
        label="Описание"
        rows={5}
        error={descriptionError}
        {...register('description')}
      />

      {hasFormError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full"
        isLoading={createApprovalRequest.isPending}
        loadingLabel="Создаём запрос"
      >
        Создать запрос
      </Button>
    </form>
  )
}
