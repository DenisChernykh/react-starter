import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'

import { approvalRequestPathSchema } from '@/shared/api'

import { useZodForm } from '.'

const transformedSchema = z.strictObject({
  amount: z
    .string()
    .trim()
    .transform((value) => Number(value)),
})

function TransformedForm({
  onSubmit,
}: {
  onSubmit: (value: z.output<typeof transformedSchema>) => void
}) {
  const form = useZodForm(transformedSchema, {
    defaultValues: { amount: '' },
  })
  const rawAmount = form.watch('amount')

  expectTypeOf(rawAmount).toEqualTypeOf<string>()

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <input aria-label="Количество" {...form.register('amount')} />
      <output data-testid="raw-amount">{JSON.stringify(rawAmount)}</output>
      <button type="submit">Сохранить</button>
    </form>
  )
}

function GeneratedSchemaForm({
  onSubmit,
}: {
  onSubmit: (value: z.output<typeof approvalRequestPathSchema>) => void
}) {
  const form = useZodForm(approvalRequestPathSchema, {
    defaultValues: { requestId: '' },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <input aria-label="ID запроса" {...form.register('requestId')} />
      <button type="submit">Открыть</button>
    </form>
  )
}

describe('useZodForm', () => {
  it('keeps Zod input in form state and submits transformed output', async () => {
    const onSubmit =
      vi.fn<(value: z.output<typeof transformedSchema>) => void>()
    const user = userEvent.setup()

    render(<TransformedForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Количество'), ' 42 ')

    expect(screen.getByTestId('raw-amount')).toHaveTextContent('" 42 "', {
      normalizeWhitespace: false,
    })

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ amount: 42 })
  })

  it('accepts a generated OpenAPI Zod schema', async () => {
    const requestId = 'C9C6CBCA-47E6-4AB0-932E-30F7A0E97184'
    const onSubmit =
      vi.fn<(value: z.output<typeof approvalRequestPathSchema>) => void>()
    const user = userEvent.setup()

    render(<GeneratedSchemaForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('ID запроса'), requestId)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))

    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ requestId })
  })
})
