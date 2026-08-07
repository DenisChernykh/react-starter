import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import {
  authConfirmPasswordReset,
  type ConfirmPasswordResetRequestDto,
} from '@/shared/api'

export function useConfirmPasswordReset() {
  const bodyRef = useRef<ConfirmPasswordResetRequestDto | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const body = bodyRef.current
      if (body === null) throw new Error('Password reset body is missing')
      return authConfirmPasswordReset(body)
    },
  })
  const { mutateAsync } = mutation

  const execute = useCallback(
    async (body: ConfirmPasswordResetRequestDto) => {
      bodyRef.current = body
      try {
        return await mutateAsync()
      } finally {
        bodyRef.current = null
      }
    },
    [mutateAsync],
  )

  return { ...mutation, execute }
}
