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
    const backendLocation = nginx
      .split('location ~ ^/(?:v1|health)(?:/|$) {')[1]
      ?.split(
        'location ~* \\.(?:css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$ {',
      )[0]

    expect(nginx).toMatch(/location ~ \^\/\(\?:v1\|health\)/u)
    expect(nginx).toContain('try_files $uri $uri/ /index.html;')
    expect(nginx).toContain('/_frontend/health')
    expect(backendLocation).toBeDefined()
    expect(backendLocation).toContain('default_type text/plain;')
    expect(backendLocation).toContain('return 404 "Not Found\\n";')
  })

  it('emits one exact immutable Cache-Control value for hashed assets', async () => {
    const nginx = await readFile('config/nginx/default.conf', 'utf8')
    const assetLocation = nginx
      .split(
        'location ~* \\.(?:css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$ {',
      )[1]
      ?.split('location = /index.html')[0]

    expect(assetLocation).toBeDefined()
    expect(assetLocation).not.toContain('expires 1y;')
    expect(assetLocation).toContain(
      'add_header Cache-Control "public, max-age=31536000, immutable" always;',
    )
  })
})
