import axios from 'axios'
import { z } from 'zod'

import { getOrFetchCsrfToken } from './csrf-token'

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const csrfResponseSchema = z.object({ csrfToken: z.string().min(1) })

const clientDefaults = {
  withCredentials: true,
}

/**
 * Настроенный Axios-клиент для запросов к API с CSRF-защитой.
 *
 * @remarks Отправляет cookie credentials. Перед небезопасным методом получает
 * CSRF-токен, кроме login request; отсутствующее тело нормализует до пустого
 * JSON-объекта, совместимого со строгим серверным JSON-парсером.
 */
export const API_AXIOS_INSTANCE = axios.create(clientDefaults)
const csrfAxios = axios.create(clientDefaults)

const csrfExemptPaths = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/email-verification/resend',
  '/v1/auth/email-verification/confirm',
  '/v1/auth/password-reset/request',
  '/v1/auth/password-reset/confirm',
  '/v1/auth/account-invitations/accept',
])

async function fetchCsrfToken() {
  const response = await csrfAxios.get<unknown>('/v1/auth/csrf')
  return csrfResponseSchema.parse(response.data).csrfToken
}

API_AXIOS_INSTANCE.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase() ?? 'GET'
  if (!unsafeMethods.has(method)) return config

  config.headers.set('Content-Type', 'application/json')
  if (config.data === undefined) config.data = {}
  if (method === 'POST' && csrfExemptPaths.has(config.url ?? '')) return config

  config.headers.set('X-CSRF-Token', await getOrFetchCsrfToken(fetchCsrfToken))
  return config
})
