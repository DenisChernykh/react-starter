FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack pnpm@11.15.1 install --frozen-lockfile
COPY . .
RUN corepack pnpm@11.15.1 run build

FROM nginxinc/nginx-unprivileged:alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786 AS runtime
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
