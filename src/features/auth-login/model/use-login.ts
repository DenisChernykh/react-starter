import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { clearCurrentSession, refreshCurrentSession } from '@/entities/session'
import {
  authLogin,
  isProblemCode,
  setCsrfToken,
  type LoginRequestDto,
} from '@/shared/api'
import { sanitizeReturnTo } from '@/shared/routes'

export function useLogin(returnTo: string | null) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credentials: LoginRequestDto) => {
      const response = await authLogin(credentials)
      setCsrfToken(response.csrfToken)
      try {
        await refreshCurrentSession(queryClient)
      } catch (error) {
        if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
          clearCurrentSession(queryClient)
        }
        throw error
      }
      return response
    },
    onSuccess: () => {
      navigate(sanitizeReturnTo(returnTo), { replace: true })
    },
  })
}
