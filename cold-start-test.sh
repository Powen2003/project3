#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
runs="${1:-3}"
compose=(docker compose -f docker-compose.yml -f docker-compose.dev-ports.yml)

for ((i = 1; i <= runs; i++)); do
  echo "=== Cold start $i of $runs ==="
  "${compose[@]}" down
  "${compose[@]}" up -d
  sleep 45
  status="$("${compose[@]}" ps --format '{{.Service}}|{{.Status}}')"
  healthy="$(grep -c '(healthy)' <<< "$status" || true)"
  echo "healthy services: $healthy of 13"
  grep -v '(healthy)' <<< "$status" || true
  restarted=0
  while read -r container; do
    [[ -z "$container" ]] && continue
    restart_count="$(docker inspect --format '{{.RestartCount}}' "$container")"
    if [[ "$restart_count" != "0" ]]; then
      echo "RESTARTED: $container restarts=$restart_count"
      restarted=1
    fi
  done < <("${compose[@]}" ps -q)
  [[ "$restarted" == "0" ]] && echo "no container restarted"
done
