import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { authRegister, type RegisterUserRequestDto } from '@/shared/api'

export function useRegister() {
  const credentialsRef = useRef<RegisterUserRequestDto | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const credentials = credentialsRef.current
      if (credentials === null) throw new Error('Registration body is missing')
      return authRegister(credentials)
    },
  })
  const { mutateAsync } = mutation

  const execute = useCallback(
    async (credentials: RegisterUserRequestDto) => {
      credentialsRef.current = credentials
      try {
        return await mutateAsync()
      } finally {
        credentialsRef.current = null
      }
    },
    [mutateAsync],
  )

  return { ...mutation, execute }
}
