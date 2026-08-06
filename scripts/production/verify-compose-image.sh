#!/bin/sh
set -eu

fail() {
  printf 'verify-compose-image: %s\n' "$1" >&2
  exit 1
}

if [ "$#" -ne 3 ]; then
  fail 'usage requires compose-file env-file approved-image'
fi

compose_file=$1
env_file=$2
approved_image=$3

is_exact_digest() {
  printf '%s\n' "$1" | grep -Eq '^ghcr\.io/[a-z0-9][a-z0-9_.-]*/[a-z0-9][a-z0-9_.-]*@sha256:[0-9a-f]{64}$'
}

if ! is_exact_digest "$approved_image"; then
  fail 'approved image is not an exact GHCR digest'
fi

if ! docker compose --env-file "$env_file" -f "$compose_file" config --quiet >/dev/null 2>/dev/null; then
  fail 'compose config failed'
fi

if ! resolved_images=$(docker compose --env-file "$env_file" -f "$compose_file" config --images 2>/dev/null); then
  fail 'compose image resolution failed'
fi

resolved_count=$(printf '%s\n' "$resolved_images" | awk 'NF { count += 1 } END { print count + 0 }')
if [ "$resolved_count" -ne 1 ]; then
  fail 'expected one resolved image'
fi

resolved_image=$(printf '%s\n' "$resolved_images" | awk 'NF { print; exit }')
if ! is_exact_digest "$resolved_image"; then
  fail 'resolved image is not an exact GHCR digest'
fi

if [ "$approved_image" != "$resolved_image" ]; then
  fail 'compose image does not match approved digest'
fi

printf '%s\n' "$resolved_image"
