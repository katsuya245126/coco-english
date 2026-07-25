# Answer Shape UAT — 2026-07-25

Manual verification for the per-turn answer-shape fix (branch
`design/per-turn-answer-shape`).

Guards the 2026-07-24 bug: a child answered **"chocolate"** and the evaluator
rewrote it to the authored example's **"vanilla"**. A prompt-only fix
(`b9a165cb`) did **not** hold — attempt `038f325a` coerced again hours later.
That is why this fix is structural, and why this manual check matters: every
automated test asserts on the *prompt payload*, never on the model's actual
reply. This UAT is the only thing that tests the real model.

## Environment (already set up)

- **Local** Supabase, migration `202607250001` applied. Your real student data
  was never touched.
- Dev server on `http://localhost:3000`, started with local-Supabase env
  overrides for this session only — no files were modified. Note your
  `.env.local` still points at the remote project, so a plain `npm run dev`
  will NOT see this data.
- Seeded by `scripts/seed-answer-shape-uat.mjs` (re-runnable).

| | |
|---|---|
| URL | http://localhost:3000/join/SHAPE1 |
| Class | Answer Shape UAT |
| Student | `Test Student` (stored normalized as `test student`) |
| PIN | `1234` |
| Mission | Favorites and Opinions (4 turns) |

Turns 1–3 are `open`, turn 4 is `fixed`. **One turn per test case**, so a single
straight run-through covers everything — passing a turn advances to the next
case rather than ending the mission. No re-running needed.

In every open turn the authored example names a choice you will deliberately
**not** pick, so each turn independently tests for coercion.

## Say these exact lines

Speak them aloud; this is a microphone flow. Just go straight through turns
1 → 4.

### Turn 1 — the actual bug (open)

On screen: *"Which ice cream is the best: vanilla, strawberry, or chocolate?"*
Example says **vanilla**. You say **chocolate**.

> **"I think chocolate ice cream is the best."**

**PASS:** accepted, moves to turn 2. No correction, no repeat, no hint.
**FAIL:** anything pushing you toward *vanilla*, or asking you to repeat a
sentence containing "vanilla". **That is the original bug, still alive.**

### Turn 2 — bare answer, the sharpest case (open)

On screen: *"Which fruit is the best: apples, bananas, or grapes?"*
Example says **apples**. You say **bananas**, with no frame at all.

> **"Bananas."**

**PASS:** a gentle correction to **"I think bananas are the best."** — your own
choice, placed into the taught frame. Repeat it and it is accepted.
**FAIL:** the correction says *apples*, or any fruit you did not say.

This is the most likely one to break. A bare answer doesn't use the frame, so
the fix has to add the frame **while keeping your choice**. If coercion survives
anywhere, expect it here.

> **Run 1 (2026-07-25) died here** with "I didn't hear you. Try again." on every
> retry. Cause was unrelated to answer shape: "Bananas." transcribes to the
> all-Hangul "바나나스", which the transcript gate read as an empty transcript.
> Fixed in `9800adee` + `1da87f77`. Live-probed after the fix, this exact turn
> now returns **"I think bananas are the best."**

### Turn 3 — a third choice, different frame (open)

On screen: *"Which animal is the best pet: a dog, a cat, or a bird?"*
Example says **a dog**. You say **a cat**.

> **"I think a cat is the best pet."**

**PASS:** accepted.
**FAIL:** pushed toward *a dog*.

### Turn 4 — the fixed turn must NOT have gone soft

On screen: *Say this: "Nice to meet you."*

**4a. Say something wrong on purpose:**
> **"I like pizza."**

**PASS:** corrected toward **"Nice to meet you."** — repeat-after-me still
enforces the target.
**FAIL:** accepted. That means `fixed` turns lost their strictness and the fix
over-corrected in the other direction.

**4b. Then say it properly:**
> **"Nice to meet you."**

**PASS:** accepted, mission complete.

## What each result means

| Result | Meaning |
|---|---|
| Turns 1–3 accepted with **your** choice **and** 4a corrected, 4b accepted | Fix works. Ready to discuss merge. |
| Any open turn pushes the example's choice | Structural fix did not take. Do **not** merge — tell me which turn and what it said back. |
| Turn 2 corrects to *apples* | The frame-adding path still coerces. This is the case most likely to fail. |
| 4a accepted "I like pizza" | Open branch is leaking into fixed turns. Real regression. |

## If something fails

Tell me the exact turn (1a/1b/2a), what you said, and what came back verbatim.
The verbatim reply is what matters — the difference between "I think chocolate
is the best" and "I think vanilla is the best" is the entire bug.

To inspect what was stored:

```bash
node scripts/inspect-attempts.mjs
```

To reset and start clean:

```bash
node scripts/seed-answer-shape-uat.mjs
```

## Already covered by automated tests (do not re-check by hand)

- `tests/server/turn-evaluator.test.ts` — the open/fixed prompt branch, the
  default-to-open fallback, and a named regression guard for the
  chocolate/vanilla scenario. Mutation-verified: forcing `isOpenPreset = false`
  makes it fail.
- `tests/server/audio-upload.test.ts` — `answerShape` propagates from the
  assignment snapshot into the live evaluation call, for both shapes.
- `src/server/ai/answer-shape-classifier.test.ts` — the save-time classifier,
  including its fail-safe (falls back to `open` on any provider error).

Gates at time of writing: vitest 98 files / 1062 passed, typecheck 0 errors,
lint 0 errors.

## Still open after this UAT

- Migration applied **locally only**. Remote/production still needs it, as a
  separate approval.
- Branch `design/per-turn-answer-shape` is unmerged.
- Legacy turns stay `open` until their mission is next saved (intended; no
  backfill).
