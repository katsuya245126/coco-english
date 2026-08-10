# Personalized Pronunciation Practice

**Status:** Paused on 2026-08-09  
**Implementation:** Approved plan and independent P1/P2 fixes complete  
**Pause reason:** The owner explicitly switched the active task to architecture
deepening. Resume from the browser verification position below.

## Paused segment: student practice UI rework

Real local testing exposed three UI problems: a scored try showed no stars until
the final screen, the completed result had no route back to `/student/home`, and
the practice screen was visually cluttered. A grilling session on 2026-08-03
settled the product decisions; they are recorded under **Student practice UI
(2026-08-03 grilling)** in
`docs/tasks/2026-08-03-pronunciation-practice-decisions.md`.

Scope: `src/components/student/PronunciationPracticeShell.tsx` and its test.
No server, schema, or provider change.

Done checks:

- [x] A scored weak try 1 or 2 shows its 1-3 stars immediately.
- [x] A passed try shows its stars before **Next word**.
- [x] A different-word try shows three empty stars and no filled star.
- [x] The target-sound result is readable without color.
- [x] The strip reflects the try just made, not the derived result try.
- [x] Retry stays available after a weak try before try three.
- [x] The completed result exposes two distinctly named routes to
      `/student/home`.
- [x] Narrow UI tests, pronunciation suite, typecheck, lint, build, and the safe
      local E2E gate pass.

Verification on 2026-08-04 after the single-verdict result redesign: full Vitest
suite 129 files, 1,564 passed and 10 skipped; typecheck clean; production build
passed; the local pronunciation Playwright path passed in 24.2s against local
Supabase.

Browser verification of the redesigned screen is still NOT done. An earlier note
here claimed both verdict variants were confirmed in situ; that claim was wrong
and has been removed. What was actually screenshotted was verdict markup injected
into the live page with JavaScript, not the `TryVerdict` component rendering. The
colour and contrast figures below were measured against that injected markup, so
they describe the intended design, not confirmed component output:
encourage title 12.39:1, encourage detail 5.87:1, celebrate title 12.01:1,
celebrate detail 5.43:1, result-screen amber 6.73:1.

Still to verify in a browser against the real component: that a recorded try
renders exactly one verdict card, that the reserved zone holds `min-height: 84px`
so the screen does not reflow, and that "Play word" plays the word audio.

## Current position

Product decisions are complete and remain fixed. The approved implementation
plan and verification fixes are complete for local code, tests, and documentation.
The owner approved the existing 48 kHz, 16-bit source WAV masters.
The owner approved local Supabase as the required test environment for future
database changes.

The approved product decisions are in
`docs/tasks/2026-08-03-pronunciation-practice-decisions.md`.

## Verification

- Follow-up regression suite: 4 files, 34 tests passed.
- Local integration checks: 12 tests passed.
- Local pronunciation Playwright path: 1 test passed using synthetic records
  and provider route doubles.
- Full Vitest suite: 129 files, 1,556 tests passed, 10 skipped.
- Typecheck and production build passed.
- Lint: 0 errors and one pre-existing warning in
  `scripts/check-student-feedback-states.mjs`.
- Hosted-URL safety gate: 1 Playwright test skipped as designed, even when
  `E2E_PRONUNCIATION=true` is set.

## Production migration

The migration
`supabase/migrations/202608030001_pronunciation_practice.sql` was applied to
the linked production Supabase project with owner approval on 2026-08-03.
A read-only PostgREST query confirmed that the `attempt_turns` to
`pronunciation_word_tries` relationship is now available in the production
schema cache. No application deployment, push, or paid-provider production
test was performed.

## Local database plan

- [x] Make the pronunciation end-to-end gate refuse non-local Supabase URLs.
- [x] Start the local Supabase stack and apply all tracked migrations.
- [x] Run the schema and local integration checks.
- [x] Run the pronunciation end-to-end path against synthetic local records.
- [x] Document the repeatable local commands.

Local verification found and corrected every ambiguous pronunciation query
between `attempts` and `assignment_students`. It also corrected the recorder
state between words and stale end-to-end expectations.

Do not copy production student data. Do not change production credentials,
apply a production migration, or call a paid provider.
