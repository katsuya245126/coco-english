#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

npx supabase start >/dev/null
npx supabase db reset --local >/dev/null
eval "$(npx supabase status -o env)"

case "${API_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "Refusing to run: Supabase API URL is not local." >&2
    exit 1
    ;;
esac

if [[ -z "${PUBLISHABLE_KEY:-}" || -z "${SECRET_KEY:-}" ]]; then
  echo "Refusing to run: local Supabase keys are missing." >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY"
export PIN_HASH_PEPPER="${PIN_HASH_PEPPER:-coco-local-test-pepper}"
export STUDENT_ACCESS_SECRET="${STUDENT_ACCESS_SECRET:-coco-local-test-student-access-secret}"

exec "$@"
