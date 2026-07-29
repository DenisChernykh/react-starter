import type {
  ApprovalRequestResponseDto,
  ApprovalRequestResponseDtoStatus,
  CurrentUserResponseDto,
} from '@/shared/api'

/** Описывает русскую подпись и вариант Badge для статуса запроса. */
export type ApprovalRequestStatusPresentation = {
  label: string
  variant: 'default' | 'secondary' | 'destructive'
}

/** Описывает, может ли текущий пользователь принять решение по запросу. */
export type ApprovalDecisionAvailability =
  'available' | 'terminal' | 'own-request' | 'missing-permission'

const approvalRequestStatusPresentations: Record<
  ApprovalRequestResponseDtoStatus,
  ApprovalRequestStatusPresentation
> = {
  pending: {
    label: 'Ожидает решения',
    variant: 'secondary',
  },
  approved: {
    label: 'Одобрен',
    variant: 'default',
  },
  rejected: {
    label: 'Отклонён',
    variant: 'destructive',
  },
}

const defaultApprovalRequestDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Возвращает русское представление статуса запроса согласования.
 *
 * @returns Неизменяемый UI-контракт с подписью и допустимым вариантом `Badge`.
 */
export function getApprovalRequestStatusPresentation(
  status: ApprovalRequestResponseDtoStatus,
): ApprovalRequestStatusPresentation {
  return approvalRequestStatusPresentations[status]
}

/**
 * Форматирует дату запроса в локали `ru-RU`.
 *
 * @remarks В обычном runtime переиспользует модульный formatter. Явный `timeZone`
 * создаёт отдельный formatter для детерминированного отображения в тестах или UI.
 */
export function formatApprovalRequestDate(
  value: string,
  timeZone?: string,
): string {
  if (timeZone === undefined) {
    return defaultApprovalRequestDateFormatter.format(new Date(value))
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}

/**
 * Определяет доступность решения для текущего пользователя.
 *
 * @remarks Сначала скрывает action у terminal request, затем у автора и только
 * после этого проверяет `approval.requests.decide`; такой порядок не раскрывает
 * permission-dependent action для завершённого запроса.
 */
export function getApprovalDecisionAvailability(
  request: ApprovalRequestResponseDto,
  currentUser: CurrentUserResponseDto,
): ApprovalDecisionAvailability {
  if (request.status !== 'pending') return 'terminal'
  if (request.createdByUserId === currentUser.userId) return 'own-request'
  if (!currentUser.permissions.includes('approval.requests.decide')) {
    return 'missing-permission'
  }
  return 'available'
}
