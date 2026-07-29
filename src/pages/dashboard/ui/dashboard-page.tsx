import { useCurrentSession } from '@/entities/session'
import { LogoutButton } from '@/features/auth-logout'
import { Container } from '@/shared/ui'

/**
 * Отображает защищённый дашборд текущего пользователя.
 *
 * @remarks Читает suspense session query и поэтому должен рендериться внутри
 * защищённого маршрута и `AppProvider`.
 */
export function DashboardPage() {
  const { data: user } = useCurrentSession()

  return (
    <Container as="main" className="min-h-screen py-6">
      <header className="flex items-center justify-between gap-4">
        <span className="min-w-0 truncate">{user.normalizedEmail}</span>
        <LogoutButton />
      </header>
    </Container>
  )
}
