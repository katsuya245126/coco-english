---
phase: 02-teacher-classroom-access
plan: 02
subsystem: classroom
tags: [classes, join-code, qrcode, rls, nextjs, server-actions, zod]

# Dependency graph
requires:
  - phase: 02-teacher-classroom-access
    plan: 01
    provides: "RLS-bound SSR client (createSupabaseServerClient), requireTeacherProfile guard, classes table + join_code/archived_at columns, RLS policies, authenticated GRANTs (migration 0003)"
provides:
  - "generateJoinCode + JOIN_CODE_ALPHABET (non-ambiguous, crypto-backed join-code generator)"
  - "class-service: createClass, updateClass, archiveClass, resetJoinCode, listClassesForTeacher (RLS-bound, no service-role)"
  - "createClassSchema, updateClassSchema (Zod)"
  - "class server actions (create/edit/archive/reset) delegating to the service"
  - "ClassList, ClassForm, ShareClassDialog teacher UI (join link + QR + D-18 reset)"
  - "Dashboard wired to listClassesForTeacher"
  - "test:classes:e2e npm script + env-aware class-management e2e spec"
affects: [02-03-roster-pin, 02-04-student-access, teacher-classes]

# Tech tracking
tech-stack:
  added: ["qrcode@^1.5.4", "@types/qrcode@^1.5.6 (dev)"]
  patterns:
    - "Pure crypto-backed code generator with a non-ambiguous alphabet (0/O/1/I/L excluded)"
    - "Regenerate-and-retry on join_code unique violation (PostgREST error code 23505)"
    - "Roster count via two queries (classes + active students tallied in JS) to avoid PostgREST embed against empty Relationships types"
    - "Server actions return serializable {ok,error} results; generic non-enumerating failure copy"
    - "Reset affects join_code only (D-18) — no row deletion of class/students"

key-files:
  created:
    - src/domain/classroom/join-code.ts
    - src/server/classroom/class-service.ts
    - src/app/teacher/classes/actions.ts
    - src/components/teacher/ClassList.tsx
    - src/components/teacher/ClassForm.tsx
    - src/components/teacher/ShareClassDialog.tsx
    - tests/domain/join-code.test.ts
    - tests/e2e/teacher-classes.spec.ts
  modified:
    - src/domain/classroom/schemas.ts
    - src/app/teacher/page.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Roster count computed with two RLS-bound queries (classes, then active students) and tallied in JS, rather than a PostgREST embedded count — the typed Database declares empty Relationships (per 02-01-SUMMARY), so an embedded count would resolve to never."
  - "createClass inserts data_mode: 'real' (required NOT NULL column on classes); demo records remain the foundation-smoke service's concern."
  - "Share dialog builds the join link from window.location.origin + /join/{code}; the /join route itself is owned by plan 02-04, this plan only produces the shareable URL/QR."
  - "qrcode installed at 1.5.4 after provenance verification (Task 1 blocking gate) — maintainer soldair, repo github.com/soldair/node-qrcode, no postinstall script, not present in any npm-audit advisory path."

requirements-completed: [CLASS-01, CLASS-04, AUTH-04]

# Metrics
duration: ~14min
completed: 2026-06-26
status: complete
---

# Phase 02 Plan 02: Teacher Class Management (Create / Share / Reset) Summary

**Teacher class-management vertical slice: a logged-in teacher creates/edits/archives a class, sees it in the dashboard list with roster count and join code, and shares it via a join code, copy-link, and QR dialog with a teacher-only join-code reset that affects new entry only (D-18) — all reads/writes through the RLS-bound SSR user client so a teacher only ever touches their own classes.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 3 of 4 executed automatically. Task 1 (package legitimacy gate) was satisfied by provenance verification + install per the developer's standing authorization for this wave; Task 4 is a human-verify checkpoint surfaced to the developer (see User Setup Required) — automated gates were the completion gate per the execution brief.
- **Files:** 8 created, 4 modified.

## Accomplishments
- `generateJoinCode` + `JOIN_CODE_ALPHABET`: pure, crypto-backed, non-ambiguous (excludes 0/O/1/I/L), default length 6 over a 31-char alphabet (~2.7e8 space).
- `class-service.ts`: `createClass` (generate + insert + regenerate-and-retry on `join_code` collision), `updateClass` (rename), `archiveClass` (stamp `archived_at`), `resetJoinCode` (regenerate code only — no delete), `listClassesForTeacher` (own non-archived classes + active roster count). All via `createSupabaseServerClient` (RLS); zero service-role usage.
- Class server actions (`createClassAction`/`updateClassAction`/`archiveClassAction`/`resetJoinCodeAction`) gate on `requireTeacherProfile`, validate with Zod, delegate to the service, and `revalidatePath('/teacher')`.
- Dashboard now renders `ClassList` from `listClassesForTeacher` (empty-state preserved). No homework buckets / review tabs / mission counts / completion charts (D-03).
- `ClassList` rows (name, roster count link, join code, Share join link, Show QR code, Edit, Archive with stable row height); `ClassForm` create/rename modal; `ShareClassDialog` (large join code, copy link, QR via `qrcode.toDataURL` on a white surface, gated Reset join code with verbatim D-18 confirmation copy).
- `qrcode@1.5.4` + `@types/qrcode` installed after provenance verification.

