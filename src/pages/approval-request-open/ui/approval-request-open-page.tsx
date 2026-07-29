import { Link } from 'react-router'

import { OpenApprovalRequestForm } from '@/features/open-approval-request'
import { approvalRequestsPath } from '@/shared/routes'

/**
 * Собирает маршрут открытия запроса из heading, обратной ссылки и feature-формы.
 *
 * @remarks Не дублирует UUID validation или navigation feature: ими владеет
 * `OpenApprovalRequestForm`.
 */
export function ApprovalRequestOpenPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          className="text-sm text-primary underline-offset-4 hover:underline"
          to={approvalRequestsPath}
        >
          К согласованию
        </Link>
        <h1 className="text-2xl font-semibold">Открыть запрос</h1>
        <p className="text-muted-foreground">
          Введите идентификатор существующего запроса согласования.
        </p>
      </header>
      <OpenApprovalRequestForm />
    </section>
  )
}
