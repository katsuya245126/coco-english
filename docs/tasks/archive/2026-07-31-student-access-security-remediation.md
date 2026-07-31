# Security Remediation: Student Access and Foundation Writer

**Status:** Complete

**Completed:** 2026-07-31

## Result

- Removed the unauthenticated `/api/foundation` service-role writer and its orphaned smoke artifacts.
- Added an HMAC-SHA-256, eight-hour-expiring student session token using independent `STUDENT_ACCESS_SECRET`.
- Added an RLS-enabled, service-role-only `student_unlock_attempts` table and atomic five-attempt/ten-minute RPC keyed by HMAC digests.
- Cleared the exact limiter row after successful PIN verification and preserved generic mismatch behavior.

## Commits

- `a4861e46` — `fix: remove public foundation writer`
- `1ede1d02` — `fix: authenticate student session cookie`
- `d7145529` — `fix: throttle student PIN verification`
- `435565dc` — `fix: harden student access security configuration`

## Verification

- Full Vitest: 105 files, 1,395 passed, 5 skipped when local-only integrations are not configured.
- Typecheck: passed.
- Lint: exit 0 with one pre-existing warning at `scripts/check-student-feedback-states.mjs:435`.
- Build and ffmpeg postbuild check: passed.
- Focused schema/session/student-access tests: 12 passed, 1 environment-branch skip.
- Isolated local Supabase applied every migration. Concurrent limiter and anon/authenticated denial tests passed 2/2.
- The local student-access integration passed exhaustion and successful counter clearing: 6 passed, 1 environment-branch skip.
- Static security searches and `git diff --check`: passed.
- The pre-existing PostgreSQL 15 local volume was preserved; verification used an isolated project ID compatible with the current PostgreSQL 17 Supabase image.
- No remote migration, deployment, push, WAF change, or paid security scan occurred.
