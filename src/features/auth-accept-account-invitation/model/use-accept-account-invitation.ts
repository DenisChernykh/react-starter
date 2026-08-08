import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import {
  authAcceptAccountInvitation,
  type AcceptAccountInvitationRequestDto,
} from '@/shared/api'

export function useAcceptAccountInvitation() {
  const inputRef = useRef<AcceptAccountInvitationRequestDto | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const input = inputRef.current
      if (input === null)
        throw new Error('Invitation acceptance body is missing')
      return authAcceptAccountInvitation(input)
    },
  })
  const { mutateAsync } = mutation

  const execute = useCallback(
    async (input: AcceptAccountInvitationRequestDto) => {
      inputRef.current = input
      try {
        return await mutateAsync()
      } finally {
        inputRef.current = null
      }
    },
    [mutateAsync],
  )

  return { ...mutation, execute }
}
