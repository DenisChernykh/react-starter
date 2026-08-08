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
export type { ApiResponse } from './client/orval-mutator'
export {
  clearCsrfToken,
  peekCsrfToken,
  setCsrfToken,
} from './client/csrf-token'
export {
  authAcceptAccountInvitation,
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
export {
  adminAuthCreateAccountInvitation,
  adminAuthGetAccount,
  adminAuthListAccounts,
  adminAuthListRoles,
  adminAuthLogoutAll,
  adminAuthReplaceAccountRoles,
  adminAuthRequestPasswordReset,
  adminAuthResendAccountInvitation,
  adminAuthRetireAccount,
  adminAuthUpdateAccountStatus,
  getAdminAuthGetAccountQueryKey,
  getAdminAuthListAccountsQueryKey,
  getAdminAuthListRolesQueryKey,
} from './generated/admin-auth/admin-auth'
export type {
  ApprovalRequestResponseDto,
  ApprovalRequestResponseDtoStatus,
  AcceptAccountInvitationRequestDto,
  AccountMailDeliveryResponseDto,
  AdminAccountListResponseDto,
  AdminAccountResponseDto,
  AdminAccountResponseDtoState,
  AdminAuthListAccountsParams,
  AdminRoleCatalogResponseDto,
  ApprovalRequestsDecidePathParameters,
  ApprovalRequestsGetPathParameters,
  ConfirmEmailVerificationRequestDto,
  ConfirmPasswordResetRequestDto,
  CreateAccountInvitationRequestDto,
  CreateApprovalRequestDto,
  CurrentUserResponseDto,
  DecideApprovalRequestDto,
  DecideApprovalRequestDtoDecision,
  LoginRequestDto,
  LoginResponseDto,
  ProblemResponseDto,
  RegisterUserRequestDto,
  ReplaceAccountRolesRequestDto,
  SelfServiceEmailRequestDto,
  UpdateAccountStatusRequestDto,
  ValidationProblemResponseDto,
} from './generated/model'
export {
  AdminAuthCreateAccountInvitationBody as adminAccountInvitationSchema,
  AdminAuthGetAccountParams as adminAccountPathSchema,
  AdminAuthReplaceAccountRolesBody as adminAccountRolesSchema,
  AdminAuthUpdateAccountStatusBody as adminAccountStatusSchema,
} from './generated-zod/admin-auth/admin-auth.zod'
export {
  AuthAcceptAccountInvitationBody as authAcceptAccountInvitationSchema,
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
