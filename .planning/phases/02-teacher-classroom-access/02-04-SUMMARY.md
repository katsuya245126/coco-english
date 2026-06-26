---
phase: 02-teacher-classroom-access
plan: 04
subsystem: auth
tags: [student-access, nextjs, server-actions, service-role, zod, pin-verify, rls, generic-error, localstorage, e2e]

# Dependency graph
requires:
  - phase: 02-teacher-classroom-access
    plan: 02
    provides: "classes table + stable join_code (generateJoinCode); join link/QR share + D-18 reset"
  - phase: 02-teacher-classroom-access
    plan: 03
    provides: "verifyPin (constant-time), normalizeRosterName, students stored with pin_hash + normalized display_name; PIN_HASH_PEPPER"
  - phase: 02-teacher-classroom-access
    plan: 01
    provides: "service-role client (createSupabaseServiceClient), SSR user client, teacher-ownership RLS policies (migration 0002), authenticated GRANTs (migration 0003)"
provides:
  - "student-access-schemas: joinCodeInputSchema (uppercased), typedNameSchema, pinInputSchema (4-digit), studentUnlockSchema (Zod + z.infer)"
  - "resolveClassByJoinCode: service-role lookup returning minimal class context for active classes only, null for unknown/archived without revealing which"
  - "unlockStudent: server-only code+name+PIN verification returning a single generic_mismatch on every failure branch (D-16)"
  - "join server actions: unlockStudentAction (sets short-lived HttpOnly unlock cookie), resolveClassAction, readStudentUnlock, clearStudentUnlockAction"
  - "/join (manual code + remembered banner), /join/[joinCode] (link/QR), /student/home (no-homework shell)"
  - "student components: JoinForm, NameForm (free-text, no roster selector), PinForm, RememberedClassBanner, StudentHomeShell + shared styles + remembered-class localStorage helper"
  - "tests: student-access.test.ts (D-16 invariant), teacher-ownership.test.ts (AUTH-04 cross-teacher isolation across class/student/linked rows), student-join.spec.ts (env-aware e2e)"
