import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TextareaField } from './textarea-field'

describe('TextareaField', () => {
  it('connects label, description and error to the textarea', () => {
    render(
      <TextareaField
        label="Описание"
        description="Опишите предмет согласования"
        error="Описание обязательно"
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Описание' })
    expect(textarea).toHaveAccessibleDescription(
      'Опишите предмет согласования Описание обязательно',
    )
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Описание обязательно')
  })

  it('preserves native props and the forwarded ref from form registration', () => {
    const ref = vi.fn()
    render(
      <TextareaField
        label="Описание"
        name="description"
        maxLength={2_000}
        ref={ref}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveAttribute(
      'maxlength',
      '2000',
    )
    expect(ref).toHaveBeenCalled()
  })
})
