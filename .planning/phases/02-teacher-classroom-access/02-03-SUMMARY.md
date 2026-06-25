---
phase: 02-teacher-classroom-access
plan: 03
subsystem: auth
tags: [supabase, rls, nextjs, server-actions, node-crypto, scrypt, zod, pin, roster]

# Dependency graph
requires:
  - phase: 02-01-teacher-auth-rls
    provides: "RLS-bound SSR client (createSupabaseServerClient), requireTeacherProfile guard, students table RLS + active-name partial unique index, getSupabaseEnv().pinPepper, GRANTs to authenticated (migration 0003)"
provides:
  - "Pure PIN helpers: generatePin (4-digit), hashPin (per-PIN salt + server-only pepper, scrypt), verifyPin (constant-time) — only pin_hash persisted, cleartext returned once"
  - "Roster parser: normalizeRosterName (trim + collapse whitespace + case-fold) and parseRosterPaste (blank/duplicate surfacing, never silently dropped)"
  - "Roster service (RLS-bound, user client): addStudents (bulk), updateStudent, archiveStudent, generate/reset/setStudentPin, listRoster"
  - "/teacher/classes/[id] roster-management page (requireTeacherProfile-gated) + roster server actions"
  - "RosterEditor / RosterPasteForm / PinActions UI: Paste names + Add one modes, live blank/duplicate preview, one-time PIN display, archive-not-delete"
  - "roster-schemas.ts (studentSchema, bulkRosterSchema, pinSchema)"
