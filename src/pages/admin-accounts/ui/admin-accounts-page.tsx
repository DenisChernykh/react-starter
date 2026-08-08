import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import {
  getAccountStatePresentation,
  useAdminAccountList,
} from '@/entities/account'
import { useCurrentSession } from '@/entities/session'
import { InviteAccountForm } from '@/features/admin-invite-account'
import {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  type AdminAccountResponseDtoState,
} from '@/shared/api'
import { adminAccountDetailsPath } from '@/shared/routes'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Spinner,
  TextField,
} from '@/shared/ui'

const pageSize = 25
const accountStates: readonly AdminAccountResponseDtoState[] = [
  'invited',
  'active',
  'disabled',
  'retired',
]

function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function readState(
  value: string | null,
): AdminAccountResponseDtoState | undefined {
  return accountStates.includes(value as AdminAccountResponseDtoState)
    ? (value as AdminAccountResponseDtoState)
    : undefined
}

function getListError(error: unknown): string {
  if (error instanceof ApiNetworkError)
    return 'Не удалось подключиться к серверу.'
  if (error instanceof ApiProtocolError)
    return 'Сервер вернул некорректный ответ.'
  if (error instanceof ApiProblemError && error.code === 'NOT_FOUND') {
    return 'Управление аккаунтами недоступно.'
  }
  if (error instanceof ApiProblemError) {
    return `Не удалось загрузить аккаунты. Код запроса: ${error.requestId}`
  }
  return 'Не удалось загрузить аккаунты.'
}

function AccountSearchForm({
  search,
  onSubmit,
}: Readonly<{ search: string; onSubmit: (search: string) => void }>) {
  const [draft, setDraft] = useState(search)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(draft.trim())
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
      <TextField
        label="Поиск"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit">Найти</Button>
    </form>
  )
}

export function AdminAccountsPage() {
  const { data: currentUser } = useCurrentSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = (searchParams.get('search') ?? '').trim().slice(0, 254)
  const state = readState(searchParams.get('state'))
  const page = readPage(searchParams.get('page'))
  const accounts = useAdminAccountList({
    page,
    pageSize,
    ...(search ? { search } : {}),
    ...(state ? { state } : {}),
  })
  const canInvite =
    currentUser.permissions.includes('auth.accounts.manage') &&
    currentUser.permissions.includes('auth.accounts.roles.manage')

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next)
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Аккаунты</h1>
        <p className="text-muted-foreground">
          Управляйте приглашениями, статусами и ролями пользователей.
        </p>
      </header>
      {canInvite && <InviteAccountForm />}
      <AccountSearchForm
        key={search}
        search={search}
        onSubmit={(nextSearch) =>
          updateParams({ search: nextSearch, page: undefined })
        }
      />
      <div className="flex flex-wrap gap-2" aria-label="Фильтр состояния">
        <Button
          type="button"
          variant={state === undefined ? 'default' : 'outline'}
          onClick={() => updateParams({ state: undefined, page: undefined })}
        >
          Все
        </Button>
        {accountStates.map((accountState) => (
          <Button
            key={accountState}
            type="button"
            variant={state === accountState ? 'default' : 'outline'}
            onClick={() =>
              updateParams({ state: accountState, page: undefined })
            }
          >
            {getAccountStatePresentation(accountState).label}
          </Button>
        ))}
      </div>
      {accounts.isPending && (
        <p className="flex items-center gap-2" aria-live="polite">
          <Spinner aria-hidden="true" /> Загружаем аккаунты
        </p>
      )}
      {accounts.isError && (
        <Alert variant="destructive">
          <AlertTitle>Аккаунты недоступны</AlertTitle>
          <AlertDescription>{getListError(accounts.error)}</AlertDescription>
        </Alert>
      )}
      {accounts.data && (
        <>
          <ul className="divide-y border">
            {accounts.data.items.map((account) => {
              const presentation = getAccountStatePresentation(account.state)
              return (
                <li key={account.id} className="p-4">
                  <Link
                    className="block space-y-1 underline-offset-4 hover:underline"
                    to={adminAccountDetailsPath(account.id)}
                  >
                    <span className="block font-medium">
                      {account.email ?? account.id}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant={presentation.variant}>
                        {presentation.label}
                      </Badge>
                      <span>{account.roleKeys.join(', ') || 'Без ролей'}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {accounts.data.items.length === 0 && (
            <p className="text-muted-foreground">Аккаунты не найдены.</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={page === 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              Назад
            </Button>
            <span className="text-sm text-muted-foreground">
              Страница {page}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page * pageSize >= accounts.data.total}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Вперёд
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
