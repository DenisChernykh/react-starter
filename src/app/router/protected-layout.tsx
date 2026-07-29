import type { ReactNode } from 'react'
import { Outlet } from 'react-router'

import { AppShell } from '@/widgets/app-shell'

/**
 * Соединяет защищённый app shell с дочерними маршрутами приложения.
 *
 * @remarks `Outlet` остаётся в app layer, а `AppShell` получает route content
 * через `children` и не владеет маршрутизацией.
 */
export function ProtectedLayout(): ReactNode {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
