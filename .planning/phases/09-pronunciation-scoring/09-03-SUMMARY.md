---
phase: 09-pronunciation-scoring
plan: 03
subsystem: api
tags: [azure-speech-sdk, ffmpeg-static, pronunciation-assessment, vitest, tdd]

# Dependency graph
requires:
  - phase: 09-pronunciation-scoring (09-01, 09-02)
    provides: Azure Speech env var docs (.env.example), FERPA/COPPA data-use note, pronunciation_scores migration
provides:
  - "transcodeToWav(Blob) -> 16kHz mono PCM WAV Buffer via spawned ffmpeg-static binary (src/server/audio/audio-transcode.ts)"
  - "scorePronunciation() Azure pronunciation-assessment adapter with injectable client (src/server/audio/pronunciation-scorer.ts)"
  - "scoreToStarBand/STAR_BAND_COPY/errorTypeToLabel pure domain mapping, single source of truth for star thresholds and copy (src/domain/pronunciation/scoring.ts)"
affects: [09-04-pipeline-wiring, 09-05-calibration, 09-06-ui]

# Tech tracking
tech-stack:
  added: ["microsoft-cognitiveservices-speech-sdk@1.50.0", "ffmpeg-static@5.3.0"]
  patterns:
    - "Injectable-client vendor adapter (mirrors transcription.ts): resolveApiKey/resolveRegion using the 'in deps' idiom, discriminated-union result type, guard-before-try, generic catch logging a fixed error code only"
    - "Discriminated-union TranscodeResult wrapping a raw ffmpeg subprocess Promise so callers compose it like transcribeAudioFile"
    - "Pure score->star mapping module with thresholds in one exported const (STAR_BAND_THRESHOLDS), importable from both server and client code"

key-files:
  created:
    - src/server/audio/audio-transcode.ts
    - src/server/audio/pronunciation-scorer.ts
    - src/domain/pronunciation/scoring.ts
    - tests/server/audio-transcode.test.ts
    - tests/server/pronunciation-scorer.test.ts
    - tests/domain/pronunciation-scoring.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Azure recognizer wired through an injectable PronunciationRecognizerFactory returning a plain PronunciationRecognitionRaw shape, so tests never construct a real SDK SpeechRecognizer and never call the paid API."
  - "Guard ordering in scorePronunciation: missing_api_key -> audio_too_long (>30000ms) -> transcode_failed -> provider_failed, each short-circuiting before the next external call."
  - "Full per-word Azure PronunciationAssessment block reduced to { word, accuracyScore, errorType } in v1 WordScore type per RESEARCH.md Open Question 2 recommendation (phoneme depth deferred, not stored)."

patterns-established:
  - "Score-to-star mapping and copy centralized in domain/pronunciation/scoring.ts so the 09-05 calibration pass can retune STAR_BAND_THRESHOLDS without touching Azure call code."

requirements-completed: [PRON-01]

# Metrics
duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 9 Plan 3: Pronunciation Scoring Engine Summary

**Server-only Azure pronunciation-assessment adapter with ffmpeg-static WAV transcoding and a pure score-to-star domain module, all unit-tested with injected fakes so no automated test calls the paid Azure API.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T12:21:34Z
- **Completed:** 2026-07-02T12:26:42Z
- **Tasks:** 3 completed
- **Files modified:** 8 (2 npm manifest files, 3 new source files, 3 new test files)

## Accomplishments
- Installed `microsoft-cognitiveservices-speech-sdk@1.50.0` and `ffmpeg-static@5.3.0` (both passed the RESEARCH.md Package Legitimacy Audit; `fluent-ffmpeg` explicitly excluded).
- Built `transcodeToWav`, a server-only utility that spawns the bundled ffmpeg binary to convert compressed student audio (webm/mp4/mp3) into 16kHz mono PCM WAV, resolving a typed `transcode_failed` result rather than throwing.
- Built `scorePronunciation`, a server-only Azure adapter following the exact `transcription.ts` injectable-client convention: guards for missing key and oversized audio before any network call, transcodes via the injected `transcodeToWav`, calls an injectable `PronunciationRecognizerFactory`, and derives the star band via the pure domain module rather than passing Azure's raw 0-100 score through.
- Built `src/domain/pronunciation/scoring.ts`, the single source of truth for the 1-3 star mapping (`scoreToStarBand`), encouraging copy (`STAR_BAND_COPY`), and Azure `ErrorType` -> teacher label mapping (`errorTypeToLabel`), pure and importable from both server and client code.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Azure Speech SDK + ffmpeg-static and add the WAV transcode utility** - `70ca95a2` (feat)
2. **Task 2: Pure score-to-star domain mapping + ErrorType labels (RED)** - `6bfe67db` (test)
2b. **Task 2: Pure score-to-star domain mapping + ErrorType labels (GREEN)** - `fcd50785` (feat)
3. **Task 3: Azure pronunciation-assessment adapter with injectable client (RED)** - `966164ed` (test)
3b. **Task 3: Azure pronunciation-assessment adapter with injectable client (GREEN)** - `eefa49f8` (feat)