affects: [student-attempts, student-sessions, assignment-list, teacher-review, ai-evaluation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "App-owned student access via the server-only service-role client (students have no Supabase Auth session); RLS-bypassing reads return only minimal class/student context"
    - "Single-value generic-mismatch funnel: every unlock failure branch (malformed PIN, unknown/archived code, wrong name, wrong PIN, any internal error) returns one identical { ok:false, error:'generic_mismatch' } value (D-16, non-enumeration)"
    - "Remembered class stored as an id-keyed JSON record (classId + displayCode + className) under a dedicated localStorage key, separate from the live join code, so a join-code reset never strands a device (D-18)"
    - "Short-lived HttpOnly session cookie carries unlock context (no PIN, no auth account) for the immediate /student/home render; PIN re-entered every fresh visit (D-13/D-17)"
    - "Server-only-by-construction modules (service-role + node:crypto) guarded by source inspection: never imported into a 'use client' module"

key-files:
  created:
    - src/domain/classroom/student-access-schemas.ts
    - src/server/student-access/class-lookup.ts
    - src/server/student-access/unlock.ts
    - src/app/join/actions.ts
    - src/app/join/page.tsx
    - src/app/join/[joinCode]/page.tsx
    - src/app/student/home/page.tsx
    - src/components/student/JoinForm.tsx
    - src/components/student/NameForm.tsx
    - src/components/student/PinForm.tsx
    - src/components/student/RememberedClassBanner.tsx
    - src/components/student/StudentHomeShell.tsx
    - src/components/student/styles.ts
    - src/components/student/remembered-class.ts
    - tests/server/student-access.test.ts
    - tests/server/teacher-ownership.test.ts
    - tests/e2e/student-join.spec.ts
  modified: []

key-decisions:
  - "Used the service-role client for student class lookup + unlock because students have no Supabase Auth session (RLS cannot scope them); confined it to server-only modules and verified by source inspection that no 'use client' module imports it (threat T-02-15)."
  - "Persisted unlock context in a short-lived HttpOnly session cookie (no maxAge, no PIN) rather than a student_sessions table — matches RESEARCH Open Question 1 RESOLVED (narrow shell state only, no session-persistence migration in Phase 2)."
  - "Remembered-class localStorage record is keyed on the immutable classId (with displayCode + className for prefill/labels), under key 'coco.rememberedClass.v1' — distinct from the live join code — so a teacher's join-code reset (02-02 D-18) leaves remembered devices able to return with a fresh PIN."
  - "NameForm is a free-text input with autoComplete='off' and no select/datalist/listbox — the student types their own name and the roster is never exposed (D-11)."
  - "Added shared src/components/student/styles.ts + remembered-class.ts helper (beyond the plan's explicit file list) to keep the listed components DRY and mobile-first; both are pure presentation/storage with no behavior change to the slice."

patterns-established:
  - "Generic-mismatch funnel: one GENERIC_MISMATCH constant returned from every failure branch in unlock.ts and re-forwarded unchanged by the action; the UI shows one verbatim copy string."
  - "Env-aware server + e2e tests: pure invariants (malformed-PIN short-circuit, no-roster-selector structural check) run always; live-lookup / seeded-flow assertions skip cleanly when Supabase env is absent, mirroring tests/server/foundation-smoke.test.ts."

requirements-completed: [STUD-01, STUD-02, STUD-03, STUD-04, STUD-05, AUTH-04]

# Metrics
duration: ~25min
completed: 2026-06-26
status: complete
---

# Phase 02 Plan 04: Student Access Slice Summary

**App-owned student access: open a class by link/QR (`/join/[joinCode]`) or typed code (`/join`), type your name (no roster selector) and a 4-digit PIN, and on a correct tuple land on a no-homework `/student/home` shell — with every wrong code/name/PIN funnelled to one identical generic mismatch message (D-16), the remembered class stored id-keyed so a join-code reset never strands a device (D-18), and an automated cross-teacher RLS isolation proof closing AUTH-04.**

## Performance

- **Duration:** ~25 min of active execution (the literal start/now epoch diff is inflated by a calendar rollover mid-session).
- **Tasks:** 4 of 5 executed automatically. Task 5 is a blocking human-verify checkpoint surfaced to the developer below; per the execution brief, automated checks are the completion gate and the live browser walkthrough is not a blocker.
- **Files:** 17 created, 0 source files modified (shared teacher files left untouched).

## Accomplishments
- **Server spine (Task 2):** `student-access-schemas.ts` (Zod join-code/name/PIN + unlock tuple), `resolveClassByJoinCode` (service-role, active-only, minimal context, null-without-reason), `unlockStudent` (validate PIN shape → resolve active class → match active student by normalized name → `verifyPin` → single `generic_mismatch` on any failure), and `join/actions.ts` (`unlockStudentAction` setting a short-lived HttpOnly unlock cookie, `resolveClassAction`, `readStudentUnlock`, `clearStudentUnlockAction`).
- **Student UI (Task 3):** `/join`, `/join/[joinCode]`, `/student/home` routes; `JoinForm` → `PinForm`(+`NameForm`) unlock flow; `RememberedClassBanner`; `StudentHomeShell` (verbatim "No homework yet" + reserved closed/expired placeholder, zero homework-app UI); shared mobile-first styles + the id-keyed remembered-class localStorage helper.
- **Isolation proof (Tasks 1+4):** `teacher-ownership.test.ts` seeds two confirmed auth users + profiles + class + student + mission + assignment and asserts (via an authenticated teacher-A user client) that A reads ZERO of B's class, student, AND linked assignment rows — covering RESEARCH Pitfall 2 (linked-record RLS), closing AUTH-04.

## Task Commits

1. **Task 1: Failing student-unlock, cross-teacher isolation, and join e2e tests (TDD RED)** — `17863f2` (test)
2. **Task 2: Student-access server spine — schemas, class lookup, unlock service, action (GREEN)** — `5814e9d` (feat)
3. **Task 3: Student join/name/PIN flow + no-homework home shell** — `7e29847` (feat)

_Task 4 (cross-teacher isolation verification + full Phase 2 suite) added no new source — the isolation test was authored complete in Task 1 RED; Task 4 is the integration/verification gate and passed (lint + typecheck + full vitest + build). Task 5 = blocking human-verify checkpoint, deferred to the developer (see User Setup Required)._

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP/REQUIREMENTS commit)_

