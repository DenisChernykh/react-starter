import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { authConfirmEmailVerification } from '@/shared/api'

export function useConfirmEmailVerification() {
  const tokenRef = useRef<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const token = tokenRef.current
      if (token === null) throw new Error('Email verification token is missing')
      return authConfirmEmailVerification({ token })
    },
  })
  const { mutateAsync } = mutation

  const execute = useCallback(
    async (token: string) => {
      tokenRef.current = token
      try {
        return await mutateAsync()
      } finally {
        tokenRef.current = null
      }
    },
    [mutateAsync],
  )

  return { ...mutation, execute }
}
