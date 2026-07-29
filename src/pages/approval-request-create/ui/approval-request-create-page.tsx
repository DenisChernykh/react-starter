import { Link } from 'react-router'

import { CreateApprovalRequestForm } from '@/features/create-approval-request'
import { approvalRequestsPath } from '@/shared/routes'

/**
 * Собирает маршрут создания запроса из heading, обратной ссылки и feature-формы.
 *
 * @remarks Не владеет form state, validation или mutation: эти контракты
 * остаются в `CreateApprovalRequestForm`.
 */
export function ApprovalRequestCreatePage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          className="text-sm text-primary underline-offset-4 hover:underline"
          to={approvalRequestsPath}
        >
          К согласованию
        </Link>
        <h1 className="text-2xl font-semibold">Создать запрос</h1>
        <p className="text-muted-foreground">
          Опишите действие, для которого требуется решение.
        </p>
      </header>
      <CreateApprovalRequestForm />
    </section>
  )
}
