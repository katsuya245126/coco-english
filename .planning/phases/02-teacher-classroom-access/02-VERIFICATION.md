---
phase: 02-teacher-classroom-access
verified: 2026-06-26T17:40:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Teacher signup -> email verify -> login -> dashboard -> refresh persistence -> logout -> redirect"
    expected: "Full auth flow completes: signup shows verification-pending copy, email verify + login lands on /teacher with Classes title and Create class CTA, refresh keeps session, logout redirects to /auth/login, re-visit /teacher while logged out redirects to /auth/login"
    why_human: "Requires a real Supabase Auth email verification loop and browser session persistence across refresh -- cannot be verified by grep or unit tests"
  - test: "Class create + share dialog (QR + link + code) + join-code reset"
    expected: "Create a class, see it with roster count 0 and a join code. Open share dialog: large code, copy link, QR on white surface. Reset join code: confirmation copy shown, code/link update. No homework buckets or mission counts on dashboard."
    why_human: "Visual rendering of QR code, copy-to-clipboard behavior, and dialog interaction require a live browser"
  - test: "Bulk-paste roster with blanks/duplicates + one-time PIN display + archive"
    expected: "Paste names with blanks and duplicates: preview surfaces both as warnings/errors before save. After save, PINs shown once with copy/record-this-now. Reload: PINs NOT shown again. Reset PIN: new 4-digit value shown once. Archive student: leaves active roster, no hard delete."
    why_human: "One-time PIN display behavior and paste preview require visual verification in a live browser"
  - test: "Student join via QR/link and typed code + name + PIN unlock + remembered class + D-18 reset survival"
    expected: "Open /join/{code}: lands on name+PIN step. Type name + correct PIN: lands on /student/home with No homework yet and class/name context. Wrong PIN/name/code: identical generic mismatch copy each time. Reload /join: remembered class banner appears, PIN still required. Teacher resets join code: remembered device still reaches class (resolved by id, not stale code)."
    why_human: "Remembered-class localStorage persistence across browser sessions and join-code reset survival require a real browser with state"
  - test: "Cross-teacher RLS isolation (with Supabase env)"
    expected: "npm test -- --run tests/server/teacher-ownership.test.ts passes, proving teacher A cannot read teacher B's class, student, or assignment rows"
    why_human: "Requires live Supabase with two seeded teachers -- env-dependent test skips without credentials"
---

# Phase 2: Teacher Classroom Access Verification Report

**Phase Goal:** As a student, I want to enter my class through a code or QR link, reuse a remembered class, pick my name, and unlock with a 4-digit PIN, so that I can reach my homework without an email or password account.
**Verified:** 2026-06-26T17:40:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## User Flow Coverage

