---
phase: 02
slug: teacher-classroom-access
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `2.1.9` (unit/schema/server) + Playwright `1.61.1` (e2e) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm test -- --run tests/domain/classroom-access.test.ts tests/schema/classroom-access-schema.test.ts` |
| **Full suite command** | `npm run lint && npm run typecheck && npm test -- --run && npm run test:e2e && npm run build` |
| **Estimated runtime** | ~120 seconds (full suite incl. Playwright + build) |

---

## Sampling Rate

- **After every task commit:** Run the quick Vitest command plus any changed E2E spec.
- **After every plan wave:** Run `npm run lint && npm run typecheck && npm test -- --run` plus the wave's relevant Playwright specs and `npm run build`.
- **Before `/gsd-verify-work`:** Full suite must be green, with live Supabase Auth/RLS smoke either passed or explicitly documented as skipped due to missing env.
- **Max feedback latency:** ~30 seconds for the quick command.

---

## Per-Requirement Verification Map

| Req ID | Wave | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|--------|------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| AUTH-01 | 1 | Teacher signup creates Supabase Auth user + profile bootstrap | T-AUTH | Email verification required before dashboard | integration/manual | `npm run test:e2e -- teacher-auth.spec.ts` | ❌ W0 | ⬜ pending |
| AUTH-02 | 1 | Teacher login persists across refresh via SSR cookies | T-SESS | Session in httpOnly cookies, not localStorage | e2e | `npm run test:e2e -- teacher-auth.spec.ts` | ❌ W0 | ⬜ pending |
| AUTH-03 | 1 | Teacher logout clears session, blocks protected dashboard | T-SESS | Post-logout dashboard access redirects to login | e2e | `npm run test:e2e -- teacher-auth.spec.ts` | ❌ W0 | ⬜ pending |
| AUTH-04 | 1–3 | Cross-teacher class/roster/future rows inaccessible | T-IDOR | RLS denies cross-tenant SELECT/UPDATE | integration/schema | `npm test -- --run tests/server/teacher-ownership.test.ts` | ❌ W0 | ⬜ pending |
| CLASS-01 | 2 | Teacher creates/edits/archives class | T-IDOR | Writes scoped to owning teacher only | unit/e2e | `npm run test:e2e -- teacher-classes.spec.ts` | ❌ W0 | ⬜ pending |
| CLASS-02 | 2 | Teacher bulk adds, edits, archives students | — | Duplicate/blank names surfaced on import | unit/e2e | `npm test -- --run tests/domain/roster-parser.test.ts` | ❌ W0 | ⬜ pending |
| CLASS-03 | 2 | Teacher creates/resets PIN; plaintext not stored | T-PINSTORE | Only PIN hash persisted; pepper outside DB | unit/integration | `npm test -- --run tests/domain/student-pin.test.ts` | ❌ W0 | ⬜ pending |
| CLASS-04 | 2 | Class join code/QR/link exists and can reset | T-CODEGUESS | Codes stable, unique, resettable | unit/e2e | `npm run test:e2e -- class-share.spec.ts` | ❌ W0 | ⬜ pending |
| STUD-01 | 3 | Student joins by link or manual code | T-CODEGUESS | Generic error on bad code | e2e | `npm run test:e2e -- student-join.spec.ts` | ❌ W0 | ⬜ pending |
| STUD-02 | 3 | Device remembers selected class but not unlock | T-SESS | Remembered class never grants homework access | e2e | `npm run test:e2e -- student-join.spec.ts` | ❌ W0 | ⬜ pending |
| STUD-03 | 3 | Student types name without roster exposure | T-ENUM | Roster names not rendered to student | e2e | `npm run test:e2e -- student-join.spec.ts` | ❌ W0 | ⬜ pending |
| STUD-04 | 3 | Student enters PIN to unlock shell | T-PINBRUTE | Hash-verify server-side; generic mismatch | unit/e2e | `npm test -- --run tests/server/student-access.test.ts` | ❌ W0 | ⬜ pending |
| STUD-05 | 3 | Wrong-PIN/no-homework/expired states render clearly | T-ENUM | Wrong-PIN error reveals no field detail (D-16) | e2e | `npm run test:e2e -- student-states.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/domain/roster-parser.test.ts` — bulk paste, blank names, duplicate normalized names, archive visibility
- [ ] `tests/domain/student-pin.test.ts` — 4-digit generation, hash/verify, no plaintext persistence, generic errors
- [ ] `tests/schema/classroom-access-schema.test.ts` — RLS policies, join code constraints, PIN hash metadata, active roster uniqueness
- [ ] `tests/server/teacher-ownership.test.ts` — live or mocked Supabase checks for cross-teacher isolation (AUTH-04 / Success Criterion 5)
- [ ] `tests/e2e/teacher-auth.spec.ts`, `teacher-classes.spec.ts`, `class-share.spec.ts`, `student-join.spec.ts`, `student-states.spec.ts` — Phase 2 UI paths
- [ ] Framework install: `npm install @supabase/ssr react-hook-form @hookform/resolvers`; optional `qrcode` behind human verification

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email confirmation link delivery/acceptance | AUTH-01 | Supabase CLI/Mailpit unavailable in sandbox (`npx supabase --version` hung); needs local Docker or remote project | With local Supabase running, sign up as teacher, open Mailpit, click confirmation link, verify dashboard access. If unavailable, document as skipped at phase gate. |
| Live RLS enforcement against a real Postgres | AUTH-04 | Requires configured local/remote Supabase + `SUPABASE_ACCESS_TOKEN` | After `supabase db push`, run `tests/server/teacher-ownership.test.ts` against the live DB; confirm cross-teacher reads return 0 rows. |

---

## Validation Sign-Off

- [ ] All requirements have an automated verify command or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING (❌) references
- [ ] No watch-mode flags (all commands use `--run` / non-interactive)
- [ ] Feedback latency < 30s for the quick command
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
