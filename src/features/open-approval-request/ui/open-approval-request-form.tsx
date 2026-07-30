import { useNavigate } from 'react-router'

import { approvalRequestPathSchema } from '@/shared/api'
import { useZodForm } from '@/shared/lib/form'
import { approvalRequestDetailsPath } from '@/shared/routes'
import { Button, TextField } from '@/shared/ui'

/**
 * Отображает форму открытия запроса согласования по UUID.
 *
 * @remarks Требует React Router. Проверяет `requestId` generated Zod schema и
 * после успешной проверки только переходит на маршрут деталей; HTTP-запрос
 * выполняет владелец страницы деталей.
 */
export function OpenApprovalRequestForm() {
  const navigate = useNavigate()
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useZodForm(approvalRequestPathSchema)
  const requestIdError = errors.requestId?.message

  const submit = handleSubmit(({ requestId }) => {
    void navigate(approvalRequestDetailsPath(requestId))
  })

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <TextField
        label="ID запроса"
        error={requestIdError}
        {...register('requestId')}
      />

      <Button type="submit" className="w-full">
        Открыть запрос
      </Button>
    </form>
  )
}
