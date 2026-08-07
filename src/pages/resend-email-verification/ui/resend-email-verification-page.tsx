import { ResendEmailVerificationForm } from '@/features/auth-resend-email-verification'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

export function ResendEmailVerificationPage() {
  return (
    <PublicAuthShell
      title="Подтвердить email"
      description="Укажите email, чтобы получить новое письмо."
    >
      <ResendEmailVerificationForm />
    </PublicAuthShell>
  )
}
