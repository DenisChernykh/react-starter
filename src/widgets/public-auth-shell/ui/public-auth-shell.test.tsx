import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PublicAuthShell } from './public-auth-shell'

describe('PublicAuthShell', () => {
  it('renders shared auth card composition and optional footer', () => {
    render(
      <PublicAuthShell
        title="Создать аккаунт"
        description="Введите данные"
        footer={<a href="/login">Войти</a>}
      >
        <p>Форма</p>
      </PublicAuthShell>,
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Создать аккаунт',
    )
    expect(screen.getByText('Введите данные')).toBeVisible()
    expect(screen.getByText('Форма')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Войти' })).toBeVisible()
    expect(screen.getByRole('main')).toBeVisible()
  })
})
