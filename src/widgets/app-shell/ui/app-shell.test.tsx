import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import type { CurrentUserResponseDto } from '@/shared/api'

import { AppShell } from './app-shell'

const currentUser: CurrentUserResponseDto = {
  userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
  normalizedEmail: 'admin@example.com',
  roleKeys: ['admin'],
  permissions: [],
}

const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'innerWidth',
)
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'matchMedia',
)

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function expectOriginalViewportDescriptors() {
  expect(Object.getOwnPropertyDescriptor(window, 'innerWidth')).toEqual(
    originalInnerWidthDescriptor,
  )
  expect(Object.getOwnPropertyDescriptor(window, 'matchMedia')).toEqual(
    originalMatchMediaDescriptor,
  )
}

function restoreWindowProperty(
  property: 'innerWidth' | 'matchMedia',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor === undefined) {
    Reflect.deleteProperty(window, property)
  } else {
    Object.defineProperty(window, property, descriptor)
  }
}

function renderAppShell(
  initialEntry = '/',
  user: typeof currentUser = currentUser,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(currentSessionQueryKey(), user)
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AppShell>
            <p>Содержимое маршрута</p>
          </AppShell>
        ),
      },
      { path: '/login', element: <p>Вход</p> },
    ],
    { initialEntries: [initialEntry] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

function getMenuButton(name: string) {
  const link = screen.getByRole('link', { name })
  const menuButton = link.closest('[data-sidebar="menu-button"]')

  if (menuButton === null) {
    throw new Error(`Не найдена кнопка меню для ${name}.`)
  }

  return menuButton
}

describe('AppShell', () => {
  beforeEach(() => {
    setViewport(1024)
  })

  afterEach(() => {
    restoreWindowProperty('innerWidth', originalInnerWidthDescriptor)
    restoreWindowProperty('matchMedia', originalMatchMediaDescriptor)
    expectOriginalViewportDescriptors()
  })

  it('renders overview and approval navigation on desktop', () => {
    renderAppShell()

    expect(screen.getByRole('link', { name: 'Обзор' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Согласование' })).toBeVisible()
  })

  it('shows account navigation only with the fresh read permission', () => {
    renderAppShell('/admin/accounts', {
      ...currentUser,
      permissions: ['auth.accounts.read'],
    })

    expect(screen.getByRole('link', { name: 'Аккаунты' })).toBeVisible()
    expect(getMenuButton('Аккаунты')).toHaveAttribute('data-active')
  })

  it('hides account navigation without the read permission', () => {
    renderAppShell('/admin/accounts')

    expect(
      screen.queryByRole('link', { name: 'Аккаунты' }),
    ).not.toBeInTheDocument()
  })

  it('marks only overview navigation active at the exact root route', () => {
    renderAppShell('/')

    expect(getMenuButton('Обзор')).toHaveAttribute('data-active')
    expect(getMenuButton('Согласование')).not.toHaveAttribute('data-active')
  })

  it('keeps approval navigation active for an approval child route', () => {
    renderAppShell('/approval-requests/new')

    expect(getMenuButton('Обзор')).not.toHaveAttribute('data-active')
    expect(getMenuButton('Согласование')).toHaveAttribute('data-active')
  })

  it('renders the current session and logout action in the sidebar footer', () => {
    renderAppShell()

    const footer = document.querySelector<HTMLElement>(
      '[data-sidebar="footer"]',
    )

    if (footer === null) {
      throw new Error('Не найден footer sidebar.')
    }

    expect(within(footer).getByText(currentUser.normalizedEmail)).toBeVisible()
    expect(within(footer).getByRole('button', { name: 'Выйти' })).toBeVisible()
  })

  it('gives the sidebar trigger an accessible Russian name', () => {
    renderAppShell()

    expect(
      screen.getByRole('button', { name: 'Открыть навигацию' }),
    ).toBeVisible()
  })

  it.each([
    { path: '/', width: 1024, context: 'Обзор' },
    {
      path: '/approval-requests/new',
      width: 390,
      context: 'Согласование',
    },
  ])(
    'shows the $context route context in the $width px header',
    ({ path, width, context }) => {
      setViewport(width)
      renderAppShell(path)

      expect(
        within(screen.getByRole('banner')).getByText(context),
      ).toBeVisible()
    },
  )

  it('renders children in the shell main content', () => {
    renderAppShell()

    const mainLandmarks = screen.getAllByRole('main')
    expect(mainLandmarks).toHaveLength(1)

    const mainContent = mainLandmarks[0].querySelector<HTMLElement>(
      '[data-slot="container"]',
    )

    if (mainContent === null) {
      throw new Error('Не найден main-контейнер shell.')
    }

    expect(within(mainContent).getByText('Содержимое маршрута')).toBeVisible()
  })

  it('opens mobile navigation and closes the sheet after navigation', async () => {
    setViewport(390)
    const user = userEvent.setup()
    renderAppShell()

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))

    const navigationSheet = await screen.findByRole('dialog', {
      name: 'Навигация',
    })
    expect(navigationSheet).toHaveAccessibleDescription(
      'Основная навигация приложения.',
    )
    await user.click(
      within(navigationSheet).getByRole('link', { name: 'Согласование' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('closes mobile navigation after navigating to accounts', async () => {
    setViewport(390)
    const user = userEvent.setup()
    renderAppShell('/', {
      ...currentUser,
      permissions: ['auth.accounts.read'],
    })

    await user.click(screen.getByRole('button', { name: 'Открыть навигацию' }))
    const navigationSheet = await screen.findByRole('dialog', {
      name: 'Навигация',
    })
    await user.click(
      within(navigationSheet).getByRole('link', { name: 'Аккаунты' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('closes mobile navigation with Escape and restores trigger focus', async () => {
    setViewport(390)
    const user = userEvent.setup()
    renderAppShell('/approval-requests/open')
    const trigger = screen.getByRole('button', {
      name: 'Открыть навигацию',
    })

    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(trigger).toHaveFocus()
  })
})
