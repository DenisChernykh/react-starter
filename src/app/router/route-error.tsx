import { useEffect } from 'react'
import {
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteError,
} from 'react-router'

import { clearCurrentSession } from '@/entities/session'
import { isProblemCode } from '@/shared/api'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Container,
} from '@/shared/ui'

import { queryClient } from '../config/query-client'
import { getRouteErrorPresentation } from './route-error-presentation'

function AuthenticationRedirect() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    clearCurrentSession(queryClient)
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, {
      replace: true,
    })
  }, [location.hash, location.pathname, location.search, navigate])

  return <p>Перенаправляем на страницу входа…</p>
}

/**
 * Отображает ошибку маршрута или перенаправляет неаутентифицированного пользователя на вход.
 *
 * @remarks Требует React Router. При `AUTHENTICATION_REQUIRED` очищает session
 * cache и выполняет replace-навигацию на login; для retryable ошибок вызывает
 * `revalidator.revalidate()`.
 */
export function RouteError() {
  const error = useRouteError()
  const revalidator = useRevalidator()

  if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
    return <AuthenticationRedirect />
  }

  const presentation = getRouteErrorPresentation(error)
  return (
    <Container
      as="main"
      className="flex min-h-screen items-center justify-center py-6"
    >
      <section className="w-full max-w-md">
        <Alert variant="destructive">
          <AlertTitle>Не удалось открыть страницу</AlertTitle>
          <AlertDescription>
            <p>{presentation.message}</p>
            {Boolean(presentation.requestId) && (
              <p className="mt-2 text-xs">
                Код запроса: {presentation.requestId}
              </p>
            )}
          </AlertDescription>
        </Alert>
        {presentation.retryable && (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => revalidator.revalidate()}
          >
            Повторить
          </Button>
        )}
      </section>
    </Container>
  )
}
