import { ConfirmEmailVerificationStatus } from '@/features/auth-confirm-email-verification'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

export function VerifyEmailPage() {
  return (
    <PublicAuthShell title="Подтверждение email">
      <ConfirmEmailVerificationStatus />
    </PublicAuthShell>
  )
}
