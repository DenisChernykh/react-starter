export function sanitizeReturnTo(value: string | null | undefined) {
  if (value === undefined || value === null || !value.startsWith('/')) {
    return '/'
  }
  if (value.startsWith('//')) return '/'

  const target = new URL(value, 'http://local.invalid')
  const normalized = `${target.pathname}${target.search}${target.hash}`
  return target.pathname === '/login' ? '/' : normalized
}