**Plan metadata:** commit pending (docs: complete plan)

_TDD tasks (2 and 3) each have a test commit followed by a feat commit, per the plan's RED/GREEN requirement._

## Files Created/Modified
- `package.json` / `package-lock.json` - Added `microsoft-cognitiveservices-speech-sdk` and `ffmpeg-static` dependencies.
- `src/server/audio/audio-transcode.ts` - `transcodeToWav(Blob, deps?)`: spawns `ffmpeg-static` with `-ar 16000 -ac 1 -f wav`, collects stdout, resolves a discriminated-union `TranscodeResult`, never rejects.
- `src/server/audio/pronunciation-scorer.ts` - `scorePronunciation(input, deps?)`: Azure pronunciation-assessment adapter; exports `PronunciationScoreResult`, `PronunciationScoreError`, `PronunciationScoreDetail`, `PronunciationScorerDeps`, `PronunciationRecognizerFactory`.
- `src/domain/pronunciation/scoring.ts` - `scoreToStarBand`, `STAR_BAND_COPY`, `errorTypeToLabel`, `PronunciationStarBand`, `WordScore`, `STAR_BAND_THRESHOLDS`.
- `tests/server/audio-transcode.test.ts` - 3 tests, mocked `spawn` dependency, no real ffmpeg subprocess.
- `tests/server/pronunciation-scorer.test.ts` - 6 tests covering happy path, missing key, transcode failure, provider failure, duration guard, and derived-not-raw starBand.
- `tests/domain/pronunciation-scoring.test.ts` - 20 tests covering star-band boundaries, copy vocabulary, and ErrorType label mapping.

## Decisions Made
- Recognizer factory returns a plain `PronunciationRecognitionRaw` object (`accuracyScore`, `fluencyScore`, `completenessScore`, `pronunciationScore`, `words`) rather than the raw Azure SDK result type, keeping the test-facing contract simple and fully decoupled from the SDK's internal JSON shape.
- The default (non-test) recognizer factory implementation parses `NBest[0].Words[]` from `PropertyId.SpeechServiceResponse_JsonResult`, defaulting any missing `AccuracyScore`/`ErrorType` field to `0`/`"None"` rather than throwing, so a partially-unexpected Azure response degrades to a plausible word score instead of crashing the request.
- `audio_too_long` guard uses `> 30_000` ms (Azure's documented single-shot `recognizeOnceAsync` limit per RESEARCH.md Pitfall 2), placed before the transcode call so no ffmpeg subprocess is spawned for clips that will be rejected anyway.

## Deviations from Plan

None - plan executed exactly as written. The one implementation-detail fix (typing the SDK's `recognizeOnceAsync` error callback as `string` instead of relying on `instanceof Error`, which `tsc --noEmit` flagged as invalid on a non-object type) is a Rule 1 (bug/blocking type error) auto-fix, resolved inline before the Task 3 commit and covered by the existing test suite (no separate fix commit needed).

## Issues Encountered
- `npm run typecheck` initially failed on `error instanceof Error` inside the Azure SDK's `recognizeOnceAsync` failure callback, because the SDK's callback signature types `error` as `string`, not `unknown`/`Error`. Fixed by typing the parameter explicitly as `string` and wrapping it directly in `new Error(error)`. Verified via a clean `tsc --noEmit` re-run and the still-passing test suite.

## User Setup Required

None - no external service configuration required by this plan. (Azure Speech resource provisioning was already covered as setup context in 09-01/RESEARCH.md; this plan's automated tests use only injected fakes and never call the real Azure API.)

## Next Phase Readiness

- Three composable, independently-tested units exist — transcode (Blob -> WAV), score (WAV + reference -> typed result with derived star band), and map (score -> star / ErrorType -> label) — ready for 09-04 to wire `scorePronunciation` into `uploadAttemptAudioClip`'s best-effort, non-blocking call site.
- No pipeline wiring, UI, or DB writes were introduced by this plan (as scoped) — `pronunciation_scores` persistence, `StepAiEvaluationFeedback.tsx` star rendering, and the teacher diagnostic panel remain for 09-04/09-05/09-06.
- Full automated suite (341 tests, 4 pre-existing skips) and `tsc --noEmit` are clean; `npm run lint` clean.

---
*Phase: 09-pronunciation-scoring*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 6 created files verified present on disk; all 5 task commit hashes (70ca95a2, 6bfe67db, fcd50785, 966164ed, eefa49f8) verified in git log.
