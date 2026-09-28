#!/usr/bin/env bash
# Seeds the demo class into the (already reset) local Supabase, then runs the
# demo Playwright suite with the demo gate on. Called via with-local-supabase.sh.
set -euo pipefail

seed_output="$(env -u OPENAI_API_KEY -u AZURE_SPEECH_KEY -u AZURE_SPEECH_REGION \
  node --import ./scripts/lib/ts-alias.mjs scripts/seed-demo.ts || true)"
DEMO_CLASS_ID="$(printf '%s\n' "$seed_output" | sed -n 's/^DEMO_CLASS_ID=//p')"
if [[ -z "$DEMO_CLASS_ID" ]]; then
  printf '%s\n' "$seed_output" >&2
  echo "Demo seed did not print DEMO_CLASS_ID." >&2
  exit 1
fi

export DEMO_MODE=true DEMO_CLASS_ID
export CRON_SECRET="${CRON_SECRET:-coco-local-demo-cron-secret}"
exec npx playwright test -c playwright.demo.config.ts "$@"
