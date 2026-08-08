export const adminAccountsPath = '/admin/accounts'

export function adminAccountDetailsPath(accountId: string): string {
  return `${adminAccountsPath}/${encodeURIComponent(accountId)}`
}
