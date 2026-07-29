import '@/shared/config/zod-locale'

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
  CreateApprovalRequestDto,
  CurrentUserResponseDto,
  DecideApprovalRequestDto,
  DecideApprovalRequestDtoDecision,
  LoginRequestDto,
  LoginResponseDto,
  ProblemResponseDto,
  ValidationProblemResponseDto,
} from './generated/model'
export { AuthLoginBody as authLoginSchema } from './generated-zod/auth/auth.zod'
export {
  ApprovalRequestsCreateBody as approvalRequestCreateSchema,
  ApprovalRequestsDecideBody as approvalRequestDecisionSchema,
  ApprovalRequestsGetParams as approvalRequestPathSchema,
} from './generated-zod/approval-requests/approval-requests.zod'
