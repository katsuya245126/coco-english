# Phone UAT retry redesign and follow-ups 1, 5, 7

**Status:** Complete locally on `minimal-effort-answer-guard` (2026-07-21).

## Goal and scope

Finish the minimal-effort retry UX redesign, then phone-UAT items 1, 5, and
7. Preserve the reviewed early guard, two-block escape hatch, server-owned
state, exact-target bypass, and preset/conversation split. Item 4 remained
explicitly excluded.

Implementation plan approved before execution: phone-UAT retry plan.

## Completed

- [x] Short minimal answers receive a safe preset example, a bounded
      question-derived frequency example, or an explicit detail fallback.
- [x] `I don't know` receives distinct supportive guidance without the false
      full-sentence claim.
- [x] Retry kind/example/count metadata survives refresh, resume, and the
      post-cap normal evaluation path.
- [x] The two-block cap, exact-match bypass, early paid-call ordering, and
      structured server event remain intact.
- [x] Post-cap polar variants cannot surface auxiliary corrections such as
      `Yes, I do.`, `No, I don’t.`, or `No, I do not.` for information
      questions; ambiguous cases route to teacher review.
- [x] Conversation replies keep the active activity, allow a nearby
      transition when the learner rejects it, require complete punctuation,
      and receive at most one corrective regeneration for deterministic line
      policy failures.
- [x] Hard-cap output consistently uses one closing line with no question.
- [x] Translation hints prefer 2–3 short chunks, avoid near-whole-sentence
      spans, bypass legacy cache rows through a versioned digest, and wrap
      phrase text inline with trailing punctuation.
- [x] `Coco is thinking…` appears in the persistent dialogue box through the
      existing `cocoThinking` state and thinking expression. The duplicate
      standalone card was removed, and the dialogue text is a polite atomic
      live region.
- [x] A read-only combined review found four important edge cases. Follow-up
      review confirmed all were resolved: student-voice pronouns, expanded
      polar negatives, independent topic/run-on enforcement, and hard-cap
      prompt consistency.
- [x] No migration, dependency, production mutation, secret, Item 4 change,
      merge, push, or deployment was introduced.

## Final validation

- Focused integrated matrix: 15 files, 290 tests passed.
- Full suite excluding the sandbox-incompatible socket file:
  87 files passed; 875 passed, 4 skipped.
- Unfiltered full suite: 87 files passed, 1 file failed; 885 passed, 4
  skipped, 3 failed. All failures are pre-existing environment-only socket
  cases in `tests/scripts/uat-worktree-runtime.test.ts`; the sandbox rejects
  `listen` on `127.0.0.1` and `0.0.0.0` with `EPERM`, causing three 5-second
  timeouts.
- `npm run typecheck`: passed.
- `npm run lint`: 0 errors; one known pre-existing warning at
  `scripts/check-student-feedback-states.mjs:435`.
- `npm run build`: externally blocked. Next.js compilation reaches
  `src/app/layout.tsx` and fails because restricted network DNS cannot resolve
  `fonts.googleapis.com` to fetch Inter through `next/font`.
- Localhost phone/browser and VoiceOver verification: externally blocked by
  the same sandbox port-binding restriction. No synthetic screenshot was
  presented as application evidence.

## Remaining manual validation

- In an environment that permits localhost and network access, run
  `npm run build` and visually inspect the inline Korean hint bubble at phone
  widths, including a multiline phrase followed by `?`.
- Hold a dynamic-reply request in flight and verify the thinking line appears
  inside Coco's dialogue box and announces once with VoiceOver.
- Optional real-provider UAT may sample conversational quality and hint chunk
  selection; automated tests used fake clients only.

## Repository note

The requested atomic commits could not be created because this managed
workspace permits reading but not writing the linked worktree Git metadata
(`.git/worktrees/minimal-effort-answer-guard/index.lock`: operation not
permitted). Changes remain uncommitted for review. The pre-existing untracked
`node_modules` symlink was left untouched.
