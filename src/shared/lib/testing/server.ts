import { setupServer } from 'msw/node'

import { handlers } from './handlers'

/** MSW-сервер для изоляции сетевых запросов в тестах. */
export const server = setupServer(...handlers)
