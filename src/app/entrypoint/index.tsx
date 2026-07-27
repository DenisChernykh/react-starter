import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/app/styles/index.css'
import { FoundationSmoke } from './foundation-smoke'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoundationSmoke />
  </StrictMode>,
)
