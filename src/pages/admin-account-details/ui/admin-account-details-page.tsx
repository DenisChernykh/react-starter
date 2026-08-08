import { Link, useParams } from 'react-router'

import {
  getAccountStatePresentation,
  useAdminAccount,
} from '@/entities/account'
import { useCurrentSession } from '@/entities/session'
import { AccountActions } from '@/features/admin-account-actions'
import {
  adminAccountPathSchema,
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
} from '@/shared/api'
import { adminAccountsPath } from '@/shared/routes'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from '@/shared/ui'

type DetailErrorPresentation = Readonly<{
  message: string
  requestId?: string
  retryable: boolean
}>

function getDetailErrorPresentation(error: unknown): DetailErrorPresentation {
  if (error instanceof ApiNetworkError) {
    return { message: 'Не удалось подключиться к серверу.', retryable: true }
  }
  if (error instanceof ApiProtocolError) {
    return {
      message: 'Сервер вернул некорректный ответ.',
      retryable: false,
    }
  }
  if (error instanceof ApiProblemError) {
    if (error.code === 'NOT_FOUND') {
      return {
        message: 'Аккаунт не существует или раздел недоступен.',
        requestId: error.requestId,
        retryable: false,
      }
    }
    if (error.code === 'AUTHORIZATION_DENIED') {
      return {
        message: 'У вас нет доступа к этому аккаунту.',
        requestId: error.requestId,
        retryable: false,
      }
    }
    if (error.code === 'DEPENDENCY_UNAVAILABLE') {
      return {
        message: 'Сервис временно недоступен.',
        requestId: error.requestId,
        retryable: true,
      }
    }
    return {
      message: 'Не удалось загрузить аккаунт.',
      requestId: error.requestId,
      retryable: error.code === 'INTERNAL_ERROR',
    }
  }
  return { message: 'Аккаунт недоступен.', retryable: false }
}

function AccountUnavailable({
  error,
  onRetry,
}: Readonly<{ error?: unknown; onRetry?: () => void }>) {
  const presentation = getDetailErrorPresentation(error)
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link
        className="text-sm text-primary underline-offset-4 hover:underline"
        to={adminAccountsPath}
      >
        К аккаунтам
      </Link>
      <Alert variant="destructive">
        <AlertTitle>Аккаунт недоступен</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{presentation.message}</p>
          {presentation.requestId !== undefined && (
            <p>Код запроса: {presentation.requestId}</p>
          )}
          {presentation.retryable && onRetry !== undefined && (
            <Button type="button" variant="outline" onClick={onRetry}>
              Повторить
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </section>
  )
}

export function AdminAccountDetailsPage() {
  const params = useParams()
  const parsed = adminAccountPathSchema.safeParse({
    accountId: params.accountId,
  })
  if (!parsed.success) return <AccountUnavailable />
  return <AdminAccountDetailsContent accountId={parsed.data.accountId} />
}

function AdminAccountDetailsContent({
  accountId,
}: Readonly<{ accountId: string }>) {
  const { data: currentUser } = useCurrentSession()
  const account = useAdminAccount(accountId)
  if (account.isPending) {
    return (
      <p className="flex items-center gap-2" aria-live="polite">
        <Spinner aria-hidden="true" /> Загружаем аккаунт
      </p>
    )
  }
  if (account.isError || !account.data) {
    return (
      <AccountUnavailable
        error={account.error}
        onRetry={() => void account.refetch()}
      />
    )
  }
  const snapshot = account.data
  const presentation = getAccountStatePresentation(snapshot.account.state)

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link
        className="text-sm text-primary underline-offset-4 hover:underline"
        to={adminAccountsPath}
      >
        К аккаунтам
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold break-all">
              {snapshot.account.email ?? snapshot.account.id}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Состояние</dt>
              <dd>
                <Badge variant={presentation.variant}>
                  {presentation.label}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Роли</dt>
              <dd>{snapshot.account.roleKeys.join(', ') || 'Без ролей'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email подтверждён</dt>
              <dd>{snapshot.account.emailVerifiedAt ? 'Да' : 'Нет'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Версия</dt>
              <dd>{snapshot.account.revision}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <AccountActions currentUser={currentUser} snapshot={snapshot} />
    </section>
  )
}
