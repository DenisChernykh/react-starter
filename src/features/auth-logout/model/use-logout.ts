import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { clearCurrentSession } from '@/entities/session'
import { authLogout, isProblemCode } from '@/shared/api'

/**
 * Выполняет выход, очищает локальную сессию и открывает страницу входа.
 *
 * @remarks Требует React Router и React Query. После успешного logout, а также
 * при уже истёкшей сессии, удаляет session/CSRF cache и заменяет текущий маршрут
 * на `/login`.
 */
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
