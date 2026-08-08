import type { PropsWithChildren, ReactNode } from 'react'
import { ClipboardCheck, LayoutDashboard, UsersRound } from 'lucide-react'
import { NavLink, useMatch } from 'react-router'

import { useCurrentSession } from '@/entities/session'
import { LogoutButton } from '@/features/auth-logout'
import { adminAccountsPath } from '@/shared/routes'
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

type AppNavigationProps = Readonly<{
  accountsActive: boolean
  approvalActive: boolean
  canReadAccounts: boolean
  overviewActive: boolean
}>

/**
 * Рендерит навигацию приложения и закрывает mobile drawer после перехода.
 *
 * @remarks Требует родительский `SidebarProvider` и React Router. На desktop
 * переход не меняет состояние свёрнутого sidebar. Active state получает от
 * оболочки вместе с header context, чтобы route matching не дублировался.
 */
function AppNavigation({
  accountsActive,
  approvalActive,
  canReadAccounts,
  overviewActive,
}: AppNavigationProps) {
  const { isMobile, setOpenMobile } = useSidebar()

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
            isActive={overviewActive}
            render={<NavLink to="/" end onClick={closeMobileNavigation} />}
          >
            <LayoutDashboard aria-hidden="true" />
            <span>Обзор</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {canReadAccounts && (
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={accountsActive}
              render={
                <NavLink
                  to={adminAccountsPath}
                  onClick={closeMobileNavigation}
                />
              }
            >
              <UsersRound aria-hidden="true" />
              <span>Аккаунты</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={approvalActive}
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
 * маршрутом внутри `AppProvider`. Один route match управляет одновременно
 * active navigation и кратким контекстом desktop/mobile header.
 */
export function AppShell({ children }: PropsWithChildren): ReactNode {
  const { data: user } = useCurrentSession()
  const overviewActive = Boolean(useMatch({ path: '/', end: true }))
  const accountsActive = Boolean(useMatch(`${adminAccountsPath}/*`))
  const approvalActive = Boolean(useMatch('/approval-requests/*'))
  const canReadAccounts = user.permissions.includes('auth.accounts.read')
  const routeContext = accountsActive
    ? 'Аккаунты'
    : approvalActive
      ? 'Согласование'
      : 'Обзор'

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span className="px-2 text-xs font-semibold">React Starter</span>
        </SidebarHeader>
        <AppNavigation
          overviewActive={overviewActive}
          approvalActive={approvalActive}
          accountsActive={accountsActive}
          canReadAccounts={canReadAccounts}
        />
        <SidebarFooter>
          <span className="min-w-0 truncate px-2 text-xs text-muted-foreground">
            {user.normalizedEmail}
          </span>
          <LogoutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger aria-label="Открыть навигацию" />
          <span className="text-sm font-medium">{routeContext}</span>
        </header>
        <Container className="flex-1 py-6">{children}</Container>
      </SidebarInset>
    </SidebarProvider>
  )
}
