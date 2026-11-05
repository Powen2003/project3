#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
declare -a suites=(
  "auth:services/auth-service"
  "customer:services/customer-service"
  "product:services/product-service"
  "order:services/order-service"
  "shipment:services/shipment-service"
  "gateway:api-gateway"
)

total=0
for entry in "${suites[@]}"; do
  name="${entry%%:*}"
  dir="${entry#*:}"
  args=()
  [[ "$name" == "shipment" ]] && args+=(--e2e)
  echo "Running $name..."
  if (cd "$dir" && { [[ -d node_modules ]] || npm ci; } && node scripts/smoke-test.js "${args[@]}"); then
    :
  else
    echo "Suite $name failed" >&2
    exit 1
  fi
done
