import type { AxiosRequestConfig } from 'axios'

import {
  type ApiClientError,
  type ProblemDocumentLike,
  normalizeApiError,
} from './api-errors'
import { API_AXIOS_INSTANCE } from './axios-client'

export type ErrorType<ErrorData> = ApiClientError<
  ErrorData & ProblemDocumentLike
>

export type BodyType<BodyData> = BodyData

const operationalHealthPaths = new Set(['/health/ready', '/health/startup'])

function acceptsOperationalHealthUnavailable(
  config: AxiosRequestConfig,
  status: number,
) {
  return (
    status === 503 &&
    config.method?.toUpperCase() === 'GET' &&
    config.url !== undefined &&
    operationalHealthPaths.has(config.url)
  )
}

export async function apiMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    const requestConfig: AxiosRequestConfig = {
      ...config,
      ...options,
      headers: {
        ...config.headers,
        ...options?.headers,
      },
    }
    const response = await API_AXIOS_INSTANCE.request<T>({
      ...requestConfig,
      validateStatus:
        requestConfig.validateStatus === undefined
          ? (status) =>
              (status >= 200 && status < 300) ||
              acceptsOperationalHealthUnavailable(requestConfig, status)
          : requestConfig.validateStatus,
    })
    return response.data
  } catch (error) {
    throw normalizeApiError(error)
  }
}
