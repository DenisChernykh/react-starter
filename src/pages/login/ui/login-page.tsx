import { useSearchParams } from 'react-router'

import { LoginForm } from '@/features/auth-login'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

/**
 * Отображает страницу входа с заголовком первого уровня и формой авторизации.
 *
 * @remarks Берёт `returnTo` из query string, но его безопасность проверяет
 * `useLogin` перед навигацией после успешной аутентификации.
 */
export function LoginPage() {
  const [searchParams] = useSearchParams()

  return (
    <PublicAuthShell
      title="Вход"
      description="Введите данные учётной записи, чтобы продолжить."
    >
      <LoginForm returnTo={searchParams.get('returnTo')} />
    </PublicAuthShell>
  )
}
