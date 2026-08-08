import { AcceptAccountInvitationForm } from '@/features/auth-accept-account-invitation'
import { PublicAuthShell } from '@/widgets/public-auth-shell'

export function AcceptAccountInvitationPage() {
  return (
    <PublicAuthShell title="Принять приглашение">
      <AcceptAccountInvitationForm />
    </PublicAuthShell>
  )
}
