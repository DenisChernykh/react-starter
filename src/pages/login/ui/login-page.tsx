import { useSearchParams } from 'react-router'

import { LoginForm } from '@/features/auth-login'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from '@/shared/ui'

/**
 * Отображает страницу входа с заголовком первого уровня и формой авторизации.
 *
 * @remarks Берёт `returnTo` из query string, но его безопасность проверяет
 * `useLogin` перед навигацией после успешной аутентификации.
 */
export function LoginPage() {
  const [searchParams] = useSearchParams()

  return (
    <Container
      as="main"
      className="flex min-h-screen items-center justify-center py-6"
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>Вход</h1>
          </CardTitle>
          <CardDescription>
            Введите данные учётной записи, чтобы продолжить.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm returnTo={searchParams.get('returnTo')} />
        </CardContent>
      </Card>
    </Container>
  )
}
