import { ResetPasswordForm } from '@/features/auth-confirm-password-reset'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

export function ResetPasswordPage() {
  return (
    <PublicAuthShell title="Новый пароль">
      <ResetPasswordForm />
    </PublicAuthShell>
  )
}
