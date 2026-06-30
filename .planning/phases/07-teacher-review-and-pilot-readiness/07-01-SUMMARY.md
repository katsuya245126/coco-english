---
phase: 07-teacher-review-and-pilot-readiness
plan: "01"
subsystem: test-infrastructure
tags: [tdd, red-tests, security, cron, teacher-override, audio-purge, logging, review-buckets]
dependency_graph:
  requires: []
  provides:
    - tests/server/mark-missed-cron.test.ts
    - tests/server/teacher-override.test.ts
    - tests/server/purge-audio.test.ts
    - tests/server/logger.test.ts
    - tests/domain/review-buckets.test.ts
  affects:
    - Wave 1 (07-02): logger and review-buckets tests go GREEN
    - Wave 2 (07-03): teacher-override test goes GREEN
    - Wave 3 (07-04): purge-audio test goes GREEN
    - Wave 1 (07-02): cron route test goes GREEN
tech_stack:
  added: []
  patterns:
    - vitest with vi.mock for service-client isolation
    - call-order tracking via shared callOrder array for Storage-first ordering assertion
    - process.stdout.write spy for structured logger testing
key_files:
  created:
    - tests/server/mark-missed-cron.test.ts
    - tests/server/teacher-override.test.ts
    - tests/server/purge-audio.test.ts
    - tests/server/logger.test.ts
    - tests/domain/review-buckets.test.ts
  modified: []
decisions:
  - "RED tests use vi.mock for all external dependencies; no real DB or Storage calls"
  - "Call-order tracking via shared array for Storage-first assertion (T-07-03)"
  - "review-buckets assigns 'started' to not_started bucket (in-progress = not yet submitted for teacher review)"
  - "logger spy approach: vi.spyOn(process.stdout, 'write') captures output for JSON parse assertion"
metrics:
  duration: 3min
  completed: 2026-07-01
  tasks_completed: 2
  tasks_total: 3
  files_created: 5
  files_modified: 0
status: complete
---

# Phase 07 Plan 01: Wave-0 RED Tests Summary

One-liner: Five failing RED test files that lock Phase 7 security-critical contracts (cron 401, illegal-transition rejection, Storage-first delete) before any implementation exists.

## What Was Built

### Task 1: RED tests for cron auth and audited override (commit 3490b750)

**tests/server/mark-missed-cron.test.ts**
- Asserts 401 when no Authorization header (T-07-01 / T-CRON-AUTH)
- Asserts 401 when wrong Bearer token
- Asserts 401 when Authorization is not Bearer scheme
- Asserts 401 when CRON_SECRET env var is unset (even with a Bearer header)
- Asserts 200 + `{ ok: true, markedCount }` with correct Bearer secret
- Asserts 200 + markedCount 0 for idempotent zero-result runs
- Asserts 500 on markMissedAssignments unexpected errors

**tests/server/teacher-override.test.ts**
- Asserts legal transition (teacher_review → completed) writes status update + audit event
- Asserts audit event has actor_type "teacher", actor_id from profile, reason_code "teacher_override"
- Asserts illegal transition (missed → completed) returns `{ ok: false, error: "invalid_transition" }` (T-07-02)
- Asserts NO status update written for illegal transition (T-TRANSITION-GUARD)
- Asserts NO audit event inserted for illegal transition
- Asserts needs_retry transition sets latest_attempt_id to null (D-10)
- Asserts optional reasonNote stored as metadata.note in audit event

### Task 2: RED tests for audio purge, logger, and review buckets (commit 4cade3ed)

**tests/server/purge-audio.test.ts**
- Asserts Storage.remove() called BEFORE audio_clips DB update (T-07-03)
- Asserts only non-null object_keys passed to remove()
- Asserts Storage error does not throw; DB update still runs (resilience)
- Asserts result contains `{ deletedCount }`
- Asserts select uses .neq("processing_status","deleted") and .limit() for idempotency/batch cap

**tests/server/logger.test.ts**
- Spies on process.stdout.write; asserts exactly one write per log call
- Asserts output is valid JSON
- Asserts JSON contains `level`, `event`, context fields, and `ts` ISO timestamp
- Asserts output line ends with newline
- Tests info, warn, error log levels

**tests/domain/review-buckets.test.ts**
- Asserts five D-05 buckets always present (completed, not_started, missed, needs_retry, teacher_review)
- Asserts each row placed in exactly one bucket (no duplicates)
- Asserts total rows across all buckets equals input length
- Asserts result has exactly five keys
- Asserts "assigned" and "started" map to not_started bucket

### Task 3: Checkpoint (human-verify) — awaiting human verification

Three high-risk implementation items from the plan checkpoint have been surfaced for manual
verification after later waves land. See CHECKPOINT section below.

## Verification

```
Test Files  5 failed | 27 passed (32)
Tests       8 failed | 217 passed | 4 skipped (229)
```

All 5 new RED files fail with module-not-found or not-a-function errors.
All 27 pre-existing test files continue to pass.

## Deviations from Plan

None — plan executed exactly as written. Tests match the spec:
- mark-missed-cron uses `new NextRequest(...)` pattern with headers
- teacher-override uses vi.mock for requireTeacherProfile and service client
- purge-audio uses call-order array for Storage-first ordering assertion
- logger uses vi.spyOn(process.stdout, 'write')
- review-buckets is a pure function test with no mocking needed

## Known Stubs

None — this plan only creates test files. No implementation stubs exist.

## Threat Flags

No new security surface introduced (test files only). Security contracts were locked:

| Contract | File | Description |
|----------|------|-------------|
| T-07-01 enforced | tests/server/mark-missed-cron.test.ts | 401 without correct CRON_SECRET |
| T-07-02 enforced | tests/server/teacher-override.test.ts | Illegal transitions rejected with no DB write |
| T-07-03 enforced | tests/server/purge-audio.test.ts | Storage.remove() before DB update |

## Self-Check: PASSED

- [x] tests/server/mark-missed-cron.test.ts exists
- [x] tests/server/teacher-override.test.ts exists
- [x] tests/server/purge-audio.test.ts exists
- [x] tests/server/logger.test.ts exists
- [x] tests/domain/review-buckets.test.ts exists
- [x] Commit 3490b750 exists (Task 1)
- [x] Commit 4cade3ed exists (Task 2)
- [x] All 5 files fail RED for missing-module/not-a-function reasons
- [x] Pre-existing 27 test files still pass
