// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('frontend container files', () => {
  it('pins build/runtime images and the non-root runtime contract', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')

    expect(dockerfile).toContain(
      'node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436',
    )
    expect(dockerfile).toContain(
      'nginxinc/nginx-unprivileged:alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786',
    )
    expect(dockerfile).toContain('USER 101')
    expect(dockerfile).toContain('EXPOSE 8080')
    expect(dockerfile).toContain('io.github.actions.workflow-run-url')
  })

  it('keeps backend paths out of the SPA fallback', async () => {
    const nginx = await readFile('config/nginx/default.conf', 'utf8')

    expect(nginx).toMatch(/location ~ \^\/\(\?:v1\|health\)/u)
    expect(nginx).toContain('return 404;')
    expect(nginx).toContain('try_files $uri $uri/ /index.html;')
    expect(nginx).toContain('/_frontend/health')
  })
})
