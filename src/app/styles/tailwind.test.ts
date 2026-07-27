import { describe, expect, it } from 'vitest'

import compiledCss from './index.css?inline'

describe('Tailwind Vite integration', () => {
  it('compiles utilities and leaves no Tailwind directives in browser CSS', () => {
    expect(compiledCss).toContain('.min-h-screen')
    expect(compiledCss).not.toMatch(/@(tailwind|theme)\b/)
  })
})
