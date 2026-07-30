import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { currentSessionQueryKey } from '@/entities/session'
import type { CurrentUserResponseDto } from '@/shared/api'

import { DashboardPage } from './dashboard-page'

const longestEmail = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(
  63,
)}.${'d'.repeat(61)}`

describe('DashboardPage', () => {
  it('wraps a maximum-length unbroken email on a 320 px surface', () => {
    const queryClient = new QueryClient()
    const currentUser = {
      normalizedEmail: longestEmail,
      permissions: [],
      roleKeys: [],
      userId: '8dc70a15-d91f-4c67-b5a6-479faa42433c',
    } satisfies CurrentUserResponseDto
    queryClient.setQueryData(currentSessionQueryKey(), currentUser)

    render(
      <div style={{ width: 320 }}>
        <QueryClientProvider client={queryClient}>
          <DashboardPage />
        </QueryClientProvider>
      </div>,
    )

    expect(longestEmail).toHaveLength(254)
    const emailCopy = screen.getByText(`Вы вошли как ${longestEmail}`)
    expect(emailCopy).toHaveClass('min-w-0', '[overflow-wrap:anywhere]')
    expect(emailCopy.closest('section')).toHaveClass('min-w-0')
  })
})
