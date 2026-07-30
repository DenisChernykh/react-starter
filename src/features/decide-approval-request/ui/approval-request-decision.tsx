import { useRef, useState } from 'react'

import { getApprovalDecisionAvailability } from '@/entities/approval-request'
import {
  isProblemCode,
  type ApprovalRequestResponseDto,
  type CurrentUserResponseDto,
  type DecideApprovalRequestDtoDecision,
} from '@/shared/api'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@/shared/ui'

import { getApprovalDecisionError } from '../model/decision-errors'
import { useDecideApprovalRequest } from '../model/use-decide-approval-request'

type ApprovalRequestDecisionProps = {
  request: ApprovalRequestResponseDto
  currentUser: CurrentUserResponseDto
}

type DecisionCopy = Readonly<{
  title: string
  action: string
  loadingLabel: string
}>

type DecisionDialogProps = Readonly<{
  request: ApprovalRequestResponseDto
  decision: DecideApprovalRequestDtoDecision
  mutation: ReturnType<typeof useDecideApprovalRequest>
  confirmDecision: (
    decision: DecideApprovalRequestDtoDecision,
  ) => Promise<boolean>
}>

const decisionCopyByValue: Readonly<
  Record<DecideApprovalRequestDtoDecision, DecisionCopy>
> = Object.freeze({
  approved: Object.freeze({
    title: 'Одобрить запрос?',
    action: 'Одобрить',
    loadingLabel: 'Одобряем запрос',
  }),
  rejected: Object.freeze({
    title: 'Отклонить запрос?',
    action: 'Отклонить',
    loadingLabel: 'Отклоняем запрос',
  }),
})

/**
 * Отображает контролируемый диалог подтверждения одного решения.
 *
 * @remarks Использует настоящий `AlertDialogTrigger`, чтобы Base UI возвращал
 * фокус к точной кнопке после отмены. Пока mutation pending, игнорирует close,
 * отключает отмену и оставляет диалог открытым после безопасно обработанной ошибки.
 */
function DecisionDialog({
  request,
  decision,
  mutation,
  confirmDecision,
}: DecisionDialogProps) {
  const [open, setOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const copy = decisionCopyByValue[decision]
  const hasError = errorMessage !== null && errorMessage.length > 0

  const handleOpenChange = (nextOpen: boolean) => {
    if (mutation.isPending) return
    if (nextOpen) {
      mutation.reset()
      setErrorMessage(null)
    }
    setOpen(nextOpen)
  }

  const confirm = async () => {
    setErrorMessage(null)
    try {
      const confirmed = await confirmDecision(decision)
      if (confirmed) setOpen(false)
    } catch (error) {
      setErrorMessage(getApprovalDecisionError(error))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button
            variant={decision === 'rejected' ? 'destructive' : 'default'}
          />
        }
      >
        {copy.action}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription className="min-w-0 [overflow-wrap:anywhere]">
            «{request.title}». Решение нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction
            isLoading={mutation.isPending}
            loadingLabel={copy.loadingLabel}
            onClick={confirm}
          >
            {copy.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Отображает доступные текущему пользователю действия решения по запросу.
 *
 * @remarks Требует React Query и React Router providers. Перемонтирует private
 * body при смене `request.id`, поэтому pending mutation, dialog state и error
 * одного запроса не влияют на другой. Доступность вычисляется один раз через
 * entity policy; mutation не меняет status optimistically. После terminal-refetch
 * показывает conflict-alert только для предыдущей ошибки
 * `APPROVAL_REQUEST_ALREADY_DECIDED` этого же запроса.
 */
export function ApprovalRequestDecision({
  request,
  currentUser,
}: ApprovalRequestDecisionProps) {
  return (
    <ApprovalRequestDecisionBody
      key={request.id}
      request={request}
      currentUser={currentUser}
    />
  )
}

/**
 * Владеет mutation и синхронной блокировкой подтверждения одного запроса.
 *
 * @remarks Перемонтируется с ключом `request.id`, чтобы mutation callbacks
 * сохраняли identity исходного запроса. Один ref разделён между обоими
 * `DecisionDialog` и блокирует повторный или противоположный confirm до того,
 * как React Query успеет отрендерить `isPending`.
 */
function ApprovalRequestDecisionBody({
  request,
  currentUser,
}: ApprovalRequestDecisionProps) {
  const decisionMutation = useDecideApprovalRequest(request.id)
  const confirmationLock = useRef(false)
  const availability = getApprovalDecisionAvailability(request, currentUser)

  const confirmDecision = async (
    decision: DecideApprovalRequestDtoDecision,
  ) => {
    if (confirmationLock.current) return false

    confirmationLock.current = true
    try {
      await decisionMutation.mutateAsync(decision)
      return true
    } finally {
      confirmationLock.current = false
    }
  }

  switch (availability) {
    case 'available':
      return (
        <div className="flex flex-wrap gap-2">
          <DecisionDialog
            request={request}
            decision="approved"
            mutation={decisionMutation}
            confirmDecision={confirmDecision}
          />
          <DecisionDialog
            request={request}
            decision="rejected"
            mutation={decisionMutation}
            confirmDecision={confirmDecision}
          />
        </div>
      )
    case 'own-request':
      return <p>Собственный запрос должен одобрить другой пользователь.</p>
    case 'missing-permission':
      return <p>У вас нет права принимать решение по этому запросу.</p>
    case 'terminal': {
      const hasAlreadyDecidedError = isProblemCode(
        decisionMutation.error,
        'APPROVAL_REQUEST_ALREADY_DECIDED',
      )

      return (
        hasAlreadyDecidedError && (
          <Alert variant="destructive">
            <AlertDescription>
              Запрос уже обработан. Данные обновлены.
            </AlertDescription>
          </Alert>
        )
      )
    }
  }

  const exhaustiveAvailability: never = availability
  return exhaustiveAvailability
}
