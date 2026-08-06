#!/bin/sh
set -eu

fail() {
  printf 'verify-compose-topology: %s\n' "$1" >&2
  exit 1
}

if [ "$#" -ne 5 ]; then
  fail 'usage requires compose-file env-file project-name edge-network edge-alias'
fi

compose_file=$1
env_file=$2
expected_project=$3
expected_network=$4
expected_alias=$5

is_safe_value() {
  printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.-]*$'
}

for value in "$expected_project" "$expected_network" "$expected_alias"; do
  if ! is_safe_value "$value"; then
    fail 'project, network and alias must use safe names'
  fi
done

if ! docker compose --env-file "$env_file" -f "$compose_file" config --quiet >/dev/null 2>/dev/null; then
  fail 'compose config failed'
fi

if ! effective_config=$(docker compose --env-file "$env_file" -f "$compose_file" config 2>/dev/null); then
  fail 'compose config read failed'
fi

project_count=$(printf '%s\n' "$effective_config" | awk -v expected="$expected_project" '
  NR == 1 && $1 == "name:" && $2 == expected { count += 1 }
  END { print count + 0 }
')
network_count=$(printf '%s\n' "$effective_config" | awk -v expected="$expected_network" '
  substr($0, 1, 4) == "    " && $1 == "name:" && $2 == expected { count += 1 }
  END { print count + 0 }
')
alias_count=$(printf '%s\n' "$effective_config" | awk -v expected="$expected_alias" '
  substr($0, 1, 10) == "          " && $1 == "-" && $2 == expected { count += 1 }
  END { print count + 0 }
')

[ "$project_count" -eq 1 ] || fail 'effective project mismatch'
[ "$network_count" -eq 1 ] || fail 'effective edge network mismatch'
[ "$alias_count" -eq 1 ] || fail 'effective edge alias mismatch'
