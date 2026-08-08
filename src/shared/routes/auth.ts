export const loginPath = '/login'
export const registerPath = '/register'
export const resendEmailVerificationPath = '/auth/resend-email-verification'
export const verifyEmailPath = '/auth/verify-email'
export const forgotPasswordPath = '/forgot-password'
export const resetPasswordPath = '/auth/reset-password'
export const acceptAccountInvitationPath = '/auth/accept-invitation'
export function loginPathWithReturnTo(returnTo: string): string {
  return `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`
}
