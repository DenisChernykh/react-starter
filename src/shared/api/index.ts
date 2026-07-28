export {
  ApiNetworkError,
  ApiProblemError,
  ApiProtocolError,
  isProblemCode,
  normalizeApiError,
} from './client/api-errors'
export type {
  ApiClientError,
  ProblemCode,
  ProblemDocumentLike,
} from './client/api-errors'
export {
  clearCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from './client/csrf-token'
export {
  authGetCsrfToken,
  authGetMe,
  authLogin,
  authLogout,
  getAuthGetMeQueryKey,
  getAuthGetMeQueryOptions,
} from './generated/auth/auth'
export type {
  CurrentUserResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  ProblemResponseDto,
  ValidationProblemResponseDto,
} from './generated/model'
export { AuthLoginBody as authLoginSchema } from './generated-zod/auth/auth.zod'
