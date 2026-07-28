import axios from 'axios'
import { z } from 'zod'

import { publicEnv } from '@/shared/config'

import { getOrFetchCsrfToken } from './csrf-token'

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const csrfResponseSchema = z.object({ csrfToken: z.string().min(1) })

const clientDefaults = {
  baseURL: publicEnv.VITE_API_BASE_URL,
  withCredentials: true,
}

export const API_AXIOS_INSTANCE = axios.create(clientDefaults)
const csrfAxios = axios.create(clientDefaults)

function isLoginRequest(url: string | undefined) {
  return url === '/v1/auth/login'
}

async function fetchCsrfToken() {
  const response = await csrfAxios.get<unknown>('/v1/auth/csrf')
  return csrfResponseSchema.parse(response.data).csrfToken
}

API_AXIOS_INSTANCE.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase() ?? 'GET'
  if (!unsafeMethods.has(method)) return config

  config.headers.set('Content-Type', 'application/json')
  if (config.data === undefined) config.data = ''
  if (isLoginRequest(config.url)) return config

  config.headers.set('X-CSRF-Token', await getOrFetchCsrfToken(fetchCsrfToken))
  return config
})