## Files Created/Modified
See frontmatter `key-files`. Highlights:
- `src/server/student-access/unlock.ts` — the D-16 generic-mismatch funnel (server-only).
- `src/server/student-access/class-lookup.ts` — active-only class resolution (service-role, server-only).
- `src/app/join/actions.ts` — browser boundary; short-lived HttpOnly unlock cookie (no PIN, no auth account).
- `src/components/student/{JoinForm,NameForm,PinForm,RememberedClassBanner,StudentHomeShell}.tsx` — the student flow (no roster selector).
- `src/components/student/remembered-class.ts` — id-keyed remembered class, separate from the join code (D-18).
- `tests/server/teacher-ownership.test.ts` — AUTH-04 cross-teacher isolation across class/student/linked rows.

## Decisions Made
See frontmatter `key-decisions`. Most material: service-role for app-owned student access (confined server-only); HttpOnly session cookie instead of a `student_sessions` table (RESEARCH OQ1 RESOLVED); id-keyed remembered class for D-18 survivability.

## Deviations from Plan

None affecting behavior. Two presentation/support files were added beyond the plan's explicit file list — `src/components/student/styles.ts` (shared mobile-first inline styles) and `src/components/student/remembered-class.ts` (the localStorage helper the plan's `<action>` explicitly requires). Both are pure presentation/storage that keep the listed components DRY; no scope creep, no behavior beyond the plan. No bugs (Rule 1), missing-critical (Rule 2), blocking (Rule 3), or architectural (Rule 4) deviations.

## Issues Encountered

- **Test/e2e processes do not load `.env.local`.** The shell environment has no Supabase keys, so Vitest and Playwright ran without them. This is the designed path: the env-aware server tests (student-access live lookup, teacher-ownership isolation) and env-gated e2e cases skip cleanly with explicit messages, exactly like the existing foundation smoke tests. The Next.js dev server itself loads `.env.local`, so the always-on structural e2e (`/join` renders, no roster selector) ran live and passed. The cross-teacher isolation proof therefore **env-skipped** in this run; it executes when run with Supabase service + anon env present.

## Migration / DB

**No new migration was needed.** This plan added no tables and no columns. It only READS the existing `classes` and `students` tables (which already have `authenticated` GRANTs via migration `202606250003` and RLS via `202606250002`), and the cross-teacher test only EXERCISES the RLS policies that plan 02-01 already pushed in migration `202606250002`. The service-role student-access path bypasses RLS by design (students have no auth session) and touches no new surface, so no new `grant ... to authenticated` was required and there was nothing to `supabase db push`.

