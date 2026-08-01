const canonicalSmokePathPattern = /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/u
const smokePathBaseOrigin = new URL('https://frontend.invalid')

/**
 * Проверяет абсолютный canonical ASCII path для hosted frontend smoke.
 *
 * @remarks
 * Запрещает query, fragment, backslash, неэкранированный Unicode и URL-
 * нормализацию dot-segments до выполнения любой внешней mutation.
 */
export function isCanonicalSmokePath(path: string): boolean {
  if (!canonicalSmokePathPattern.test(path)) {
    return false
  }

  const resolved = new URL(path, smokePathBaseOrigin)
  return (
    resolved.origin === smokePathBaseOrigin.origin &&
    resolved.pathname === path &&
    resolved.search === '' &&
    resolved.hash === ''
  )
}