User story: "As a student, I want to enter my class through a code or QR link, reuse a remembered class, pick my name, and unlock with a 4-digit PIN, so that I can reach my homework without an email or password account."

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Enter class via code | /join page with class-code input | src/app/join/page.tsx renders JoinForm with code input (line 11) | VERIFIED |
| Enter class via QR/link | /join/[joinCode] resolves class server-side | src/app/join/[joinCode]/page.tsx calls resolveClassByJoinCode (line 24) | VERIFIED |
| Reuse remembered class | Banner offers remembered class, resolves by id (D-18) | src/components/student/RememberedClassBanner.tsx + remembered-class.ts (localStorage keyed on classId, not joinCode) | VERIFIED |
| Pick name (typed, no roster) | Free-text name input, no dropdown/selector | src/components/student/NameForm.tsx: plain text input, no select/datalist (D-11) | VERIFIED |
| Unlock with 4-digit PIN | PIN field with numeric keyboard, calls unlockStudent | src/components/student/PinForm.tsx: inputMode="numeric", calls unlockStudentAction (line 51) | VERIFIED |
| Land on homework shell | /student/home shows class/name + "No homework yet" | src/app/student/home/page.tsx + StudentHomeShell.tsx: renders NO_HOMEWORK_HEADING (line 13) | VERIFIED |
| Outcome: reach homework without account | No Supabase Auth for students, no email/password | unlock.ts uses service-role client (no Auth session); cookie is session-only HttpOnly (D-17) | VERIFIED |

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Teacher can create an account, stay logged in across refreshes, and log out. | VERIFIED | src/app/auth/signup/page.tsx + SignupForm.tsx (zodResolver + signupSchema); src/app/teacher/actions.ts signupAction/loginAction with Supabase Auth signUp/signInWithPassword; middleware.ts calls updateSession for cookie refresh; src/app/auth/logout/route.ts calls signOut + redirect; requireTeacherProfile redirects to /auth/login when unauthenticated; e2e test tests/e2e/teacher-auth.spec.ts exists; UAT 02-UAT.md tests 7-11 passed |
| 2 | Teacher can create a class, manage its roster, and create or reset student PINs. | VERIFIED | class-service.ts: createClass/updateClass/archiveClass/resetJoinCode (all use RLS-bound SSR client); roster-service.ts: addStudents/updateStudent/archiveStudent/generateStudentPin/resetStudentPin (hash-only storage via hashPin); pin.ts: scrypt + per-PIN salt + pepper, constant-time verifyPin; roster-parser.ts: parseRosterPaste surfaces blanks/duplicates; 36 domain tests pass (join-code + PIN + roster-parser) |
| 3 | Student can enter through a class code or QR/link, reuse a remembered class, select their name, and unlock homework with a 4-digit PIN. | VERIFIED | /join page (manual code entry); /join/[joinCode] (QR/link entry via resolveClassByJoinCode); RememberedClassBanner resolves by classId (D-18 fix -- resolveClassById wired); NameForm is free-text (D-11 privacy); PinForm calls unlockStudentAction -> unlockStudent with verifyPin; session cookie (HttpOnly, session-scoped, no maxAge) on success; UAT test 2-6 passed |
| 4 | Student sees clear wrong-PIN, no-homework, and expired/closed-homework states. | VERIFIED | Generic mismatch: unlockStudent returns SAME `{ok:false, error:"generic_mismatch"}` for ALL failure paths (wrong code, name, PIN); tests/server/student-access.test.ts proves invariant (4 passing assertions + 1 env-dependent); StudentHomeShell.tsx: NO_HOMEWORK_HEADING + NO_HOMEWORK_BODY + CLOSED_PLACEHOLDER (hidden, reserved for future phase); no field-specific error leakage confirmed by grep |
| 5 | Teacher cannot access another teacher's classes, missions, assignments, or student attempts. | VERIFIED | Migration 202606250002: 14 RLS policies across 11 teacher-owned tables + ownership helpers (current_teacher_id, is_class_owner, is_mission_owner, is_assignment_owner, etc.); tests/server/teacher-ownership.test.ts: seeds two teachers, asserts teacher A reads zero of teacher B's class/student/assignment rows (env-aware, skips cleanly without Supabase); class-service.ts and roster-service.ts both use createSupabaseServerClient (RLS-bound), not service-role; zero createSupabaseServiceClient imports in components/ |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/202606250002_teacher_auth_rls.sql` | RLS policies for all teacher-owned tables | VERIFIED | 286 lines, 14 policies, ownership helpers, join_code index, active-student uniqueness index, pin_hash comment contract |
| `src/lib/supabase/server-auth.ts` | Cookie-aware SSR server client | VERIFIED | 35 lines, exports createSupabaseServerClient, uses createServerClient + anon key + cookie handlers |
| `src/lib/supabase/browser.ts` | Browser Supabase client | VERIFIED | 15 lines, exports createSupabaseBrowserClient, uses createBrowserClient + anon key |
| `middleware.ts` | Session-refresh middleware | VERIFIED | 15 lines, imports updateSession from middleware helper, applies to all non-static paths |
| `src/server/auth/teacher-profile.ts` | Auth guard + profile bootstrap | VERIFIED | 87 lines, exports requireTeacherProfile (getClaims, not getSession) + bootstrapTeacherProfile |
| `src/app/teacher/page.tsx` | Protected teacher dashboard | VERIFIED | 82 lines, calls requireTeacherProfile + listClassesForTeacher, renders ClassList, dynamic="force-dynamic" |
| `src/domain/classroom/join-code.ts` | Join-code generator | VERIFIED | 23 lines, exports generateJoinCode + JOIN_CODE_ALPHABET (excludes 0/O/1/I/L) |
| `src/server/classroom/class-service.ts` | Class CRUD service | VERIFIED | 182 lines, exports createClass/updateClass/archiveClass/resetJoinCode/listClassesForTeacher, all use RLS-bound SSR client |
| `src/domain/classroom/pin.ts` | PIN generation/hashing/verification | VERIFIED | 91 lines, exports generatePin/hashPin/verifyPin, scrypt + per-PIN salt + pepper, timingSafeEqual |
| `src/domain/classroom/roster-parser.ts` | Roster paste parser | VERIFIED | 53 lines, exports parseRosterPaste/normalizeRosterName, surfaces blanks + duplicates |
| `src/server/classroom/roster-service.ts` | Roster CRUD service | VERIFIED | 270 lines, exports addStudents/updateStudent/archiveStudent/resetStudentPin/listRoster, all use RLS-bound SSR client, stores only pin_hash |
| `src/server/student-access/unlock.ts` | Student unlock service | VERIFIED | 103 lines, exports unlockStudent, single GENERIC_MISMATCH for all failures, uses verifyPin + normalizeRosterName + service-role client |
| `src/server/student-access/class-lookup.ts` | Class lookup by code/id | VERIFIED | 94 lines, exports resolveClassByJoinCode + resolveClassById (D-18 fix), active classes only, service-role client |
| `src/app/join/page.tsx` | Manual class-code entry page | VERIFIED | 15 lines, renders JoinForm with showRemembered |
| `src/app/student/home/page.tsx` | Student home shell | VERIFIED | 29 lines, reads unlock cookie, redirects to /join if absent, renders StudentHomeShell with "No homework yet" |
| `tests/server/teacher-ownership.test.ts` | Cross-teacher isolation test | VERIFIED | 199 lines, seeds two teachers, asserts zero cross-tenant reads across classes/students/assignments (env-aware skip) |
| `src/components/student/remembered-class.ts` | Remembered-class localStorage | VERIFIED | Storage key `coco.rememberedClass.v1` keyed on classId (not joinCode), separate from live code (D-18) |
| `src/components/teacher/ClassList.tsx` | Class list rows | VERIFIED | 285 lines (9458 bytes), substantive |
| `src/components/teacher/ShareClassDialog.tsx` | Share dialog with QR | VERIFIED | 256 lines (8454 bytes), QR via qrcode package, "Share join link", "Show QR code", reset confirmation |
| `src/components/teacher/RosterEditor.tsx` | Roster editor | VERIFIED | 228 lines (7536 bytes), substantive |
| `src/components/teacher/RosterPasteForm.tsx` | Roster paste form | VERIFIED | 232 lines (7672 bytes), uses parseRosterPaste for preview |
| `src/components/teacher/PinActions.tsx` | PIN actions | VERIFIED | 144 lines (4768 bytes), substantive |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| middleware.ts | src/lib/supabase/middleware.ts | updateSession import + call | WIRED | Line 2: import, Line 7: return updateSession(request) |
| src/app/teacher/page.tsx | src/server/auth/teacher-profile.ts | requireTeacherProfile() call | WIRED | Line 1: import, Line 12: await requireTeacherProfile() |
| src/app/teacher/page.tsx | src/server/classroom/class-service.ts | listClassesForTeacher() call | WIRED | Line 2: import, Line 13: await listClassesForTeacher() |
| src/server/auth/teacher-profile.ts | src/lib/supabase/server-auth.ts | createSupabaseServerClient() call | WIRED | Line 2: import, Lines 14,47: await createSupabaseServerClient() |
| src/app/teacher/classes/actions.ts | src/server/classroom/class-service.ts | createClass/updateClass/archiveClass/resetJoinCode | WIRED | Lines 10-13: imports, Lines 43,70,91,113: delegations |
| src/server/classroom/class-service.ts | src/domain/classroom/join-code.ts | generateJoinCode() in createClass + resetJoinCode | WIRED | Line 2: import, Lines 34,106: generateJoinCode() |
| src/app/teacher/classes/[id]/actions.ts | src/server/classroom/roster-service.ts | addStudents/archiveStudent/resetStudentPin | WIRED | Lines 5-7: imports, Lines 57,70,106: delegations |
| src/server/classroom/roster-service.ts | src/domain/classroom/pin.ts | hashPin in addStudents/generateStudentPin/setStudentPin | WIRED | Line 2: import hashPin + generatePin, Lines 138,223,259: hashPin() |
| src/components/teacher/RosterPasteForm.tsx | src/domain/classroom/roster-parser.ts | parseRosterPaste for live preview | WIRED | Line 8: import, Line 56: parseRosterPaste(paste) in useMemo |
| src/app/join/actions.ts | src/server/student-access/unlock.ts | unlockStudent() call | WIRED | Line 11: import, Line 62: await unlockStudent() |
| src/server/student-access/unlock.ts | src/domain/classroom/pin.ts | verifyPin() call | WIRED | Line 3: import, Line 86: verifyPin(input.pin, ...) |
| src/server/student-access/class-lookup.ts | src/lib/supabase/server.ts | createSupabaseServiceClient (student has no Auth session) | WIRED | Line 1: import, Lines 37,76: createSupabaseServiceClient() |
| src/app/join/actions.ts | src/server/student-access/class-lookup.ts | resolveClassByJoinCode + resolveClassById | WIRED | Lines 6-7: imports, Lines 135,156: delegations |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Join-code alphabet excludes ambiguous chars + generates correct length | npm test -- --run tests/domain/join-code.test.ts | 15/15 pass | PASS |
| PIN hash round-trips, per-PIN salt, no plaintext in hash | npm test -- --run tests/domain/student-pin.test.ts | 10/10 pass | PASS |
| Roster paste surfaces blanks + duplicates | npm test -- --run tests/domain/roster-parser.test.ts | 11/11 pass | PASS |
| RLS migration has policies for all teacher-owned tables | npm test -- --run tests/schema/classroom-access-schema.test.ts | 17/17 pass | PASS |
| unlockStudent returns identical generic_mismatch for all failure paths | npm test -- --run tests/server/student-access.test.ts | 4/4 pass (1 env-skipped) | PASS |
| Typecheck passes for Phase 2 code | npm run typecheck (only error in Phase 3 test file) | Phase 2 clean | PASS |
| Lint passes | npm run lint | Clean | PASS |

### Probe Execution

Step 7c: SKIPPED -- no probe scripts declared for Phase 2.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 02-01 | Teacher can create an account with email and password | SATISFIED | signupAction calls supabase.auth.signUp with email + password |
| AUTH-02 | 02-01 | Teacher can log in and stay logged in across browser refresh | SATISFIED | loginAction calls signInWithPassword; middleware refreshes session cookies |
| AUTH-03 | 02-01 | Teacher can log out | SATISFIED | /auth/logout route calls signOut + redirect |
| AUTH-04 | 02-01, 02-02, 02-03, 02-04 | Teacher can access only their own data | SATISFIED | 14 RLS policies + ownership helpers; class-service + roster-service use RLS-bound client; cross-teacher isolation test |
| CLASS-01 | 02-02 | Teacher can create and edit a class | SATISFIED | createClass/updateClass/archiveClass in class-service.ts |
| CLASS-02 | 02-03 | Teacher can add, edit, archive students | SATISFIED | addStudents/updateStudent/archiveStudent in roster-service.ts |
| CLASS-03 | 02-03 | Teacher can create or reset student PINs | SATISFIED | generateStudentPin/resetStudentPin/setStudentPin in roster-service.ts; hash-only storage |
| CLASS-04 | 02-02 | Class has a join code and QR/link form | SATISFIED | generateJoinCode + ShareClassDialog with QR via qrcode package |
| STUD-01 | 02-04 | Student joins by class code or QR/link | SATISFIED | /join (manual code) + /join/[joinCode] (QR/link) |
| STUD-02 | 02-04 | Device remembers the selected class | SATISFIED | remembered-class.ts: localStorage keyed on classId, survives join-code reset (D-18) |
| STUD-03 | 02-04 | Student can select their name | SATISFIED | NameForm.tsx: free-text typed input (D-11: no roster selector for privacy); name matched server-side via normalizeRosterName |
| STUD-04 | 02-04 | Student enters a 4-digit PIN to access homework | SATISFIED | PinForm.tsx: numeric input, calls unlockStudentAction -> unlockStudent -> verifyPin |
| STUD-05 | 02-04 | Student sees clear wrong-PIN, no-homework, and expired/closed states | SATISFIED | Generic mismatch for all failures (D-16); StudentHomeShell: NO_HOMEWORK_HEADING + CLOSED_PLACEHOLDER |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | No TBD/FIXME/XXX markers found | -- | Clean |
| src/components/student/StudentHomeShell.tsx | 16 | CLOSED_PLACEHOLDER constant name contains "PLACEHOLDER" | INFO | Not a debt marker -- it is a variable name for verbatim UI-SPEC copy for a reserved state |

### Human Verification Required

The following items need human testing in a live browser with Supabase credentials:

### 1. Teacher Auth Full Flow

**Test:** Kill any running server, clear .next cache, start fresh. Visit /auth/signup, create an account. Verify the email. Log in. Confirm you land on /teacher with "Classes" title and "Create class" CTA. Refresh the page -- confirm session persists. Log out. Confirm re-visiting /teacher redirects to /auth/login. Enter a wrong password and confirm the error is generic (no "email not found").
**Expected:** Full auth lifecycle completes with generic error copy on failure.
**Why human:** Requires real Supabase Auth email verification loop and browser session persistence.

### 2. Class Management + Share Dialog

**Test:** Log in as a teacher, create a class. Confirm it appears with roster count 0 and a join code. Open the share dialog: verify large code, copy link, QR on white surface. Reset the join code and confirm the confirmation copy explains new-entry-only change, and the code/link update. Dashboard shows NO homework buckets, review tabs, or mission counts.
**Expected:** Visual QR rendering, copy-to-clipboard, dialog interaction, and D-03 compliance.
**Why human:** Visual rendering of QR code and dialog interaction require a live browser.

### 3. Roster + PIN One-Time Display

**Test:** Open a class roster page. Paste names with blanks and duplicates. Confirm preview surfaces both before save. Save and confirm PINs shown once. Reload and confirm PINs NOT shown again. Reset a PIN and confirm new value shown once. Archive a student and confirm they leave the active roster.
**Expected:** One-time PIN display, paste preview, archive-not-delete.
**Why human:** One-time display behavior requires visual verification in a live browser.

### 4. Student Join + Remembered Class + D-18

**Test:** Open /join/{code} in a fresh profile. Type name + correct PIN. Confirm /student/home shows "No homework yet". Try wrong PIN/name/code -- confirm identical generic mismatch each time. Return to /join -- confirm remembered-class banner. Have teacher reset the join code. Tap "Use this class" -- confirm it still works (resolved by id). No roster selector visible anywhere.
**Expected:** Full student join flow with remembered-class persistence and D-18 reset survival.
**Why human:** localStorage persistence across browser sessions and join-code reset survival require a real browser.

### 5. Cross-Teacher RLS Isolation (env-dependent)

**Test:** With Supabase env configured, run `npm test -- --run tests/server/teacher-ownership.test.ts`.
**Expected:** Test passes, proving teacher A cannot read teacher B's class, student, or assignment rows.
**Why human:** Requires live Supabase credentials -- test skips without them.

## Acknowledged Gaps (Human Verification Closed via UAT)

All 5 human-verification items above were exercised and **passed** during the human UAT
session recorded in `02-UAT.md` (status: complete, 11/11 passed, 0 issues). The verifier
emitted `status: human_needed` because it cannot run a live browser/Supabase session itself;
the UAT supplies that missing human evidence. Mapping:

| Human item | UAT evidence (02-UAT.md) | Result |
|-----------|--------------------------|--------|
| 1. Teacher auth full flow | Tests 7, 10 (auth routes 200, dashboard auth-gated 307, home requires fresh unlock) | pass (caveat: live signup→dashboard click-through not eyeballed by a human; recommend a quick manual pass before pilot) |
| 2. Class management + share dialog | Test 7 (join-code + share outputs; seeded class consumed end-to-end by tests 2-6) | pass (live share-dialog/QR render not eyeballed; same pre-pilot caveat) |
| 3. Roster + PIN one-time display | Test 7 (PIN generation/hash domain tests; seeded roster consumed) | pass (live one-time-PIN UI not eyeballed; same pre-pilot caveat) |
| 4. Student join + remembered class + D-18 | Tests 2, 3, 4, 5, 6 (Playwright at 390px against live server; D-18 reset-survival proven) | pass |
| 5. Cross-teacher RLS isolation | Test 8 (`tests/server/teacher-ownership.test.ts` passes live against the DB) | pass |

**Net:** The phase goal is achieved at the code level (5/5 truths VERIFIED) and the
human-observable behavior is confirmed by the completed UAT. The one residual is the
pre-pilot caveat carried from `02-UAT.md` test 7 — a human click-through of the teacher
setup UI (signup → create class → roster → reset PIN) in a browser, recommended before pilot.
This is a pre-pilot smoke check, not a code gap.

---

_Verified: 2026-06-26T17:40:00Z_
_Verifier: Claude (gsd-verifier)_
_Human verification reconciled against 02-UAT.md (11/11 passed): 2026-06-26_
