FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack pnpm@11.15.1 install --frozen-lockfile
COPY . .
ARG BUILD_SOURCE
ARG BUILD_REVISION
RUN corepack pnpm@11.15.1 run build
RUN printf '%s' "${BUILD_SOURCE}" | grep -Eq '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' \
    && printf '%s' "${BUILD_REVISION}" | grep -Eq '^[0-9a-f]{40}$' \
    && mkdir -p /app/dist/_frontend \
    && printf '%s\n%s\n' "${BUILD_SOURCE}" "${BUILD_REVISION}" > /app/dist/_frontend/identity

FROM nginxinc/nginx-unprivileged:alpine3.23-slim@sha256:eed3e4c2f3f9285e80610238e0b18fe1bf311c50559434db1969b1cfabd5518b AS runtime
ARG BUILD_SOURCE
ARG BUILD_REVISION
ARG BUILD_CREATED
ARG BUILD_WORKFLOW_RUN_URL
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      io.github.actions.workflow-run-url="${BUILD_WORKFLOW_RUN_URL}"
COPY config/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY config/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/_frontend/health || exit 1
