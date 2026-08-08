import { describe, expect, it } from 'vitest'

import {
  acceptAccountInvitationPath,
  forgotPasswordPath,
  loginPath,
  loginPathWithReturnTo,
  registerPath,
  resendEmailVerificationPath,
  resetPasswordPath,
  verifyEmailPath,
} from './auth'

describe('auth routes', () => {
  it('exposes canonical public auth paths', () => {
    expect({
      acceptAccountInvitationPath,
      loginPath,
      registerPath,
      resendEmailVerificationPath,
      verifyEmailPath,
      forgotPasswordPath,
      resetPasswordPath,
    }).toEqual({
      acceptAccountInvitationPath: '/auth/accept-invitation',
      loginPath: '/login',
      registerPath: '/register',
      resendEmailVerificationPath: '/auth/resend-email-verification',
      verifyEmailPath: '/auth/verify-email',
      forgotPasswordPath: '/forgot-password',
      resetPasswordPath: '/auth/reset-password',
    })
  })

  it('encodes the protected return target in the login path', () => {
    expect(loginPathWithReturnTo('/approval-requests/new?mode=full')).toBe(
      '/login?returnTo=%2Fapproval-requests%2Fnew%3Fmode%3Dfull',
    )
  })
})
