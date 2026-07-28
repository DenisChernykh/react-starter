import { useSearchParams } from 'react-router'

import { LoginForm } from '@/features/auth-login'

/** Отображает страницу входа и передаёт в форму маршрут возврата. */
export function LoginPage() {
  const [searchParams] = useSearchParams()

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-950">Вход</h1>
        <LoginForm returnTo={searchParams.get('returnTo')} />
      </section>
    </main>
  )
}