affects: [02-04-student-access, teacher-classes, student-pin-unlock, cross-teacher-isolation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Student PIN storage: node:crypto scrypt with per-PIN random salt + server-only PIN_HASH_PEPPER; stored format s1:<salt>:<key>; verify is timingSafeEqual and never throws"
    - "One-time secret display: server returns cleartext PIN exactly once from generate/reset/set; listRoster selects only PIN-free public columns (id, display_name)"
    - "Normalized-name persistence: store normalizeRosterName output as students.display_name so the DB lower(display_name) active-name unique index matches the app-level dedup key exactly"
    - "RLS-bound roster mutations via createSupabaseServerClient (user client) plus an explicit assertOwnedClass check; service-role client used nowhere in this slice"

key-files:
  created:
    - src/domain/classroom/pin.ts
    - src/domain/classroom/roster-parser.ts
    - src/domain/classroom/roster-schemas.ts
    - src/server/classroom/roster-service.ts
    - src/app/teacher/classes/[id]/page.tsx
    - src/app/teacher/classes/[id]/actions.ts
    - src/components/teacher/RosterEditor.tsx
    - src/components/teacher/RosterPasteForm.tsx
    - src/components/teacher/PinActions.tsx
    - tests/domain/student-pin.test.ts
    - tests/domain/roster-parser.test.ts
    - tests/e2e/teacher-roster.spec.ts
  modified: []

key-decisions:
  - "Persist normalizeRosterName output as students.display_name so the existing 0002 active-name unique index (lower(display_name)) stays consistent with the app-level dedup key; collapsing inner whitespace at write time keeps DB and app dedup in lockstep."
  - "Used node:crypto scrypt (not bcrypt/argon2) per research A1 — a 4-digit app-owned PIN's brute-force resistance comes from online throttling at the student-access boundary (a later plan), not hash cost; no new package installed."
  - "Dropped the `import \"server-only\"` guard from roster-service because the package is not installed (and installing is excluded from auto-fix Rule 3); the module is server-only by construction (node:crypto + SSR cookie client) and is imported only by server actions/components."
  - "addStudents reports names already on the active roster as skippedExisting instead of letting the DB unique index throw mid-batch, so a partial paste never aborts the whole add."

patterns-established:
  - "Server-only PIN crypto module pattern: node:crypto + pepper read from process.env at hash time, constant-time verify that returns false (never throws) on malformed stored values."
  - "Live paste-preview pattern: client re-runs the same pure parseRosterPaste/normalizeRosterName domain functions used server-side to surface blanks/duplicates before submit."

requirements-completed: [CLASS-02, CLASS-03, AUTH-04]

# Metrics
duration: 7min
completed: 2026-06-25
status: complete
---

# Phase 02 Plan 03: Roster + PIN Slice Summary

**Teacher roster management — bulk paste (with blank/duplicate surfacing), add/edit/archive students, and auto-generated 4-digit PINs hashed with node:crypto scrypt + per-PIN salt + a server-only pepper — all through the RLS-bound SSR user client, with cleartext PINs shown exactly once.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-25T15:40:33Z
- **Completed:** 2026-06-25T15:47:45Z
- **Tasks:** 2 of 3 executed automatically (Task 3 is a human-verify checkpoint deferred to the developer — see User Setup Required)
- **Files modified:** 12 created, 0 modified (shared files left untouched for the parallel 02-02 agent)

## Accomplishments
- **PIN security (CLASS-03, D-06/D-07):** `generatePin` (zero-padded 4-digit via `crypto.randomInt`), `hashPin` (per-PIN random salt + server-only `PIN_HASH_PEPPER`, scrypt, format `s1:<salt>:<key>`), `verifyPin` (constant-time `timingSafeEqual`, never throws). Only `pin_hash` is ever written; cleartext is returned exactly once and `listRoster` selects no PIN material.
- **Roster parsing (CLASS-02, D-05):** `normalizeRosterName` (trim + collapse inner whitespace + case-fold) and `parseRosterPaste` (newline split, blank lines counted, duplicate normalized names reported as raw offending names) — nothing silently discarded.
- **Roster service (AUTH-04 roster side, D-08, D-15):** `addStudents`/`updateStudent`/`archiveStudent`/`generateStudentPin`/`resetStudentPin`/`setStudentPin`/`listRoster` on the RLS-bound user client plus an explicit `assertOwnedClass` ownership check; archive is a soft `archived_at` set (history preserved, never a hard delete).
- **UI:** `/teacher/classes/[id]` server page (requireTeacherProfile-gated, RLS-loaded class → `notFound` if not owned), `RosterEditor` (Paste names / Add one segmented control + active roster table), `RosterPasteForm` (live preview surfacing blanks/duplicates before save, one-time PIN table after save), `PinActions` (Reset PIN / Change PIN with one-time PIN display, copy, and a "record this now" warning). UI-SPEC copy used verbatim ("Add students", "No students yet", "Reset PIN", "Change PIN").

## Task Commits

1. **Task 1: Failing PIN + roster-parser tests (TDD RED)** - `223a26c` (test)
2. **Task 2: PIN helpers, roster parser, roster service, roster-management UI (GREEN)** - `26438c2` (feat)
3. **Task 3: Human-verify roster management + PIN generation/reset** - deferred checkpoint (see User Setup Required)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP/REQUIREMENTS commit)_

## Files Created/Modified
See frontmatter `key-files`. Highlights:
- `src/domain/classroom/pin.ts` - server-only 4-digit PIN gen/hash/verify (node:crypto scrypt + pepper).
- `src/domain/classroom/roster-parser.ts` - `normalizeRosterName` + `parseRosterPaste` (blank/duplicate surfacing).
- `src/server/classroom/roster-service.ts` - RLS-bound roster CRUD + PIN lifecycle; only `pin_hash` persisted.
- `src/app/teacher/classes/[id]/{page,actions}.tsx/.ts` - roster page + server actions.
- `src/components/teacher/{RosterEditor,RosterPasteForm,PinActions}.tsx` - roster + PIN UI.

