# Answer Shape UAT — 2026-07-25

Manual verification for the per-turn answer-shape fix (branch
`design/per-turn-answer-shape`). Guards the 2026-07-24 bug where a child
answered "chocolate" and the evaluator rewrote it to the authored example's
"vanilla". A prompt-only fix (`b9a165cb`) did **not** hold — attempt
`038f325a` coerced again hours later, which is why this fix is structural.

## Preconditions

1. **Apply the migration** `supabase/migrations/202607250001_turn_answer_shape.sql`
   on a named environment. This has NOT been applied yet — it requires
   explicit approval per `AGENTS.md`. Until it is applied, 4 typecheck errors
   remain in `mission-service.ts`/`assign-service.ts` (stale generated
   `Database` types).
2. **Regenerate Supabase types** after applying, then re-run
   `npm run typecheck` — expect 0 errors.
3. **Re-save one mission that has an opinion turn** (open it, edit, save) so
   the save-time classifier runs on it. Existing missions default to `open`
   until re-saved, which is also correct behaviour — backfill is deliberately
   out of scope.

## Steps

1. Open a mission with an opinion turn, e.g. "Which ice cream is the best:
   vanilla, strawberry, or chocolate?" whose target example mentions vanilla.
2. As a student, answer with a **different valid choice** using the frame:
   "I think chocolate ice cream is the best."
   **EXPECT:** accepted immediately. No hint, no repeat, no coercion to
   vanilla.
3. Answer the same turn with just "Chocolate."
   **EXPECT:** gentle correction to "I think chocolate is the best." — the
   child's *own* choice placed into the taught frame, **not** vanilla.
4. Open a **fixed** turn (e.g. a "how do you say ___" drill or a
   repeat-after-me turn) and give a wrong answer.
   **EXPECT:** still corrected toward the target as before — the fixed path
   must not have regressed.

Log the attempt with the inspect-attempts tool and confirm turn 1 shows
outcome accepted without a repeat.

## What is already covered by automated tests

These do **not** need manual checking:

- `tests/server/turn-evaluator.test.ts` — the open/fixed prompt branch, the
  default-to-open fallback, and a named regression guard
  ("regression: chocolate answer is never coerced toward the vanilla example").
  The guard was mutation-verified: forcing `isOpenPreset = false` makes it
  fail.
- `tests/server/audio-upload.test.ts` — `answerShape` propagates from the
  assignment mission snapshot into the live evaluation call, for both `open`
  and `fixed`.
- `src/server/ai/answer-shape-classifier.test.ts` — the save-time classifier,
  including its fail-safe (falls back to `open` on any provider error).

Full suite at the time of writing: 98 files, 1062 passed / 4 skipped.

## Known gaps

- **End-to-end behaviour against the live model is unverified.** Every
  automated test asserts on the *prompt payload* sent to the model, not on
  the model's actual response. Steps 2–4 above are the only real check that
  the instruction wording actually changes model behaviour — this is the
  point of this UAT.
- Legacy turns stay `open` until their mission is next saved (intended).
