import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('renders the ordinary label without busy state', () => {
    render(<Button>Сохранить</Button>)

    const button = screen.getByRole('button', { name: 'Сохранить' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(
      button.querySelector('[data-slot="spinner"]'),
    ).not.toBeInTheDocument()
  })

  it('shows only a spinner visually while preserving width and accessibility', () => {
    render(
      <Button isLoading loadingLabel="Сохраняем">
        Сохранить
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Сохраняем' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    const content = within(button).getByText('Сохранить')
    expect(content).toHaveClass('invisible')
    expect(content).not.toHaveAttribute('style')
  })

  it('keeps an explicitly disabled ordinary button disabled', () => {
    render(<Button disabled>Удалить</Button>)

    expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled()
  })
})
