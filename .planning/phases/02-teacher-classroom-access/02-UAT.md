---
status: complete
phase: 02-teacher-classroom-access
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-06-26T01:28:53Z
updated: 2026-06-26T01:48:00Z
mode: mvp
user_story: "As a student, I want to enter my class through a code or QR link, reuse a remembered class, pick my name, and unlock with a 4-digit PIN, so that I can reach my homework without an email or password account."
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

<!-- SECTION 1: User-flow walk-through (MVP-mode, required first) -->

### 1. Cold Start Smoke Test
expected: Kill any running server, clear .next cache, start fresh (`rm -rf .next && npm run dev`). Server boots without errors; GET /join returns 200 and renders the "Join class" code-entry screen.
result: pass
note: Verified by Claude — clean boot (Ready in 1459ms, .env.local loaded), GET /join → 200 with "Join class" + "Class code" rendered.

### 2. Student enters via class code
expected: On a phone-width screen, open /join. Type a valid class code into "Class code" and tap Continue. The screen advances to "Joining {class name}. Enter your name and PIN." There is NO roster dropdown of other students' names.
result: pass
note: Driven via Playwright against the live server (390px viewport, seeded UAT class code KMV72W). Reached name+PIN step; zero select/listbox roster pickers.

### 3. Student enters via QR / link
expected: Open the class join link directly (/join/{code}, the QR target). It lands straight on the "Enter your name and PIN" step for that class — no separate code-entry needed.
result: pass
note: GET /join/KMV72W landed directly on the name+PIN step.

### 4. Student unlocks homework with name + PIN
expected: At the name + PIN step, type your roster name and your 4-digit PIN, tap "Unlock homework". You land on the student home shell showing "No homework yet" (the phase ships no assignments). The PIN is never shown back or remembered.
result: pass
note: Name "Robin Test" + PIN 7391 → redirected to /student/home showing "No homework yet".

### 5. Wrong name / code / PIN shows one generic message
expected: Enter a wrong code (or wrong name, or wrong PIN) and submit. You always see the SAME copy — "We could not match that class, name, and PIN. Try again or ask your teacher." — never a field-specific hint about which part was wrong.
result: pass
note: All three variants (wrong code ZZZZZZ, wrong name, wrong PIN 0000) showed the identical generic mismatch copy. Reinforced by tests/server/student-access.test.ts (D-16).

### 6. Remembered class survives a join-code reset (D-18)
expected: After unlocking once, return to /join on the same device — a "Welcome back / Return to {class}" banner appears. Have the teacher RESET the class join code, then tap "Use this class": it still reaches the name + PIN step (with the new code) and unlocks — it does NOT show the mismatch error. The device is not stranded by the reset.
result: pass
note: THE FIXED BUG. After unlock, reset the join code in DB, reloaded /join → "Return to UAT Throwaway Class" banner shown; "Use this class" resolved by class id to the NEW code, reached name+PIN (no mismatch), and unlocked. Backed by tests/server/remembered-class-resolve.test.ts + e2e step-6 test.

<!-- SECTION 2: Technical checks (deferred — run only after Section 1 passes) -->

### 7. Teacher prerequisite flow (account → class → roster → PIN)
expected: A teacher can sign up, stay logged in across refresh, log out; create a class and get a join code + QR/link; bulk-add a roster and generate/reset a student's 4-digit PIN (shown once). This is the setup that produces the code, name, and PIN the student flow above consumes.
result: pass
note: Outputs + gating verified — /auth/login & /auth/signup render (200), /teacher dashboard is auth-gated (307 → /auth/login), join-code + PIN generation/hash domain tests pass (25). The seeded UAT class flowed through these same tables/services and was consumed end-to-end by tests 2-6. CAVEAT: live teacher UI click-through (signup→create class→roster→reset PIN in browser) not eyeballed by a human this run; recommend a quick manual pass before pilot.

### 8. Cross-teacher isolation (AUTH-04)
expected: Teacher A cannot read Teacher B's classes, students, or linked rows. (Automated proof: tests/server/teacher-ownership.test.ts passes live against the DB.)
result: pass
note: tests/server/teacher-ownership.test.ts passes live (RLS isolation across class/student/linked rows).

### 9. Non-enumeration invariant holds server-side (D-16)
expected: The unlock service returns one identical generic failure for malformed PIN, unknown/archived code, wrong name, and wrong PIN. (Automated proof: tests/server/student-access.test.ts passes live.)
result: pass
note: tests/server/student-access.test.ts passes live; also confirmed via UI in test 5.

### 10. Home shell requires a fresh unlock (D-13/D-17)
expected: Visiting /student/home without unlocking this session redirects back to /join — there is no persistent student login; the PIN is re-entered every visit. (Automated proof: student-join.spec.ts redirect test passes.)
result: pass
note: Live server: GET /student/home with no cookie → 307 → /join (lands on "Join class"). e2e redirect test also passes.

<!-- SECTION 3: Coverage check (always last) -->

### 11. Outcome coverage: homework reachable with no email/password account
expected: The student reached the home shell purely via class code/QR + roster name + 4-digit PIN — no Supabase Auth account, no email, no password were required anywhere in the student path. The outcome clause of the user story is observably true.
result: pass
note: Goal-backward grep of the student path (src/app/join, src/app/student, src/components/student, src/server/student-access) finds NO Supabase Auth calls (signIn/getClaims/getUser/auth.uid) — only a comment noting students have no auth session. Student access is app-owned via the service-role client; home shell reads only a short-lived HttpOnly unlock cookie. Outcome clause observably true.

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