## Decisions Made
See frontmatter `key-decisions`. Most material: persisting the normalized name as `display_name` so the existing `lower(display_name)` active-name unique index and the app-level dedup key stay consistent; using node:crypto scrypt rather than adding a hashing package (research A1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed `import "server-only"` from roster-service**
- **Found during:** Task 2 (writing the roster service)
- **Issue:** The `server-only` package is not installed in this project, so the import would fail the build. Installing a package is explicitly excluded from auto-fix Rule 3.
- **Fix:** Removed the import. The module is server-only by construction (uses `node:crypto` and the SSR cookie client) and is imported only by server actions/server components — never by a client component.
- **Files modified:** src/server/classroom/roster-service.ts
- **Verification:** `npm run build` and `npm run typecheck` pass; `grep -rl "PIN_HASH_PEPPER" src/components` returns nothing.
- **Committed in:** `26438c2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking). No bugs (Rule 1), no missing-critical (Rule 2), no architectural (Rule 4).
**Impact on plan:** The single deviation avoided a build break without weakening the server-only guarantee (no plaintext PIN or pepper can reach the client). No scope creep — no behavior added beyond the plan.

## Issues Encountered
None. No new migration was required: the `students` table already has RLS policies (migration 0002) and `authenticated` CRUD grants (migration 0003), and the active-name partial unique index already exists. The threat model's T-02-SC ("no new packages installed") held — only node:crypto was used.

## Verification Results (automated gates — all PASS)
- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test -- --run tests/domain/student-pin.test.ts tests/domain/roster-parser.test.ts` — 21 passed (round-trip verify, per-PIN salt, no-plaintext-in-hash, blank/duplicate surfacing, name normalization).
- `npm test -- --run` (full suite) — 95 passed, 1 skipped (env-gated DB smoke).
- `npm run build` — compiles; `/teacher/classes/[id]` route emitted.
- Source inspections: roster-service does NOT import `createSupabaseServiceClient`; `grep -rl "PIN_HASH_PEPPER" src/components` → nothing; every students write sets only `pin_hash` (no plaintext `pin:` column); `listRoster` filters `archived_at is null` and selects only `id, display_name`; page calls `requireTeacherProfile`; RosterPasteForm calls `parseRosterPaste`.

## User Setup Required
**Confirm `PIN_HASH_PEPPER` is set in `.env.local`** (a 64-hex-char server-only secret). It is reported already present; `hashPin` throws if it is missing, so verify before the live walkthrough.

**Run the Task 3 human-verify walkthrough (live, manual — not an automated gate):**
1. `npm run dev` (a dev server is already running on http://localhost:3000), log in as a teacher, open a class, go to its roster page (`/teacher/classes/[id]`).
2. Use **Paste names**: paste several newline-separated names including a blank line and a duplicate. Confirm the preview surfaces the blank and duplicate as warnings (Blank line — skipped / Duplicate — skipped) and does NOT silently drop them.
3. Save. Confirm students appear with auto-generated PINs shown once (copy + "record this now").
4. Add one student via **Add one** and confirm a PIN is generated.
5. **Reset PIN** for a student → new 4-digit value shown once; reload → cleartext is NOT shown again (only the Reset/Change actions remain).
6. **Archive student** → they leave the active roster while history is preserved (no hard delete).

## Next Phase Readiness
- PIN helpers (`hashPin`/`verifyPin`), `normalizeRosterName`, and the roster service are ready for plan 02-04's student typed-name + PIN unlock flow (verifyPin + normalized-name lookup at the student-access boundary).
- Online PIN throttling (research Pitfall 1) is intentionally deferred to the student-access plan where the verification boundary lives.
- No code blockers for 02-04. Cross-teacher roster isolation is enforced by RLS + `assertOwnedClass`; full cross-teacher integration verification remains scheduled for 02-04.

## Self-Check: PASSED

All 12 created source/test files and the SUMMARY exist on disk; both task commits (`223a26c`, `26438c2`) are present in git history.

---
*Phase: 02-teacher-classroom-access*
*Completed: 2026-06-25*
