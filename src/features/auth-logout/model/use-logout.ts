import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { clearCurrentSession } from '@/entities/session'
import { authLogout, isProblemCode } from '@/shared/api'

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => authLogout(),
    onSuccess: () => {
      clearCurrentSession(queryClient)
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      if (isProblemCode(error, 'AUTHENTICATION_REQUIRED')) {
        clearCurrentSession(queryClient)
        navigate('/login', { replace: true })
      }
    },
  })
}
