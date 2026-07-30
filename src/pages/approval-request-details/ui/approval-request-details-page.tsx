import {
  formatApprovalRequestDate,
  getApprovalRequestStatusPresentation,
  useApprovalRequest,
} from '@/entities/approval-request'
import { useCurrentSession } from '@/entities/session'
import { ApprovalRequestDecision } from '@/features/decide-approval-request'
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  approvalRequestPathSchema,
  isProblemCode,
  type ApprovalRequestResponseDto,
} from '@/shared/api'
import { approvalRequestsPath } from '@/shared/routes'
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
import { Link, useParams } from 'react-router'

type DetailErrorPresentation = Readonly<{
  message: string
  requestId?: string
  retryable: boolean
}>

/**
 * Возвращает безопасное локализованное описание ошибки загрузки запроса.
 *
 * @remarks Не использует поля Problem Details `title` и `detail`; `requestId`
 * передаётся пользователю только для недоступного внутреннего запроса.
 */
function getDetailErrorPresentation(error: unknown): DetailErrorPresentation {
  if (error instanceof ApiNetworkError) {
    return {
      message: 'Не удалось подключиться к серверу.',
      retryable: true,
    }
  }
  if (error instanceof ApiProtocolError) {
    return {
      message: 'Сервер вернул некорректный ответ.',
      retryable: false,
    }
  }
  if (error instanceof ApiProblemError) {
    if (error.code === 'DEPENDENCY_UNAVAILABLE') {
      return {
        message: 'Сервис временно недоступен.',
        retryable: true,
      }
    }
    if (error.code === 'INTERNAL_ERROR') {
      return {
        message: 'Не удалось выполнить запрос.',
        requestId: error.requestId,
        retryable: true,
      }
    }
  }
  return {
    message: 'Не удалось обработать ответ сервера.',
    retryable: false,
  }
}

/** Рендерит локальное состояние недоступного или несуществующего запроса. */
function ApprovalRequestUnavailable() {
  return (
    <section className="mx-auto max-w-2xl min-w-0 space-y-6">
      <Link
        className="text-sm text-primary underline-offset-4 hover:underline"
        to={approvalRequestsPath}
      >
        К согласованию
      </Link>
      <Alert variant="destructive">
        <AlertTitle>Запрос недоступен</AlertTitle>
      </Alert>
    </section>
  )
}

/** Рендерит сведения об успешно загруженном запросе и доступное решение. */
function ApprovalRequestDetailsContent({
  request,
}: Readonly<{ request: ApprovalRequestResponseDto }>) {
  const { data: currentUser } = useCurrentSession()
  const status = getApprovalRequestStatusPresentation(request.status)
  const decidedBy = request.decidedByUserId ?? 'Решение ещё не принято'
  const decidedAt =
    request.decidedAt === null
      ? 'Решение ещё не принято'
      : formatApprovalRequestDate(request.decidedAt)

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Link
        className="text-sm text-primary underline-offset-4 hover:underline"
        to={approvalRequestsPath}
      >
        К согласованию
      </Link>
      <Card className="min-w-0 overflow-visible">
        <CardHeader className="min-w-0">
          <CardTitle className="min-w-0">
            <h1 className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere]">
              {request.title}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <dl className="min-w-0 space-y-4 text-sm">
            <div className="space-y-1">
              <dt className="text-muted-foreground">ID запроса</dt>
              <dd className="break-all">{request.id}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Статус</dt>
              <dd>
                <Badge variant={status.variant}>{status.label}</Badge>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Описание</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">
                {request.description}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Автор</dt>
              <dd className="break-all">{request.createdByUserId}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Создан</dt>
              <dd>{formatApprovalRequestDate(request.createdAt)}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Решение принял</dt>
              <dd className="break-all">{decidedBy}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Решение принято</dt>
              <dd>{decidedAt}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <ApprovalRequestDecision request={request} currentUser={currentUser} />
    </section>
  )
}

/**
 * Загружает и отображает один валидный запрос согласования.
 *
 * @remarks Только этот private-компонент вызывает `useApprovalRequest`, поэтому
 * неверный route parameter не запускает HTTP-запрос. Ошибку
 * `AUTHENTICATION_REQUIRED` hook передаёт в `RouteError`; остальные состояния
 * остаются внутри защищённого app shell.
 */
function ApprovalRequestDetails({
  requestId,
}: Readonly<{ requestId: string }>) {
  const query = useApprovalRequest(requestId)

  if (query.isPending) {
    return (
      <section className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2" role="status">
          <Spinner aria-label="Загружаем запрос" />
          <p>Загружаем запрос</p>
        </div>
      </section>
    )
  }

  if (query.isError) {
    if (isProblemCode(query.error, 'APPROVAL_REQUEST_NOT_FOUND')) {
      return (
        <section className="mx-auto max-w-2xl space-y-6">
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            to={approvalRequestsPath}
          >
            К согласованию
          </Link>
          <Alert variant="destructive">
            <AlertTitle>Запрос не существует или недоступен</AlertTitle>
            <AlertDescription>
              <p>Код запроса: {query.error.requestId}</p>
            </AlertDescription>
          </Alert>
        </section>
      )
    }

    const presentation = getDetailErrorPresentation(query.error)
    return (
      <section className="mx-auto max-w-2xl space-y-6">
        <Link
          className="text-sm text-primary underline-offset-4 hover:underline"
          to={approvalRequestsPath}
        >
          К согласованию
        </Link>
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить запрос</AlertTitle>
          <AlertDescription>
            <p>{presentation.message}</p>
            {Boolean(presentation.requestId) && (
              <p>Код запроса: {presentation.requestId}</p>
            )}
          </AlertDescription>
        </Alert>
        {presentation.retryable && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Повторить
          </Button>
        )}
      </section>
    )
  }

  if (query.data === undefined) {
    return (
      <section className="mx-auto max-w-2xl">
        <Alert variant="destructive">
          <AlertTitle>Не удалось обработать ответ сервера.</AlertTitle>
        </Alert>
      </section>
    )
  }

  return <ApprovalRequestDetailsContent request={query.data} />
}

/**
 * Проверяет URL-параметр и отображает страницу деталей запроса согласования.
 *
 * @remarks Выполняет generated Zod validation до монтирования query-компонента,
 * поэтому malformed `requestId` остаётся локальным состоянием без GET-запроса.
 */
export function ApprovalRequestDetailsPage() {
  const params = useParams()
  const parsed = approvalRequestPathSchema.safeParse(params)

  return parsed.success ? (
    <ApprovalRequestDetails requestId={parsed.data.requestId} />
  ) : (
    <ApprovalRequestUnavailable />
  )
}
