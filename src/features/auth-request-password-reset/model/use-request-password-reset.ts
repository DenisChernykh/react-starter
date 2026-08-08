import { useMutation } from '@tanstack/react-query'

import {
  authRequestPasswordReset,
  type SelfServiceEmailRequestDto,
} from '@/shared/api'

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (body: SelfServiceEmailRequestDto) =>
      authRequestPasswordReset(body),
  })
}
