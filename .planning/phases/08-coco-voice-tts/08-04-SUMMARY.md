---
phase: 08-coco-voice-tts
plan: 04
subsystem: ui
tags: [tts, audio, react, client-component, autoplay, accessibility, student-flow]

# Dependency graph
requires:
  - phase: 08-coco-voice-tts (plan 01)
    provides: TTS domain contracts (tts.ts), line-kind eligibility, request schema, source-boundary test
  - phase: 08-coco-voice-tts (plan 03)
    provides: student-gated TTS route (POST /student/missions/[assignmentStudentId]/tts) returning a signed audio URL
provides:
  - Reusable client CocoSpeechAudio playback/replay component
  - Voice-enabled mission prompt, improved/model sentence, feedback, transition, and completion surfaces
  - Line-descriptor wiring from MissionFlowShell into every voiced step
affects: [08-coco-voice-tts verification, future student-voice/pronunciation phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client TTS playback via standard <audio> element + signed route URL (no provider SDK on client)"
    - "Descriptor-only client requests: UI sends {lineKind, turnOrder} — never spoken text or content hash"
    - "Opportunistic autoplay attempted once per resolved URL with a caught play() rejection"
    - "Text renders in the parent card; the speaker control fails independently"

key-files:
  created:
    - src/components/student/CocoSpeechAudio.tsx
  modified:
    - src/components/student/MissionFlowShell.tsx
    - src/components/student/StepBuddyQuestion.tsx
    - src/components/student/StepImprovedRepeat.tsx
    - src/components/student/StepTurnTransition.tsx
    - src/components/student/StepMissionComplete.tsx
    - src/components/student/StepAiEvaluationFeedback.tsx

key-decisions:
  - "Wired CocoSpeechAudio into StepTurnTransition and StepMissionComplete in addition to the plan's question/repeat/feedback list, because the frozen source-boundary test (tests/domain/tts-ui-source.test.ts) requires all four step surfaces plus feedback."
  - "Drove the playing state from the audio onPlay handler and chained .catch directly on play() (no .then in between) to satisfy the browser-behavior contract in student-coco-voice.spec.ts."
  - "Autoplay is attempted once per resolved URL via a ref guard so an ended clip does not re-trigger autoplay when the element resets to the ready state."

patterns-established:
  - "Icon-only voiced-line control: 44px min-target button with aria-label 'Play Coco', loading/ready/playing/error states, hidden <audio> element."
  - "Transcript blocks stay plain text and are never passed as a TTS descriptor (D-10)."

requirements-completed: [VOICE-01, VOICE-02, VOICE-04]

# Metrics
duration: 7min
completed: 2026-07-01
status: complete
---

# Phase 8 Plan 4: Coco Voice Playback (Client Layer) Summary

**Reusable CocoSpeechAudio client component that fetches the student-gated TTS route by line descriptor, autoplays opportunistically with caught rejections, and voices the mission prompt, improved/model sentence, feedback, transition, and completion lines while transcripts stay text-only.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-01T15:08:35Z
- **Completed:** 2026-07-01T15:15:10Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- Built `CocoSpeechAudio`, a client-only playback/replay control that POSTs a bounded line descriptor to `/student/missions/[assignmentStudentId]/tts`, assigns the returned signed URL to a standard `<audio>` element, and attempts autoplay while catching a blocked `play()` promise.
- Voice-enabled five student mission surfaces: buddy question (`mission_prompt`), improved repeat (`improved_sentence`), turn transition (`coco_transition`), mission complete (`completion_celebration`), and needsCorrection AI feedback (`coco_feedback`).
- Preserved the homework loop: recorder availability stays tied to submit state only (never TTS state), transcripts are never voiced, and no status/completion logic or teacher replay telemetry was added.
- Kept the client/server boundary intact — no OpenAI, Supabase service client, or server-audio import crosses into student client modules.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build inline Coco speech playback component** - `a9f3af0b` (feat)
2. **Task 2: Voice question, model sentence, feedback, transition, completion** - `36de2edb` (feat)
3. **Task 1 fix: autoplay once per URL + direct play().catch (browser-behavior contract)** - `b88bd451` (fix)

_TDD note: the RED specs (`tests/domain/tts-ui-source.test.ts`, `tests/e2e/student-coco-voice.spec.ts`) were authored in prior waves; this plan implemented the GREEN client layer against them._

## Files Created/Modified
- `src/components/student/CocoSpeechAudio.tsx` - Client TTS playback/replay control; descriptor fetch, signed-URL `<audio>`, opportunistic autoplay with caught rejection, loading/ready/playing/error states, `aria-label="Play Coco"`.
- `src/components/student/MissionFlowShell.tsx` - Passes `assignmentStudentId` + `turnOrder` line descriptors into every voiced step invocation.
- `src/components/student/StepBuddyQuestion.tsx` - Voices the mission prompt (`mission_prompt`).
- `src/components/student/StepImprovedRepeat.tsx` - Voices the improved/model sentence (`improved_sentence`); transcript block stays text-only.
- `src/components/student/StepTurnTransition.tsx` - Voices the Coco transition line (`coco_transition`).
- `src/components/student/StepMissionComplete.tsx` - Voices the completion celebration line (`completion_celebration`).
- `src/components/student/StepAiEvaluationFeedback.tsx` - Voices Coco-style feedback + improved sentence on `needsCorrection` (`coco_feedback`); transcript never voiced.

## Decisions Made
- **Wired two extra surfaces (transition, completion) beyond the plan's file list.** The frozen source-boundary test asserts `CocoSpeechAudio` is present in `StepBuddyQuestion`, `StepImprovedRepeat`, `StepTurnTransition`, and `StepMissionComplete`. The test is the enforced contract, so all four were wired (plus the feedback surface).
- **`.catch` chained directly on `play()`; playing state from `onPlay`.** The e2e spec asserts `/\.play\(\)\s*(\.catch|\?\.catch)/`, which forbids an intervening `.then`. The element's `onPlay` handler drives the `playing` state instead.
- **Autoplay guarded by a per-URL ref.** Prevents an ended clip (which resets state to `ready`) from re-triggering autoplay and looping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Autoplay could loop and play()/.catch did not match the browser-behavior contract**
- **Found during:** Task 1 verification (checking the `student-coco-voice.spec.ts` source assertions)
- **Issue:** The first implementation used `play().then().catch()`, so the required `/\.play\(\)\s*\.catch/` contract did not match, and `onEnded` resetting state to `ready` would re-trigger autoplay (loop).
- **Fix:** Chained `.catch` directly on `play()`, moved `playing` state to an `onPlay` handler, and added a per-URL `autoplayedUrlRef` guard so autoplay runs at most once per resolved URL.
- **Files modified:** `src/components/student/CocoSpeechAudio.tsx`
- **Verification:** Node regex check confirms `/\.play\(\)\s*(\.catch|\?\.catch)/` matches; source-boundary vitest suite passes 8/8.
- **Committed in:** `b88bd451`

**2. [Scope alignment] Voiced transition + completion surfaces not in the plan's `files_modified`**
- **Found during:** Task 2 (running the source-boundary test)
- **Issue:** The frozen test requires `CocoSpeechAudio` in `StepTurnTransition` and `StepMissionComplete`, which the plan's `files_modified` list omitted.
- **Fix:** Wired both surfaces with `coco_transition` / `completion_celebration` descriptors and threaded `assignmentStudentId` from the shell.
- **Files modified:** `src/components/student/StepTurnTransition.tsx`, `src/components/student/StepMissionComplete.tsx`, `src/components/student/MissionFlowShell.tsx`
- **Verification:** `tests/domain/tts-ui-source.test.ts` passes 8/8.
- **Committed in:** `36de2edb`

---

**Total deviations:** 2 (1 Rule 1 bug fix, 1 test-driven scope alignment)
**Impact on plan:** Both were necessary to satisfy the frozen Wave 0 test contracts. No scope creep — all changes stay within the client playback layer and the mission step surfaces.

## Issues Encountered
- A macOS `grep -E` false-negative initially suggested the `.play().catch` contract failed; re-checking with Node's regex engine (which is exactly how Playwright reads the source) confirmed the assertion passes. No code problem — a tooling artifact of BSD grep `\s` handling.

## Deferred Issues
- Three pre-existing `tsc --noEmit` errors in `tests/server/tts-cache.test.ts` (a Wave 0/1 RED fixture, commit `91de9d5d`) still surface under plan-level `npm run typecheck`. They are unrelated to the client layer, out of scope for this plan, and already tracked in `deferred-items.md`. All 08-04 changed files typecheck clean.

## Known Stubs
None — `CocoSpeechAudio` always fetches live audio from the route; no hardcoded empty/placeholder values flow to the UI.

## Threat Flags
None — no new network endpoints, auth paths, or schema changes were introduced. The client consumes the existing signed-URL route and never constructs Storage URLs or sends content hashes (T-08-01/03/05 mitigations upheld).

## User Setup Required
None - no external service configuration required by this plan.

## Next Phase Readiness
- Client playback layer is complete and satisfies VOICE-01, VOICE-02, VOICE-04 source contracts.
- Ready for phase verification: `npx playwright test tests/e2e/student-coco-voice.spec.ts` (browser autoplay/audio semantics) and the manual UAT of voiced lines on a real device.
- No blockers introduced. The pre-existing tts-cache test-fixture typecheck errors remain for a later cleanup pass.

---
*Phase: 08-coco-voice-tts*
*Completed: 2026-07-01*
