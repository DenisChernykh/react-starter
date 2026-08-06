#!/bin/sh
set -eu

fail() {
  printf 'verify-hosted-routing: %s\n' "$1" >&2
  exit 1
}

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  fail 'usage requires https-origin expected-source revision [spa-path]'
fi

origin=$1
expected_source=$2
expected_revision=$3
spa_path=${4:-/login}

case "$origin" in
  https://*) ;;
  *) fail 'origin rule=https status=invalid' ;;
esac

origin_host=${origin#https://}
case "$origin_host" in
  ''|*/*|*\?*|*\#*|*@*|*' '*)
    fail 'origin rule=origin-format status=invalid'
    ;;
esac

if ! printf '%s\n' "$expected_source" | grep -Eq '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'; then
  fail 'source rule=github-source status=invalid'
fi

if ! printf '%s\n' "$expected_revision" | grep -Eq '^[0-9a-f]{40}$'; then
  fail 'source rule=revision status=invalid'
fi

case "$spa_path" in
  /*) ;;
  *) fail 'path=/ rule=spa-path status=invalid' ;;
esac
case "$spa_path" in
  *\?*|*\#*|*' '*|*//* )
    fail 'path=/ rule=spa-path status=invalid'
    ;;
esac

tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
request_index=0

request() {
  path=$1
  request_index=$((request_index + 1))
  body_file="$tmp_dir/body-$request_index"
  headers_file="$tmp_dir/headers-$request_index"
  status_file="$tmp_dir/status-$request_index"

  if ! curl --silent --show-error --connect-timeout 5 --max-time 15 \
    --output "$body_file" --dump-header "$headers_file" \
    --write-out '%{http_code}' --proto '=https' --tlsv1.2 \
    "$origin$path" >"$status_file" 2>/dev/null; then
    fail "path=$path rule=curl status=unavailable"
  fi

  RESPONSE_STATUS=$(cat "$status_file")
  if ! printf '%s\n' "$RESPONSE_STATUS" | grep -Eq '^[0-9]{3}$'; then
    fail "path=$path rule=status status=invalid"
  fi

  RESPONSE_CONTENT_TYPE=$(awk '
    tolower($1) == "content-type:" {
      value = $0
      sub(/^[^:]*:[[:space:]]*/, "", value)
      sub(/[;].*$/, "", value)
      sub(/[[:space:]]*\r$/, "", value)
      print tolower(value)
      exit
    }
  ' "$headers_file")
  RESPONSE_BODY=$body_file
}

assert_status_type() {
  path=$1
  expected_status=$2
  expected_type=$3
  request "$path"
  if [ "$RESPONSE_STATUS" != "$expected_status" ]; then
    fail "path=$path rule=status status=$RESPONSE_STATUS"
  fi
  if [ "$RESPONSE_CONTENT_TYPE" != "$expected_type" ]; then
    fail "path=$path rule=content-type status=$RESPONSE_STATUS"
  fi
}

assert_html() {
  path=$1
  assert_status_type "$path" 200 text/html
  if ! grep -Fq '<div id="root"></div>' "$RESPONSE_BODY"; then
    fail "path=$path rule=app-root status=$RESPONSE_STATUS"
  fi
}

assert_backend() {
  path=$1
  request "$path"
  if [ "$RESPONSE_STATUS" -lt 400 ] || [ "$RESPONSE_STATUS" -gt 499 ]; then
    fail "path=$path rule=backend-status status=$RESPONSE_STATUS"
  fi
  if [ "$RESPONSE_CONTENT_TYPE" != 'application/problem+json' ]; then
    fail "path=$path rule=backend-content-type status=$RESPONSE_STATUS"
  fi
  if grep -Fq '<div id="root"></div>' "$RESPONSE_BODY"; then
    fail "path=$path rule=backend-not-spa status=$RESPONSE_STATUS"
  fi
}

assert_status_type_body() {
  path=$1
  expected_status=$2
  expected_type=$3
  assert_status_type "$path" "$expected_status" "$expected_type"
  expected_file="$tmp_dir/expected-$request_index"
  printf 'ok\n' >"$expected_file"
  if ! cmp -s "$expected_file" "$RESPONSE_BODY"; then
    fail "path=$path rule=body status=$RESPONSE_STATUS"
  fi
}

assert_status_type_body '/_frontend/health' 200 text/plain
request '/_frontend/identity'
if [ "$RESPONSE_STATUS" != 200 ]; then
  fail "path=/_frontend/identity rule=status status=$RESPONSE_STATUS"
fi
if [ "$RESPONSE_CONTENT_TYPE" != text/plain ]; then
  fail "path=/_frontend/identity rule=content-type status=$RESPONSE_STATUS"
fi
identity_file="$tmp_dir/identity-expected"
printf '%s\n%s\n' "$expected_source" "$expected_revision" >"$identity_file"
if ! cmp -s "$identity_file" "$RESPONSE_BODY"; then
  fail "path=/_frontend/identity rule=identity-body status=$RESPONSE_STATUS"
fi

assert_html '/'
assert_html "$spa_path"
assert_backend '/v1'
assert_backend '/v1/__frontend_deployment_probe__'
assert_backend '/health'
assert_backend '/health/__frontend_deployment_probe__'
assert_html '/v10'
assert_html '/v1-admin'
assert_html '/healthcheck'
