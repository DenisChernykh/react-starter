import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PasswordField } from './password-field'

describe('PasswordField', () => {
  it('toggles password visibility without losing the value or focus', async () => {
    const user = userEvent.setup()
    render(<PasswordField label="Пароль" autoComplete="current-password" />)

    const input = screen.getByLabelText('Пароль')
    await user.type(input, 'secret')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('secret')
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('secret')
  })
})