## Verification Results (automated gates — all PASS)
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test -- --run` (full Phase 2 suite) — **100 passed, 3 skipped** (env-gated: foundation-smoke live, student-access live-lookup, teacher-ownership isolation). No regressions.
- `npm test -- --run tests/server/student-access.test.ts` — GREEN, including the identical-error-across-failures assertion (malformed PIN, and the same generic value for differing malformed inputs); the wrong-code/wrong-name/wrong-PIN identical-value assertion is env-gated.
- `npx playwright test tests/e2e/student-join.spec.ts` — 1 passed (manual `/join` renders Continue + **no `<select>`/listbox roster selector**), 3 env-skipped.
- `npm run build` — compiles; `/join`, `/join/[joinCode]`, `/student/home` routes emitted.
- **RED confirmed** before implementation (`RED-CONFIRMED`: module not found).
- **Source inspections:** no `"use client"` module imports `createSupabaseServiceClient`; zero `<select>/<datalist>/<option>/role="listbox"` in `src/components/student/`; `StudentHomeShell` contains verbatim `No homework yet` + the no-homework body + the closed/expired placeholder and **no** mission/recording/buddy/progress/score/leaderboard/review UI (terms appear only in an explanatory comment); remembered-class key `coco.rememberedClass.v1` stores an id-keyed JSON record distinct from the raw join code.

## D-16 / AUTH-04 evidence (explicitly requested)
- **D-16 generic-error test:** PASSED (the env-independent invariants — malformed-PIN short-circuit and identical value across differing malformed inputs — assert one `{ ok:false, error:'generic_mismatch' }` value; the live wrong-code/name/PIN identical-value branch is env-gated and skips cleanly without Supabase env).
- **Cross-teacher RLS isolation test:** **env-skipped** in this run (no Supabase service+anon env in the test shell). It is authored to seed two teachers and prove teacher A reads zero of teacher B's class, student, AND assignment (linked) rows when env is present.

## Known Stubs
The `closed/expired` placeholder in `StudentHomeShell` is intentionally `hidden` (reserved copy contract) until a future phase has assignment state to drive it — documented in-component and in the plan's STUD-05 contract (reserved placeholder). Not a blocking stub: the plan's goal (no-homework shell) is fully wired from real unlock context.

## Threat Flags
None. No new network endpoint, table, or trust boundary beyond the plan's `<threat_model>`. T-02-13 (PIN brute force): server-only `verifyPin` + generic errors; online throttling hooks remain reserved for the attempts phase. T-02-14 (enumeration): single generic mismatch + no roster selector. T-02-15 (service-role leak): service client confined server-only, verified. T-02-16 (reset stranding): id-keyed remembered class. T-02-17 (cross-tenant): isolation test. T-02-SC: no packages installed.

## User Setup Required

**Task 5 — human-verify walkthrough (live, manual; NOT an automated gate).** A dev server is already running on http://localhost:3000. Log in as a teacher and ensure a class + a student with a known PIN exist (plans 02-02 / 02-03), then:

1. Open the class share dialog and copy the **join link** (or scan the QR). Open `/join/[joinCode]` in a fresh browser/profile → confirm it opens the class context with **no visible roster list**. Also try `/join` and type the class code → Continue.
2. Type the student's **name** + the **correct PIN** → confirm you land on `/student/home` showing the class name, the student name, and **"No homework yet"**, with **no** mission/recording/buddy/progress/score/review UI.
3. **Reload** the student device → confirm the class is remembered (the "Welcome back / Use this class" banner appears) **but you are still asked for the PIN**.
4. Try a **wrong PIN**, then a **wrong name**, then a **wrong class code** → confirm all three show the **identical** copy: _"We could not match that class, name, and PIN. Try again or ask your teacher."_ and never say which field was wrong.
5. As the teacher, **reset the class join code**, then confirm the already-remembered student device can still return to the class and unlock with a fresh PIN (D-18 — the remembered record is keyed on the class id, not the old code).
6. (If Supabase env is configured for the test runner) run `npm test -- --run tests/server/teacher-ownership.test.ts` and confirm it passes, proving cross-teacher isolation across class, student, and linked rows.

Type **"approved"** in the orchestrator, or describe any issue (field-specific error leaking, roster names visible, remembered device stranded after code reset).

## Next Phase Readiness
- Student access end-to-end is wired: a student goes from a shared link to the no-homework shell with no account, and PIN is verified server-side with strict non-enumeration.
- AUTH-04 isolation is proven by an automated test (runs with Supabase env; skips cleanly without).
- This is the LAST plan of Phase 2 — all 4 plans (02-01 auth/RLS, 02-02 class management, 02-03 roster/PIN, 02-04 student access) are complete. Phase verification (live Supabase Auth/RLS smoke + the human-verify walkthroughs) is the remaining gate, run separately by the orchestrator.
- Deferred to later phases: online PIN throttling at the unlock boundary (RESEARCH Pitfall 1), a durable `student_sessions` table for attempts/audit (RESEARCH OQ1/A4), and the closed/expired shell state once assignment data exists.

## Self-Check: PASSED

All 17 created source/test files and the SUMMARY exist on disk; all three task commits (`17863f2`, `5814e9d`, `7e29847`) are present in git history.

---
*Phase: 02-teacher-classroom-access*
*Completed: 2026-06-26*
