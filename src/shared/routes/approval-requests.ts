/** Путь к центру действий согласования. */
export const approvalRequestsPath = '/approval-requests'
/** Путь к форме создания запроса. */
export const createApprovalRequestPath = '/approval-requests/new'
/** Путь к форме открытия запроса по UUID. */
export const openApprovalRequestPath = '/approval-requests/open'

/** Строит безопасный путь к конкретному запросу согласования. */
export function approvalRequestDetailsPath(requestId: string): string {
  return `${approvalRequestsPath}/${encodeURIComponent(requestId)}`
}
