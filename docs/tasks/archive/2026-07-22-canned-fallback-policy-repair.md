# Canned fallback policy repair

**Status:** Complete on `minimal-effort-answer-guard` (2026-07-22).

## Outcome

Made Coco's generic canned reply a bounded safety/availability backstop
rather than a frequent response to recoverable quality issues. Preserved
conversation mode's server-owned generation, moderation, persistence, hard
cap, and TTS flow.

Implementation plan approved before execution: canned-fallback policy repair.

## Evidence

- Live reproduction rejected an either/or first candidate, then rejected a
  correction that was both 12 words and still either/or; the correction
  budget exhausted and selected a canned line.
- Read-only database audit on 2026-07-22 found only 16 completed assignment
  receipts. The only two conversation-mode assignments both contained canned
  fallback events: 4 of 10 stored conversation turns overall, including 3 of
  5 in the newest assignment.
- Historical rows store only `{ "kind": "canned_fallback" }`, so provider,
  schema, reply-policy, and output-moderation causes could not be
  distinguished.
- The exact-match stuck detector did not recognize a longer response such as
  "I don't know what games I play inside" as stuck.

## Approved decisions

- Length is a soft prompt preference, not a reply-policy rejection or
  fallback trigger. Existing dialogue pagination owns longer display.
- Kept one targeted correction attempt for reply-policy failures; did not
  add a second correction call without post-fix evidence.
- Collect every deterministic reply-policy violation and use every relevant
  targeted correction hint.
- Broadened stuck recognition to full responses beginning with an
  established stuck phrase.
- Separated fallback causes in the persisted JSON event without storing
  rejected text or student content.
- Gave output-moderation retries actual stronger safety steering.
- Distinguished explicit unsafe moderation results from moderation
  unavailability.

## Completed

- [x] A safe, on-topic line longer than 11 words passes reply-policy
      validation.
- [x] A candidate with multiple policy violations returns all violation
      reasons.
- [x] Full-sentence stuck replies permit a child-friendly two-choice
      question.
- [x] One correction prompt contains targeted hints for every violation
      found.
- [x] Correction-call provider failures remain `provider_failed`, not
      `schema_failed`.
- [x] Policy-exhaustion results carry violation reasons without rejected
      text.
- [x] Input/output moderation unavailability is distinct from explicit
      unsafe content.
- [x] Output-safety retry uses explicit stronger system steering.
- [x] Persisted canned-fallback events identify their cause.
- [x] Diagnostic logs contain reason codes and attempt labels, not
      generated lines or student responses.
- [x] Focused tests, full Vitest, typecheck, lint, and build pass.
- [x] Live localhost UAT confirms meaningful, longer, and full-sentence-stuck
      answers do not produce unnecessary canned fallbacks.
- [x] Follow-up database read was offered and explicitly declined by the
      user; not performed.

## Non-goals (unchanged)

- Did not investigate or fix the separate identical-correction issue.
- Did not change preset mission behavior, evaluation, progression,
  ownership, RLS, audio storage, TTS, or the hard turn cap.
- Did not change the topic-continuity heuristic beyond adapting its return
  shape. The inherited topic-continuity diff in
  `src/domain/ai/conversation-generation.ts`/`.test.ts` remains a separate,
  pre-existing, deliberately uncommitted concern — untouched by this task
  and still uncommitted after this receipt.
- Did not add a database migration; `moderation_event` is already JSONB.
- Did not add another provider call or deterministic rewriting layer.

## Verification evidence

- Focused gate: `npx vitest run src/domain/ai/conversation-generation.test.ts
  src/server/ai/conversation-generator.test.ts
  src/server/student-access/audio-upload.test.ts
  src/server/student-access/mission-flow.test.ts` → 81/81 passed. Logs
  contain only `{ reasons, attempt }` — no generated line text.
- Full suite: `npx vitest run` → 908 passed, 4 skipped, 0 failed.
- Typecheck: `npx tsc --noEmit -p .` → clean, no output.
- Lint: `npx eslint` on the 7 scoped files → clean, no output.
- Build: `npm run build` → succeeded, all routes compiled.
- Privacy/scope grep: `rg` for the reason-code/event identifiers in
  `src/server` shows only type definitions, log calls with `reasons` only,
  and test assertions — no `line`, transcript, or student-response leakage
  found. `git diff --check` clean. No migration files added. Diff footprint
  matches exactly the 7 plan-scoped files (614 insertions / 85 deletions
  total across Tasks 1-3).
- Live UAT (2026-07-22, user-run on their own `localhost:3200` server, real
  conversation-mode assignment):
  - "I will go to the beach with my family and play video games" (12 words,
    on-topic) received a real generated follow-up question, not a canned
    fallback or a length-triggered rejection.
  - A bare stuck phrase ("I don't know") received the guess-prompt nudge
    ("It's okay to guess! Try one answer.").
  - A full-sentence stuck response ("I don't know what games I play")
    received a real, child-friendly redirect question ("That's okay! Do you
    like to watch cartoons or read books inside?"), not stuck-blocked and
    not a canned fallback.
  - No canned fallback appeared anywhere across the tested session.
  - Optional DB read of the new session's `attempt_turns`/`moderation_event`
    was offered and declined by the user (no fallback fired to inspect
    anyway).

## Commits

- `208d2841` fix(ai): make conversation reply length advisory (Task 1,
  reviewed clean)
- `324217a9` fix(ai): target conversation reply recovery (Task 2, reviewed
  clean)
- `e65259b9` fix(server): record Coco fallback causes (Task 3, reviewed
  clean; minor non-blocking note: no dedicated test for the
  retry-then-still-unavailable branch, code path present and symmetric with
  the tested first-check equivalent)

All three commits used reviewed partial staging; the inherited
topic-continuity diff in `src/domain/ai/conversation-generation.ts`/`.test.ts`
remained uncommitted and untouched throughout (independently re-verified
after every commit and again at archive time).
