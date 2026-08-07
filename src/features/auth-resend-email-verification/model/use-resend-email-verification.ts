import { useMutation } from '@tanstack/react-query'

import {
  authResendEmailVerification,
  type SelfServiceEmailRequestDto,
} from '@/shared/api'

export function useResendEmailVerification() {
  return useMutation({
    mutationFn: (body: SelfServiceEmailRequestDto) =>
      authResendEmailVerification(body),
  })
}
