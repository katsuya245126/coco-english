---
phase: 7
slug: teacher-review-and-pilot-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-30
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 07-RESEARCH.md `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.8 (already installed) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (unit suite, mocked supabase) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> Task IDs are illustrative until the planner finalizes plan/wave numbering; the
> planner MUST attach an `<automated>` verify (or a Wave 0 dependency) to each
> task implementing a requirement below.

| Requirement | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| ASGN-05 | `markMissedAssignments()` invoked from cron route | T-CRON-AUTH | Route returns 401 without `CRON_SECRET` | unit (mock supabase) | `npx vitest run tests/server/mark-missed-cron.test.ts` | ❌ W0 | ⬜ pending |
| ASGN-05 | Re-running cron does not double-write audit events | — | Idempotent conditional UPDATE on `assigned/started` only | unit | `npx vitest run tests/server/mark-missed-cron.test.ts` | ❌ W0 | ⬜ pending |
| REV-01 | Assignment-student rows bucketed by status correctly | — | Buckets scoped per-assignment (D-03) | unit (domain) | `npx vitest run tests/domain/review-buckets.test.ts` | ❌ W0 | ⬜ pending |
| REV-02 | `attempt_count` + `highest_hint_level` surfaced in attempt detail | — | Data present in detail view (D-07) | unit (mock service) | `npx vitest run tests/server/audio-evidence.test.ts` | ✅ extend | ⬜ pending |
| REV-03 | Attempt detail renders original/improved/repeat transcript + target-pattern result | — | N/A | unit/component | `npx vitest run tests/server/audio-evidence.test.ts` | ✅ extend | ⬜ pending |
| REV-04 | Evidence query returns new fields (`attempt_count`, `highest_hint_level`) | — | N/A | unit (mock supabase) | `npx vitest run tests/server/audio-evidence.test.ts` | ✅ extend | ⬜ pending |
| REV-06 | Override action writes correct status + audit event | T-OVERRIDE-OWN | Teacher owns attempt's class; actor_type teacher | unit (mock supabase) | `npx vitest run tests/server/teacher-override.test.ts` | ❌ W0 | ⬜ pending |
| REV-06 | Illegal override transition rejected | T-TRANSITION-GUARD | `assertTransitionRequest()` throws | unit | `npx vitest run tests/server/teacher-override.test.ts` | ❌ W0 | ⬜ pending |
| ASGN-05 / D-10 | `needs_retry` maps to `displayStatus = "start"` (not "closed") | — | Student-visible reopened state | unit | `npx vitest run tests/server/assignment-list.test.ts` | ✅ extend | ⬜ pending |
| ASGN-05 / D-10 | `startOrResumeAttempt` creates new attempt for `needs_retry` | — | `needs_retry -> started` transition honored | unit | `npx vitest run tests/server/student-mission-flow.test.ts` | ✅ extend | ⬜ pending |
| PILOT-03 | Logger emits structured JSON line to stdout | — | Level + event + context, no PII leakage | unit | `npx vitest run tests/server/logger.test.ts` | ❌ W0 | ⬜ pending |
| PILOT-04 | `purgeExpiredAudio()` calls `Storage.remove()` THEN updates DB | T-STORAGE-ORDER | Storage-first ordering (no orphaned objects) | unit (mock supabase) | `npx vitest run tests/server/purge-audio.test.ts` | ❌ W0 | ⬜ pending |
| PILOT-04 | Purge handles Storage partial failure without crashing | — | Batch ≤1000; remainder picked up next run | unit | `npx vitest run tests/server/purge-audio.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/server/mark-missed-cron.test.ts` — cron route auth (401 without secret, 200 with correct secret) + idempotency
- [ ] `tests/server/teacher-override.test.ts` — override server logic (status write, audit event, ownership check, illegal-transition rejection)
- [ ] `tests/server/purge-audio.test.ts` — Storage remove + DB update ordering, Storage error resilience, batch limit
- [ ] `tests/server/logger.test.ts` — stdout JSON emission (mock `process.stdout.write`)
- [ ] `tests/domain/review-buckets.test.ts` — per-assignment status bucketing

*Existing test files for `assignment-list.ts`, `student-mission-flow.test.ts`, and `audio-evidence.ts` need extension but already exist.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel Cron actually fires daily in deployed env | ASGN-05, PILOT-04 | Cron delivery is platform-controlled (Hobby plan, daily cadence) and not guaranteed/observable in unit tests | After deploy, confirm cron run in Vercel dashboard logs; verify a known-overdue assignment flips to `missed` within ~24h |
| Deleted-clip evidence view degrades gracefully | PILOT-04 | Requires real Storage object expiry + UI render | Manually expire a clip (or set `audio_expires_at` in past, run purge), open evidence page, confirm transcript remains and audio shows a removed/unavailable state |
| Needs-retry student re-record end-to-end | REV-06, D-10 | Full student voice loop (mic) is manual per Phase 5 | Teacher marks attempt "needs retry"; log in as that student; confirm the homework is launchable and a new recording can be submitted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 new test files above)
- [ ] No watch-mode flags (use `vitest run`, never `vitest` watch)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
