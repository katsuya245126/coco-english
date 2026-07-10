---
quick_id: 260710-hbn
status: complete
code_commit: 33779fa1
completed: 2026-07-10
---

# Retry feedback UI completion summary

Completed the interrupted Coco retry-flow work and the user's final UI requests.

## Delivered

- Coco says and voices `Hmm... let's try again` on the first correction page.
- The corrected sentence is visible but unvoiced on that page; it is voiced from the following repeat card.
- The repeat card uses a larger blue `Say` label and no longer shows the student's first transcript while recording again.
- The repeat-feedback fallback uses the same concise `Say` treatment.
- Native audio playback remains isolated from Web Audio capture so replay cannot be silently stranded in a stale audio graph.
- Encouraging-sprite framing and expression coverage from the interrupted session are included.

## Verification

- `npx tsc --noEmit` — passed.
- `npx vitest run` — 48 files passed; 446 tests passed, 4 skipped.
- `npx playwright test tests/e2e/student-audio.spec.ts tests/e2e/student-ai-evaluation.spec.ts` — 9 passed.
- `npm run lint` — passed with one pre-existing unused-argument warning in `scripts/check-student-feedback-states.mjs`.

Manual audible replay and the full microphone-driven correction flow remain useful final browser checks because automated browser control cannot verify heard audio.
