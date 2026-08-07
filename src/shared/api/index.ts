import '@/shared/config'

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
  authConfirmEmailVerification,
  authConfirmPasswordReset,
  authGetCsrfToken,
  authGetMe,
  authLogin,
  authLogout,
  authRegister,
  authRequestPasswordReset,
  authResendEmailVerification,
  getAuthGetMeQueryKey,
  getAuthGetMeQueryOptions,
} from './generated/auth/auth'
export {
  approvalRequestsCreate,
  approvalRequestsDecide,
  approvalRequestsGet,
  getApprovalRequestsGetQueryKey,
  getApprovalRequestsGetQueryOptions,
} from './generated/approval-requests/approval-requests'
export type {
  ApprovalRequestResponseDto,
  ApprovalRequestResponseDtoStatus,
  ApprovalRequestsDecidePathParameters,
  ApprovalRequestsGetPathParameters,
  ConfirmEmailVerificationRequestDto,
  ConfirmPasswordResetRequestDto,
  CreateApprovalRequestDto,
  CurrentUserResponseDto,
  DecideApprovalRequestDto,
  DecideApprovalRequestDtoDecision,
  LoginRequestDto,
  LoginResponseDto,
  ProblemResponseDto,
  RegisterUserRequestDto,
  SelfServiceEmailRequestDto,
  ValidationProblemResponseDto,
} from './generated/model'
export {
  AuthConfirmEmailVerificationBody as authConfirmEmailVerificationSchema,
  AuthConfirmPasswordResetBody as authConfirmPasswordResetSchema,
  AuthLoginBody as authLoginSchema,
  AuthRegisterBody as authRegisterSchema,
  AuthRequestPasswordResetBody as authRequestPasswordResetSchema,
  AuthResendEmailVerificationBody as authResendEmailVerificationSchema,
} from './generated-zod/auth/auth.zod'
export {
  ApprovalRequestsCreateBody as approvalRequestCreateSchema,
  ApprovalRequestsDecideBody as approvalRequestDecisionSchema,
  ApprovalRequestsGetParams as approvalRequestPathSchema,
} from './generated-zod/approval-requests/approval-requests.zod'
