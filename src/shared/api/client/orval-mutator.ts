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

export async function apiMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await API_AXIOS_INSTANCE.request<T>({
      ...config,
      ...options,
      headers: {
        ...config.headers,
        ...options?.headers,
      },
    })
    return response.data
  } catch (error) {
    throw normalizeApiError(error)
  }
}
