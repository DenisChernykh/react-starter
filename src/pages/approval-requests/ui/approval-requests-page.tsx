import { Link } from 'react-router'

import {
  createApprovalRequestPath,
  openApprovalRequestPath,
} from '@/shared/routes'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui'

/**
 * Отображает центр действий для создания и открытия запросов согласования.
 *
 * @remarks Не изображает несуществующий list endpoint: каждое действие ведёт
 * на самостоятельный route-driven flow с сохранением browser navigation.
 */
export function ApprovalRequestsPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Согласование</h1>
        <p className="text-muted-foreground">
          Создавайте запросы или открывайте существующие по ID.
        </p>
      </header>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Создать новый запрос</CardTitle>
            <CardDescription>
              Опишите действие, для которого требуется решение.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              nativeButton={false}
              render={<Link to={createApprovalRequestPath} />}
            >
              Создать запрос
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Открыть существующий запрос</CardTitle>
            <CardDescription>
              Перейдите к запросу, зная его точный идентификатор.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to={openApprovalRequestPath} />}
            >
              Открыть по ID
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
