import { useCurrentSession } from '@/entities/session'
import { LogoutButton } from '@/features/auth-logout'

/** Отображает защищённый дашборд текущего пользователя. */
export function DashboardPage() {
  const { data: user } = useCurrentSession()

  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between">
        <span>{user.normalizedEmail}</span>
        <LogoutButton />
      </header>
    </main>
  )
}
