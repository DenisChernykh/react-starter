import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { authLogin, setCsrfToken, type LoginRequestDto } from '@/shared/api'
import { sanitizeReturnTo } from '@/shared/routes'

/** Выполняет вход и перенаправляет пользователя на безопасный целевой маршрут. */
export function useLogin(returnTo: string | null) {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credentials: LoginRequestDto) => {
      const response = await authLogin(credentials)
      setCsrfToken(response.csrfToken)
      return response
    },
    onSuccess: () => {
      navigate(sanitizeReturnTo(returnTo), { replace: true })
    },
  })
}
