import { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios'

import {
  type ApiClientError,
  type ProblemDocumentLike,
  normalizeApiError,
} from './api-errors'
import { API_AXIOS_INSTANCE } from './axios-client'

/** Тип нормализованной ошибки для сгенерированного API-клиента. */
export type ErrorType<ErrorData> = ApiClientError<
  ErrorData & ProblemDocumentLike
>

/** Тип тела запроса для сгенерированного API-клиента. */
export type BodyType<BodyData> = BodyData

/** Полный успешный HTTP-ответ для операций, которым нужны response headers. */
export type ApiResponse<T> = Readonly<{
  data: T
  headers: AxiosResponse<T>['headers']
}>

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

function getResponseMediaType(response: AxiosResponse<unknown>) {
  return String(response.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
}

/**
 * Выполняет запрос с нормализацией ошибок и обработкой operational health endpoint'ов.
 *
 * @remarks Объединяет config и options без потери headers. Для readiness/startup
 * endpoints принимает JSON-ответ `503` как operational status, а все остальные
 * ошибки переводит через `normalizeApiError` в единый client contract.
 *
 * @returns Данные успешного API-ответа с типом, заданным сгенерированным клиентом.
 */
async function executeApiRequest<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  const requestConfig: AxiosRequestConfig = {
    ...config,
    ...options,
    headers: {
      ...config.headers,
      ...options?.headers,
    },
  }
  const acceptsOperationalHealthResponse =
    requestConfig.validateStatus === undefined
  const response = await API_AXIOS_INSTANCE.request<T>({
    ...requestConfig,
    validateStatus:
      requestConfig.validateStatus === undefined
        ? (status) =>
            (status >= 200 && status < 300) ||
            acceptsOperationalHealthUnavailable(requestConfig, status)
        : requestConfig.validateStatus,
  })
  if (
    acceptsOperationalHealthResponse &&
    acceptsOperationalHealthUnavailable(requestConfig, response.status) &&
    getResponseMediaType(response) !== 'application/json'
  ) {
    throw new AxiosError(
      `Request failed with status code ${response.status}`,
      'ERR_BAD_RESPONSE',
      response.config,
      response.request,
      response,
    )
  }
  return response
}

/** Выполняет запрос и возвращает только тело успешного ответа. */
export async function apiMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    return (await executeApiRequest<T>(config, options)).data
  } catch (error) {
    throw normalizeApiError(error)
  }
}

/** Выполняет запрос и сохраняет успешные response headers вместе с телом. */
export async function apiResponseMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  try {
    const response = await executeApiRequest<T>(config, options)
    return { data: response.data, headers: response.headers }
  } catch (error) {
    throw normalizeApiError(error)
  }
}
