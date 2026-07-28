import { isProblemCode } from '@/shared/api'
import { ErrorMessage } from '@/shared/ui'

import { useLogout } from '../model/use-logout'

export function LogoutButton() {
  const logout = useLogout()
  const visibleFailure =
    logout.error !== null &&
    !isProblemCode(logout.error, 'AUTHENTICATION_REQUIRED')

  return (
    <div>
      <button
        type="button"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
        className="rounded-md border border-zinc-300 px-3 py-2 disabled:opacity-50"
      >
        {logout.isPending ? 'Выходим…' : 'Выйти'}
      </button>
      {visibleFailure ? (
        <ErrorMessage>Не удалось выйти. Повторите попытку.</ErrorMessage>
      ) : null}
    </div>
  )
}
