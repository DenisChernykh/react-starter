import { z } from 'zod'

const publicEnvSchema = z.object({
  VITE_API_BASE_URL: z
    .url('VITE_API_BASE_URL must be an absolute URL')
    .refine((value) => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol)
      } catch {
        return false
      }
    }, 'VITE_API_BASE_URL must use HTTP or HTTPS')
    .transform((value) => value.replace(/\/+$/, '')),
})

/** Публичные переменные окружения, доступные клиентскому приложению. */
export type PublicEnv = z.infer<typeof publicEnvSchema>

/**
 * Проверяет и нормализует публичные переменные окружения.
 *
 * @param input Значения Vite environment variables до runtime-проверки.
 * @returns Публичную конфигурацию с абсолютным HTTP(S) API URL без завершающего `/`.
 */
export function parsePublicEnv(
  input: Record<string, string | boolean | undefined>,
): PublicEnv {
  return publicEnvSchema.parse(input)
}

/** Проверенные публичные переменные окружения, созданные при запуске приложения. */
export const publicEnv = parsePublicEnv(import.meta.env)