## Task Commits
1. **Task 2: Failing join-code + class-management tests (TDD RED)** — `1d57c0b` (test)
2. **Task 3: Join-code generator, class service, and class-management UI (GREEN)** — `7294d50` (feat)

_(Task 1 = package gate, no code commit. Task 4 = human-verify checkpoint, deferred to developer.)_

## Verification — Automated Gates (all passed)
- `npm test -- --run tests/domain/join-code.test.ts` — 15/15 GREEN (alphabet exclusion of 0/O/1/I/L, alphabet-only membership, uniqueness ratio >0.99 over 2000 samples).
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- Full `npm test -- --run` — 95 passed, 1 skipped (env-gated), no regressions.
- RED confirmed before implementation (`RED-CONFIRMED`).
- Source inspection: service imports `@/lib/supabase/server-auth`, **0** references to the service-role client; `listClassesForTeacher` filters `archived_at` + returns `rosterCount`; `resetJoinCode` has **0** `.delete(`; dashboard has **0** D-03 prohibited labels; `ShareClassDialog` contains verbatim `Share join link`, `Show QR code`, and the D-18 reset-confirmation copy.

## Migration / DB
- **No new migration.** This plan operates only on the existing `classes` table, which already has `select/insert/update/delete` granted to `authenticated` by migration `202606250003_grant_authenticated_privileges.sql` (Wave 1). No new table/view was introduced, so no new GRANT was required and there was nothing to `supabase db push`.

## Deviations from Plan
None — plan executed as written. (No bugs, missing-critical, blocking, or architectural deviations.)

Concurrency note: plan 02-03 (roster/PIN) was being written into the same `src/` tree in parallel during execution. Its files (`src/domain/classroom/pin.ts`, `roster-parser.ts`, `roster-schemas.ts`, `src/server/classroom/roster-service.ts`, `src/components/teacher/{PinActions,RosterEditor,RosterPasteForm}.tsx`, `src/app/teacher/classes/[id]/`, `tests/e2e/teacher-roster.spec.ts`) were left untouched and unstaged; only this plan's 9 files were committed (staged individually, never `git add .`).

## Known Stubs
None. The `/teacher/classes/[id]` roster link in `ClassList` points to the route owned by plan 02-03 (explicitly out of scope here per the plan's `artifacts_this_phase_produces`).

## Threat Flags
None. No new network endpoint, auth path, or schema surface beyond the plan's `<threat_model>`. T-02-08 (join-code collision DoS) is mitigated by regenerate-and-retry; T-02-06 (IDOR) is mitigated by the RLS-bound client + `requireTeacherProfile`; T-02-SC (qrcode supply chain) was gated and verified before install.

## User Setup Required
1. **Confirm `qrcode` provenance (Task 1 advisory):** I installed `qrcode@1.5.4` and `@types/qrcode@1.5.6` after verifying registry metadata (maintainer `soldair`, repo `github.com/soldair/node-qrcode`, no `postinstall`/`install` script, not present in any `npm audit` advisory path). This matches the 02-RESEARCH Package Legitimacy Audit. Please confirm the version/provenance is acceptable. To re-verify: `npm view qrcode version maintainers repository.url scripts`.
2. **Run the Task 4 human-verify walkthrough** (`npm run dev`, log in as a teacher):
   - Create class → appears in list with roster count (0) and a join code.
   - Open share dialog → join code shown in large readable chars; "Share join link" copies a `/join/<code>` link; "Show QR code" renders a QR on a white surface.
   - Reset the join code from the dialog footer → confirmation explains new-entry changes while remembered devices remain valid; code/link updates.
   - Edit class name → list updates. Archive class → drops from the active list.
   - Confirm the dashboard shows NO homework buckets / review tabs / mission counts / completion charts.

## Pre-existing (out of scope) note
`npm audit` reports 7 vulnerabilities (next, vitest/vite/esbuild, postcss) — all pre-existing dev/build-toolchain advisories, none involving `qrcode`. Left untouched per scope boundary.

## Self-Check: PASSED
All 8 created files exist on disk; both task commits (`1d57c0b`, `7294d50`) are present in git history. (Verification appended below.)
