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
| Student | `Test Student` |
| PIN | `1234` |
| Mission | Ice Cream Opinions (2 turns) |

Turn 1 is `open`, turn 2 is `fixed` — the point is to check both branches.

## Say these exact lines

Speak them aloud; this is a microphone flow.

### Turn 1 — the actual bug (open turn)

Question on screen: *"Which ice cream is the best: vanilla, strawberry, or
chocolate?"*
The authored example says **vanilla**. You will say **chocolate**.

**1a. Say:**
> **"I think chocolate ice cream is the best."**

**PASS:** accepted / moves on. No correction, no repeat-after-me, no hint.
**FAIL:** anything that pushes you toward *vanilla*, or asks you to repeat a
sentence containing "vanilla". **That is the original bug, still alive.**

**1b. Re-run the mission and this time say just:**
> **"Chocolate."**

**PASS:** a gentle correction to **"I think chocolate is the best."** — your own
choice, placed into the taught frame. You then repeat that and it is accepted.
**FAIL:** the correction says *vanilla*, or any flavour you did not say.

This is the sharpest case. A bare "Chocolate." is the one most likely to get
coerced, because it does not use the frame — the fix must add the frame while
keeping *your* flavour.

**1c. (optional, worth doing) Say a different valid option:**
> **"I think strawberry is the best."**

**PASS:** accepted. Any of the three offered options must be fine.

### Turn 2 — the fixed turn must NOT have gone soft

Prompt on screen: *Say this: "Nice to meet you."*

**2a. Say something wrong on purpose:**
> **"I like pizza."**

**PASS:** corrected toward **"Nice to meet you."** — repeat-after-me still
enforces the target.
**FAIL:** accepted. That means `fixed` turns lost their strictness and the fix
over-corrected in the other direction.

**2b. Then say it properly:**
> **"Nice to meet you."**

**PASS:** accepted.

## What each result means

| Result | Meaning |
|---|---|
| 1a, 1b, 1c pass **and** 2a, 2b pass | Fix works. Ready to discuss merge. |
| 1a or 1b still pushes vanilla | Structural fix did not take. Do **not** merge — tell me which line and what it said back. |
| 2a accepted "I like pizza" | Open branch is leaking into fixed turns. Real regression. |

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
