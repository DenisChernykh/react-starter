import { RegisterForm } from '@/features/auth-register'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

export function RegisterPage() {
  return (
    <PublicAuthShell
      title="Создать аккаунт"
      description="Зарегистрируйтесь, чтобы продолжить."
    >
      <RegisterForm />
    </PublicAuthShell>
  )
}
