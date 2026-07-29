import { useCurrentSession } from '@/entities/session'

/**
 * Отображает защищённый дашборд текущего пользователя.
 *
 * @remarks Читает suspense session query и поэтому должен рендериться внутри
 * защищённого маршрута и `AppProvider`.
 */
export function DashboardPage() {
  const { data: user } = useCurrentSession()

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Обзор</h1>
      <p className="text-muted-foreground">
        Вы вошли как {user.normalizedEmail}
      </p>
    </section>
  )
}
