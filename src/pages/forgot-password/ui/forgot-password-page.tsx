import { RequestPasswordResetForm } from '@/features/auth-request-password-reset'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

export function ForgotPasswordPage() {
  return (
    <PublicAuthShell
      title="Восстановление пароля"
      description="Укажите email, чтобы получить ссылку для восстановления."
    >
      <RequestPasswordResetForm />
    </PublicAuthShell>
  )
}
