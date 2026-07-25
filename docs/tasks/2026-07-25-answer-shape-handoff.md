# Handoff — Per-Turn Answer Shape (resume, inline execution)

**Date:** 2026-07-25
**Status:** Design + plan committed. Zero implementation code written yet.
**Resume style:** inline execution (single agent), ideally after `/clear` in a
fresh session so this brainstorming transcript isn't carried in context.

## The one-paragraph why

Preset mission turns treat the authored `targetExample` as an answer key. On
opinion/choice turns that coerces a child into the example's choice: a student
picked **chocolate** and was made to repeat "I think **vanilla** ice cream is
the best." The prompt-only fix (commit `b9a165cb`, with the literal
vanilla/chocolate example baked in) was PROVEN not to hold — attempt `038f325a`
coerced again hours later. Fix: decide each turn's answer-shape ONCE at
save-time (AI), store it, and branch the evaluator on it. `open` turns treat the
target as scaffolding — enforce only the taught frame, re-slot the child's OWN
choice, never the example's.

## Exact resume state

- **Checkout:** `/Users/john/Desktop/my-portfolio/projects/coco-english`
- **Branch:** `design/per-turn-answer-shape` (already checked out)
- **Working tree:** clean
- **HEAD:** `ddc892f0` (plan). Below it: `2502e8eb` (spec), then `15d70ee0` (main).
- **Nothing implemented.** All 9 plan tasks are unstarted.

## What to read first (in order)

1. Plan: `docs/superpowers/plans/2026-07-25-per-turn-answer-shape.md` — 9 TDD
   tasks, complete code in each step. This is the execution script.
2. Spec (context only): `docs/superpowers/specs/2026-07-25-per-turn-answer-shape-design.md`
3. Memory: `coco-english-opinion-question-overcorrection` (has the "prompt fix
   proven dead" evidence and links to spec+branch).

## How to resume

Invoke `superpowers:executing-plans` and work the plan task-by-task (TDD:
failing test → verify fail → implement → verify pass → commit). Tasks are a
strict dependency chain (schema → column → classifier → wiring → snapshot →
evaluator → flow → guard → suite); do them in order.

## Verified environment facts (don't re-derive)

- Test run: `npx vitest run` (single test: `npx vitest run <file> -t <name>`)
- Typecheck: `npm run typecheck`  •  Lint: `npm run lint`
- No API calls in tests — inject a fake Responses client; pattern lives in
  `src/server/ai/opener-generator.test.ts`.

## Migration caveat (Task 2 / Task 9)

There is **no** scripted Supabase migration command in `package.json`, and per
`AGENTS.md` applying a DB migration needs separate approval naming the exact
environment. So:

- **Tasks 1, 3–8 need NO applied migration** — they are code + fake-client unit
  tests and pass without touching a real DB. Do these freely.
- **Task 2** writes the migration FILE
  (`supabase/migrations/202607250001_turn_answer_shape.sql`) and the
  read/write mapping; the file can be committed without applying it.
- **Applying** the migration and the **live UAT** (Task 9 manual steps) require
  the user's explicit go-ahead on a named environment. Don't run a DB apply
  autonomously. Ask.

## Definition of done

All 9 tasks committed on `design/per-turn-answer-shape`; `npx vitest run`,
`npm run typecheck`, `npm run lint` clean; UAT note written. Merge to main is a
SEPARATE approval (per project handoff rules — do not merge to simplify).
Post-merge, update the `coco-english-opinion-question-overcorrection` memory to
"shipped".
