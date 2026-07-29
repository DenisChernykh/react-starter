import type { PropsWithChildren, ReactNode } from 'react'
import { ClipboardCheck, LayoutDashboard } from 'lucide-react'
import { NavLink, useMatch } from 'react-router'

import { useCurrentSession } from '@/entities/session'
import { LogoutButton } from '@/features/auth-logout'
import {
  Container,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/shared/ui'

/**
 * Рендерит навигацию приложения и закрывает mobile drawer после перехода.
 *
 * @remarks Требует родительский `SidebarProvider` и React Router. На desktop
 * переход не меняет состояние свёрнутого sidebar.
 */
function AppNavigation() {
  const { isMobile, setOpenMobile } = useSidebar()
  const overviewMatch = useMatch({ path: '/', end: true })
  const approvalMatch = useMatch('/approval-requests/*')

  function closeMobileNavigation() {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <SidebarContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={Boolean(overviewMatch)}
            render={<NavLink to="/" end onClick={closeMobileNavigation} />}
          >
            <LayoutDashboard aria-hidden="true" />
            <span>Обзор</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={Boolean(approvalMatch)}
            render={
              <NavLink
                to="/approval-requests"
                onClick={closeMobileNavigation}
              />
            }
          >
            <ClipboardCheck aria-hidden="true" />
            <span>Согласование</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarContent>
  )
}

/**
 * Отображает защищённую оболочку приложения с навигацией и session footer.
 *
 * @remarks Требует React Router, `SidebarProvider` создаётся внутри компонента.
 * Читает suspense session query, поэтому рендерится только под защищённым
 * маршрутом внутри `AppProvider`.
 */
export function AppShell({ children }: PropsWithChildren): ReactNode {
  const { data: user } = useCurrentSession()

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span className="px-2 text-xs font-semibold">React Starter</span>
        </SidebarHeader>
        <AppNavigation />
        <SidebarFooter>
          <span className="min-w-0 truncate px-2 text-xs text-muted-foreground">
            {user.normalizedEmail}
          </span>
          <LogoutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-4">
          <SidebarTrigger aria-label="Открыть навигацию" />
        </header>
        <Container className="flex-1 py-6">{children}</Container>
      </SidebarInset>
    </SidebarProvider>
  )
}
