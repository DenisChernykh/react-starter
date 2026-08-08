import { describe, expect, it } from 'vitest'

import { adminAccountDetailsPath, adminAccountsPath } from './admin-accounts'

describe('account administration routes', () => {
  it('builds the canonical account administration paths', () => {
    expect(adminAccountsPath).toBe('/admin/accounts')
    expect(
      adminAccountDetailsPath('c9c6cbca-47e6-4ab0-932e-30f7a0e97184'),
    ).toBe('/admin/accounts/c9c6cbca-47e6-4ab0-932e-30f7a0e97184')
  })
})
