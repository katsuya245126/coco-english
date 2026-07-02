# Phase 9: Pronunciation Scoring - Research

**Researched:** 2026-07-02
**Domain:** Azure AI Speech Pronunciation Assessment integration into an existing Next.js/Supabase ESL homework app
**Confidence:** MEDIUM-HIGH (Azure API surface and audio-format constraints are well-documented and cross-checked against official Microsoft Learn pages; calibration accuracy against this app's real students is explicitly empirical and cannot be pre-verified by research)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Scoring Trigger):** Pronunciation scoring runs automatically, inline with the existing AI evaluation pipeline — scored right after Whisper transcription / AI evaluation completes for a turn, so results are ready by the time the student sees feedback and the teacher opens review. No separate on-demand or batched job.
- **D-02 (Student-Facing Feedback Placement):** Pronunciation feedback appears inline on the existing per-turn feedback step (`StepAiEvaluationFeedback.tsx`), alongside the meaning/target-pattern feedback the student already sees — one unified feedback moment, not a separate screen or end-of-mission-only summary.
- **D-03 (Band Scale):** 1-3 stars, always shown. Star count mirrors the app's existing 3-level qualitative vocabulary (`Understood`/`Try again`/`Needs teacher check` from `src/server/teacher/audio-evidence.ts`): 3★ = great, 2★ = good, 1★ = keep practicing. Every attempt shows at least 1 star with encouraging copy — never an empty/failed-looking result, never a red X, never the raw Azure 0-100 score. A 1-star result still uses positive framing ("Keep practicing!" not "Poor"/"Failed").
- **D-04 (Calibration, PRON-03):** Score-band thresholds (what Azure score maps to 1★/2★/3★) are validated by a manual spot-check: run Azure scoring against a sample of already-stored v1 audio from this app's own 6 students, the teacher/operator reviews raw scores against known student ability, and manually sets/adjusts thresholds before turning on student-facing display. One-time calibration pass gating student visibility, not a permanent automated calibration feature.
- **D-05 (Teacher Diagnostic Panel):** Collapsed/expandable section per turn, added under each turn's existing transcript block on the evidence page (`src/app/teacher/evidence/[attemptId]/page.tsx`). Collapsed by default; teacher expands only when curious. Never displaces or auto-opens over the transcript — matches the existing on-demand audio-playback pattern (Phase 5 D-13/D-14).
- **D-06 (Data Storage, PRON-06):** Pronunciation scores stored in a dedicated `pronunciation_scores` table keyed on the audio clip (`audio_clips.id`), independent of `attempt_turns.evaluation` (different vendor, independently re-scorable without touching Phase 6's evaluation data).
- **D-07 (FERPA/COPPA Data-Use Note, PRON-02):** Short markdown doc in the repo (e.g. `.planning/azure-speech-data-use.md`) summarizing: what's sent to Azure (short per-turn audio clip + target sentence text), Azure's data retention/training-use policy for the Pronunciation Assessment API, and confirmation no PII beyond the clip itself is transmitted. Internal record; must exist before any student audio is sent to Azure — hard gate per PRON-02, not a nice-to-have.
- **D-08 (Backfill Scope):** Forward-only, no backfill. Only attempts completed after this phase ships get scored. Attempts completed before this phase are not retroactively scored; the teacher's diagnostic panel shows no pronunciation data for older attempts. No bulk Azure-call backfill job.

### Claude's Discretion

- Exact Azure SDK integration approach, API call shape, and env var naming (following the existing `.env.example` pattern used for other vendor keys).
- Exact mapping from Azure's accuracy/fluency/completeness score dimensions into the 1-3 star scale — informed by D-04's manual calibration pass.
- Exact word-level highlight rendering within the collapsed teacher panel (color-coding, phoneme detail depth) — must remain additive and never inline-highlight the primary transcript text itself (that stays clean per D-05).
- Where exactly the `.env.example` / config entries and the data-use doc physically live, following existing repo conventions.
- Whether `pronunciation_scores` rows are created eagerly for every scored clip or lazily — implementation detail, does not change D-01's "scoring runs automatically inline" contract from the user's perspective.

### Deferred Ideas (OUT OF SCOPE)

- Backfilling pronunciation scores for pre-Phase-9 completed attempts — explicitly deferred (D-08); could be a future one-off script if the teacher wants historical data later.
- Automated/self-adjusting calibration (vs. the one-time manual spot-check in D-04) — out of scope; revisit only if score quality drifts or the student count grows significantly.
- Teacher-facing summary of the data-use note (vs. internal-only doc) — user chose internal doc only (D-07).
- Phoneme-level (vs word-level) scoring detail (PRON-F1, project-level deferral) — deferred until word-level scoring is validated in production.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRON-01 | Score a student's spoken turn against the target sentence using a pronunciation-assessment API, reusing per-turn audio and target/improved sentences already captured in v1 | Azure SDK integration pattern (Standard Stack, Architecture Patterns); hook point identified in `uploadAttemptAudioClip` (`src/server/student-access/audio-upload.ts`) right after transcription succeeds |
| PRON-02 | Vendor is Azure AI Speech Pronunciation Assessment (pay-per-second, free tier expected ~$0/mo at current volume); documented FERPA/COPPA data-use understanding exists before student audio is sent | Pricing research (Standard Stack); Azure data-privacy findings (Security Domain, Sources) directly populate the D-07 data-use doc |
| PRON-03 | Scoring accuracy validated against this app's own students' stored v1 audio before student-facing results are trusted | Common Pitfalls (calibration pitfall); this is empirical work the planner must schedule as a phase task, not something research can pre-verify |
| PRON-04 | Students see qualitative bands/stars/color and word-level "what to fix" highlights — never a raw numeric score | Azure `ErrorType` field (Omission/Insertion/Mispronunciation/etc.) maps directly to word-level highlights (Code Examples); star-mapping pattern in Architecture Patterns |
| PRON-05 | Teacher review surfaces per-word pronunciation breakdown as additive diagnostic, never displacing transcript | Existing collapsed/on-demand UI pattern (`AudioClipPlayer.tsx`) reused; insertion point identified in evidence page |
| PRON-06 | Pronunciation scores stored in dedicated `pronunciation_scores` table keyed on audio clip, independent of turn-evaluation data | Migration schema design (Architecture Patterns, Code Examples) |
</phase_requirements>

## Summary

Phase 9 adds Azure AI Speech Pronunciation Assessment scoring on top of the existing v1 audio-capture pipeline. The integration point is precise and well-understood: `uploadAttemptAudioClip` in `src/server/student-access/audio-upload.ts` already runs Whisper transcription and OpenAI turn-evaluation inline, right after the audio Blob is uploaded to Supabase Storage — this is exactly where a third adapter call (Azure pronunciation scoring) belongs per D-01, using the same in-memory audio Blob already available in that function before it goes out of scope.

The one load-bearing technical fact this research surfaced that isn't obvious from the phase description: **the Node.js/JavaScript Azure Speech SDK does not accept compressed audio** (webm, mp4/m4a, mp3) directly — `microsoft-cognitiveservices-speech-sdk`'s `AudioConfig.fromWavFileInput` only accepts PCM WAV (16kHz/8kHz, 16-bit, mono), and unlike Python/C++/Java, the JS SDK has no GStreamer compressed-input path. Since this app's `ALLOWED_AUDIO_MIME_TYPES` includes `audio/webm`, `audio/mp4`, `audio/m4a`, `audio/mpeg`, `audio/wav`, every non-WAV clip must be transcoded server-side before calling Azure. `ffmpeg-static` (bundles a static binary, invoked via `node:child_process`) is the pragmatic choice — it is already proven to work in Vercel serverless functions (this app's deployment target) and avoids the deprecated `fluent-ffmpeg` wrapper.

Azure's pronunciation assessment result gives accuracy/fluency/completeness/prosody scores plus a `PronScore` overall, and — critically for PRON-04 — a per-word `ErrorType` (`None`/`Omission`/`Insertion`/`Mispronunciation`/`UnexpectedBreak`/`MissingBreak`/`Monotone`) that maps directly onto "what to fix" highlights without needing custom NLP. For real-time (non-batch) pronunciation assessment, Microsoft's own data-privacy documentation states audio is processed in server memory only and not retained at rest — this is the strongest single fact for the D-07 FERPA/COPPA doc, though the planner should still have the doc explicitly cite this and note Microsoft's standard "you are responsible for compliance in your jurisdiction" disclaimer.

**Primary recommendation:** Install `microsoft-cognitiveservices-speech-sdk` (npm, official Microsoft package, v1.50.0) + `ffmpeg-static` for WAV transcoding; add a new `src/server/audio/pronunciation-scorer.ts` adapter following the exact `TranscribeAudioFileDeps`/injectable-client pattern used by `transcription.ts` and `turn-evaluator.ts`; call it from `uploadAttemptAudioClip` right after `transcribeAudioFile` succeeds; write results to a new `pronunciation_scores` table; map `AccuracyScore`/`PronScore` to a 1-3 star band via a small pure function the calibration task (PRON-03) will tune; surface stars inline in `StepAiEvaluationFeedback.tsx` and a collapsed per-word panel in the evidence page.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audio transcoding (webm/mp4/mp3 → PCM WAV) | API / Backend | — | Must happen server-side; raw audio never leaves the server, and the JS Speech SDK requires WAV input |
| Azure pronunciation scoring call | API / Backend | — | Server-owned computation (per existing pattern: never trust client-submitted scores); vendor key is server-only |
| Score-to-star band mapping | API / Backend | — | Pure function, testable, tunable by the D-04 calibration pass without touching Azure call code |
| `pronunciation_scores` persistence | Database / Storage | API / Backend | New table, RLS-enabled like all other tables in this schema; written by the server-role client only |
| Student star display | Browser / Client | — | `StepAiEvaluationFeedback.tsx` is a client component (`"use client"`); receives pre-computed star band as a prop, no client-side scoring logic |
| Teacher word-level diagnostic panel | Browser / Client | Frontend Server (SSR) | Evidence page is a Next.js Server Component that fetches evidence server-side (`getAttemptEvidenceForTeacher`) and passes it to a collapsed client-rendered detail section |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `microsoft-cognitiveservices-speech-sdk` | 1.50.0 (verified via `npm view`, published 2026-05-12) | Azure AI Speech SDK for Node.js — pronunciation assessment, speech recognition | Official Microsoft-published SDK (all npm maintainers are `@microsoft.com` accounts, GitHub repo under `Microsoft/cognitive-services-speech-sdk-js`), the only supported way to call Pronunciation Assessment from Node.js besides raw REST |
| `ffmpeg-static` | 5.3.0 (verified via `npm view`) | Bundles a static `ffmpeg` binary for transcoding webm/mp4/mp3 → 16kHz mono PCM WAV before sending to Azure | Required because the JS Speech SDK's `fromWavFileInput` only accepts PCM WAV; there is no GStreamer/compressed-input path in the JS SDK (unlike Python/C++/Java) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:child_process` (built-in) | n/a | Invoke the `ffmpeg-static` binary path directly | Preferred over `fluent-ffmpeg` — simpler, no extra dependency layer, and avoids a deprecated package |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `microsoft-cognitiveservices-speech-sdk` (WebSocket-based SDK) | Raw Azure Speech REST API (`Pronunciation-Assessment` base64 header) | REST avoids the SDK's WAV-only constraint conceptually but Microsoft's own docs are explicit that pronunciation-assessment audio format support is "more limited" over REST too, and REST still expects short (<30s) audio; the SDK is better documented and has first-class result types (`PronunciationAssessmentResult`). Not recommended as primary path, but worth knowing REST exists if the SDK proves awkward in a serverless function. |
| `ffmpeg-static` | `@ffmpeg-installer/ffmpeg` | Functionally equivalent (also OK verdict, official-ish community package, 1M+ weekly downloads); either works. `ffmpeg-static` was slightly more recently published (Nov 2025 vs Jul 2021) — prefer `ffmpeg-static` unless it fails on the deploy target. |
| `ffmpeg-static` | `fluent-ffmpeg` | **Avoid.** Flagged `SUS` — deprecated on npm despite 1.8M weekly downloads. Do not add as a new dependency. |
| Azure real-time SDK call (audio buffer → WAV → single `recognizeOnceAsync`) | Azure continuous/streaming mode | Continuous mode is for audio >30s or live-streaming UX; this app's turns are short scripted student answers well under 30s (student `MAX_AUDIO_DURATION_MS` is 90s but individual turn recordings are typically much shorter spoken sentences) — confirm actual clip duration against the 30s single-shot limit during implementation (see Common Pitfalls). |

**Installation:**
```bash
npm install microsoft-cognitiveservices-speech-sdk ffmpeg-static
```

**Version verification:** Verified 2026-07-02 via `npm view <package> version`:
- `microsoft-cognitiveservices-speech-sdk` → `1.50.0` (published 2026-05-12)
- `ffmpeg-static` → `5.3.0` (published 2025-11-14)

Training-data versions would have been stale (Azure Speech SDK ships frequent point releases); always re-verify at implementation time since these are live, actively maintained packages.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `microsoft-cognitiveservices-speech-sdk` | npm | Long-established (latest 1.50.0 published 2026-05-12); maintainers are official `@microsoft.com` accounts | 323,757/wk | github.com/Microsoft/cognitive-services-speech-sdk-js | OK | Approved |
| `ffmpeg-static` | npm | Published 2025-11-14 (package itself long-established, this is a routine version bump) | 1,099,461/wk | github.com/eugeneware/ffmpeg-static | OK | Approved |
| `@ffmpeg-installer/ffmpeg` | npm | Published 2021-07-15 | 1,007,358/wk | github.com/kribblo/node-ffmpeg-installer | OK | Alternative — not selected, listed for completeness |
| `fluent-ffmpeg` | npm | Published 2024-05-19 | 1,870,173/wk | github.com/fluent-ffmpeg/node-fluent-ffmpeg | SUS | **REMOVED** — flagged `deprecated` on the registry despite high downloads; do not install |
| `wav-decoder` | npm | Published 2017-08-10 | 24,468/wk | github.com/mohayonao/wav-decoder | OK | Not needed (ffmpeg output can be piped directly to the Speech SDK's `fromWavFileInput` as a Buffer) — listed only because it was checked during research |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `fluent-ffmpeg` — do not use; use `ffmpeg-static` with direct `child_process` invocation instead. No checkpoint needed since the planner should simply exclude it from the stack, not gate an install of it.

*`microsoft-cognitiveservices-speech-sdk` and `ffmpeg-static` package names were discovered via WebSearch/training knowledge and then independently confirmed via `npm view` (existence + version) and the `package-legitimacy check` seam (registry signals: maintainers, repo, downloads, deprecation status) — this combination satisfies `[VERIFIED: npm registry]` status per the provenance rule (authoritative source: official Microsoft Learn docs name the exact npm package `microsoft-cognitiveservices-speech-sdk`, cross-checked against the registry).*

## Architecture Patterns

### System Architecture Diagram

```
Student records answer (browser)
        |
        v
POST audio Blob -> uploadAttemptAudioClip()  [src/server/student-access/audio-upload.ts]
        |
        |-- 1. Upload Blob to Supabase Storage (student-audio bucket)      [existing]
        |-- 2. transcribeAudioFile(Blob)  -> Whisper transcript            [existing]
        |-- 3. evaluateOriginalTurn/evaluateRepeatTurn(transcript)         [existing]
        |         -> writes attempt_turns.evaluation (Phase 6 boundary)
        |
        |-- 4. NEW: scorePronunciation(Blob, targetSentence)               [Phase 9]
        |         a. transcodeToWav(Blob) via ffmpeg-static (webm/mp4/mp3 -> 16kHz mono PCM WAV)
        |         b. Azure SpeechRecognizer + PronunciationAssessmentConfig
        |              .fromWavFileInput(wavBuffer) -> recognizeOnceAsync()
        |         c. Map AccuracyScore/PronScore -> 1-3 star band (calibrated thresholds)
        |         d. Extract per-word ErrorType -> word-level "what to fix" list
        |         -> writes pronunciation_scores row keyed on audio_clips.id
        |              (independent table, does NOT touch attempt_turns.evaluation)
        |
        v
Student sees: StepAiEvaluationFeedback.tsx
              existing meaning/pattern feedback + NEW inline star band (D-02, D-03)
              (never the raw 0-100 score)

Teacher opens: /teacher/evidence/[attemptId]
              existing transcript-first turn cards
              + NEW collapsed <details>-style per-word diagnostic panel (D-05)
                (word list with accuracy/ErrorType, closed by default)
```

### Recommended Project Structure
```
src/
├── server/
│   └── audio/
│       ├── transcription.ts           # existing (Whisper)
│       ├── tts-generator.ts           # existing (OpenAI TTS)
│       ├── tts-cache.ts               # existing
│       ├── pronunciation-scorer.ts    # NEW: Azure adapter, injectable client, same shape as transcription.ts
│       └── audio-transcode.ts         # NEW: ffmpeg-static wrapper, webm/mp4/mp3 -> WAV Buffer
├── domain/
│   └── pronunciation/
│       └── scoring.ts                 # NEW: pure functions — score->star mapping, ErrorType->highlight mapping
├── server/student-access/
│   └── audio-upload.ts                # MODIFIED: call scorePronunciation() after transcribeAudioFile() succeeds
├── server/teacher/
│   └── audio-evidence.ts              # MODIFIED: join pronunciation_scores into AttemptTurnEvidence
├── components/student/
│   └── StepAiEvaluationFeedback.tsx   # MODIFIED: render star band inline (D-02)
├── components/teacher/
│   └── PronunciationDiagnosticPanel.tsx  # NEW: collapsed per-word panel (D-05), pattern-matches AudioClipPlayer.tsx
└── app/teacher/evidence/[attemptId]/page.tsx  # MODIFIED: insertion point for panel under each turn's transcript
```

### Pattern 1: Injectable-Client Vendor Adapter (existing project convention)
**What:** Every external AI/vendor call in this codebase (`transcription.ts`, `turn-evaluator.ts`, `tts-generator.ts`) follows the same shape: a `Deps` type with an optional injected `client`, `resolveApiKey()`/`resolveModel()` helpers reading `process.env`, a try/catch that logs a generic error code (never leaking provider exception text or student audio/text into logs), and a discriminated-union result type (`{ ok: true, ... } | { ok: false, error: ... }`).
**When to use:** For the new `pronunciation-scorer.ts` — this keeps tests injecting a fake Azure client so automated verification never calls the paid Azure API, exactly like `tests/server/transcription.test.ts` and `tests/server/turn-evaluator.test.ts`.
**Example:**
```typescript
// Source: existing src/server/audio/transcription.ts pattern, adapted
export type PronunciationScoreError =
  | "missing_api_key"
  | "transcode_failed"
  | "provider_failed"
  | "audio_too_long";

export type PronunciationScoreResult =
  | { ok: true; score: PronunciationScoreDetail }
  | { ok: false; error: PronunciationScoreError };

export type PronunciationScorerDeps = {
  apiKey?: string;
  region?: string;
  client?: PronunciationRecognizerFactory; // injectable for tests
  transcodeToWav?: (blob: Blob, mimeType: string) => Promise<Buffer>;
};

function resolveApiKey(deps?: PronunciationScorerDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.AZURE_SPEECH_KEY?.trim() ?? "";
}
```

### Pattern 2: Azure Pronunciation Assessment call against a file/buffer (not live mic)
**What:** Construct `PronunciationAssessmentConfig` with the target/improved sentence as `referenceText`, apply it to a `SpeechRecognizer` built from a WAV buffer via `AudioConfig.fromWavFileInput`, call `recognizeOnceAsync`, then read `PronunciationAssessmentResult.fromResult(result)` or the raw JSON via `PropertyId.SpeechServiceResponse_JsonResult`.
**When to use:** This is the only supported way to run scripted (reference-text) assessment against pre-recorded audio in Node.js.
**Example:**
```javascript
// Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment
// (JavaScript zone-pivot, adapted for Node.js server usage)
const sdk = require("microsoft-cognitiveservices-speech-sdk");

const speechConfig = sdk.SpeechConfig.fromSubscription(apiKey, region);
speechConfig.speechRecognitionLanguage = "en-US";

const audioConfig = sdk.AudioConfig.fromWavFileInput(wavBuffer); // 16kHz/16-bit/mono PCM WAV only

const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
  referenceText,                                    // the target/improved sentence text
  sdk.PronunciationAssessmentGradingSystem.HundredMark,
  sdk.PronunciationAssessmentGranularity.Phoneme,   // returns word + phoneme detail
  false,                                             // enableMiscue — not needed for short scripted sentences
);

const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
pronunciationAssessmentConfig.applyTo(recognizer);

recognizer.recognizeOnceAsync((result) => {
  const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(result);
  // pronunciationResult.accuracyScore / .fluencyScore / .completenessScore / .pronunciationScore
  const json = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
  // json.NBest[0].Words[] each has PronunciationAssessment.AccuracyScore + ErrorType
});
```

### Pattern 3: Score-to-star band mapping (D-03, tunable by D-04 calibration)
**What:** A single pure function mapping Azure's numeric score to the app's 1-3 star scale, isolated so the manual calibration pass (D-04) can adjust thresholds without touching the Azure call code.
**When to use:** Called immediately after receiving Azure's result, before any persistence or UI rendering.
**Example:**
```typescript
// Source: project convention (mirrors mapMeaningResult() in audio-evidence.ts)
// Placeholder thresholds — MUST be replaced by D-04's manual calibration pass
// against this app's own 6 students before student-facing display is enabled.
export function scoreToStarBand(pronScore: number): 1 | 2 | 3 {
  if (pronScore >= 80) return 3; // great
  if (pronScore >= 60) return 2; // good
  return 1;                       // keep practicing (never 0, never a failure state)
}

export const STAR_BAND_COPY: Record<1 | 2 | 3, string> = {
  3: "Great job!",
  2: "Good try!",
  1: "Keep practicing!", // never "Poor" / "Failed" (D-03)
};
```

### Anti-Patterns to Avoid
- **Sending raw Azure scores to the client:** PRON-04 and D-03 explicitly forbid this. Even in dev tools/network tab, avoid returning the raw 0-100 score in any student-facing API response — compute the star band server-side and send only the band + copy.
- **Calling Azure with compressed audio directly:** Passing a webm/mp4/mp3 Blob straight into `AudioConfig.fromWavFileInput` will fail silently or throw — always transcode to PCM WAV first (see Common Pitfalls).
- **Blocking the student's feedback screen on Azure latency:** D-01 requires scoring to complete inline before the student sees feedback, but Azure network calls add latency to an already-multi-step pipeline (upload → transcribe → evaluate → **now also transcode + score**). Budget for this in the plan; consider whether transcode+score can run concurrently with the OpenAI evaluation call (`Promise.all`) rather than strictly serially, since they operate on independent inputs (audio vs. transcript).
- **Storing calibration thresholds as a hardcoded magic number with no single source of truth:** D-04 is a one-time manual pass but will likely need a re-run if score distributions look off after real classroom use — keep thresholds in one exported constant/table, not scattered inline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting which specific word/phoneme a child mispronounced | A custom text-diff or phonetic-similarity algorithm | Azure's built-in `ErrorType` field (`Omission`/`Insertion`/`Mispronunciation`/`UnexpectedBreak`/`MissingBreak`/`Monotone`) per word, already computed by the Pronunciation Assessment API | Azure's model is trained on 100,000+ hours of native-speaker data specifically for this purpose; a hand-rolled comparison would be far less accurate and is explicitly the kind of "deceptively complex" problem this vendor exists to solve |
| Converting browser-recorded compressed audio to a format Azure accepts | A hand-rolled WAV encoder or raw PCM math | `ffmpeg-static` + `child_process` (industry-standard, battle-tested transcoding) | Audio codec handling (webm/Opus, mp4/AAC, mp3 → PCM WAV with exact sample rate/bit depth/channel requirements) is a well-solved problem; hand-rolling risks subtle sample-rate or endianness bugs that silently degrade Azure's accuracy scores |
| Deciding pronunciation score thresholds for "encouraging" bands from first principles | Guessing star thresholds from Azure's documentation examples alone | The D-04 manual calibration pass against this app's own real 6 students' stored v1 audio | This is explicitly flagged by the roadmap as empirical validation, not literature research — no generic ESL benchmark substitutes for checking against this specific population (young Korean/ESL learners) |

**Key insight:** The two genuinely hard technical problems in this phase — phoneme-level mispronunciation detection and encouraging-yet-accurate score calibration — are already solved by Azure's API (for the former) and by a deliberate one-time human-in-the-loop step (for the latter, per D-04). The phase's engineering work is almost entirely plumbing: transcode, call, map, store, render additively. Resist the temptation to add custom scoring logic beyond the star-band mapping function.

## Common Pitfalls

### Pitfall 1: JS Speech SDK silently requires PCM WAV, not the browser's recorded format
**What goes wrong:** Passing the raw uploaded Blob (webm/mp4/mp3 per this app's `ALLOWED_AUDIO_MIME_TYPES`) directly to `AudioConfig.fromWavFileInput` fails — the JS SDK, unlike Python/C++/Java, has no GStreamer-based compressed-input path (per Microsoft's own docs: "The Speech SDK for JavaScript does not support compressed audio").
**Why it happens:** Most tutorials/samples assume browser-side recording already produces WAV, or demonstrate other language SDKs that do support compressed input via GStreamer.
**How to avoid:** Always transcode to 16kHz (or 8kHz) mono 16-bit PCM WAV via `ffmpeg-static` before calling the Speech SDK. Write this as an explicit `audio-transcode.ts` step with its own error type (`transcode_failed`), tested independently of the Azure call.
**Warning signs:** Azure call returns `RecognitionStatus` errors, empty results, or throws on non-WAV input during manual testing.

### Pitfall 2: 30-second single-shot limit for pronunciation assessment
**What goes wrong:** Azure's pronunciation assessment via `recognizeOnceAsync` supports audio up to ~30 seconds; longer clips need continuous mode, which does not support `EnableMiscue` and changes the result-handling code path (multiple recognized events instead of one).
**Why it happens:** This app's existing `MAX_AUDIO_DURATION_MS = 90_000` (90 seconds) ceiling for uploaded clips was set for Whisper transcription, which has no such limit — it was never validated against Azure's pronunciation-assessment constraint.
**How to avoid:** Check actual student turn-recording durations in practice (likely short single sentences, well under 30s) but add an explicit duration guard before calling Azure: if `duration_ms > 30_000`, either skip pronunciation scoring gracefully (leave `pronunciation_scores` row absent, matching the "not-yet-available" state already defined for pre-Phase-9 attempts per D-08) or switch to continuous mode. Do not assume all clips are short — a shy or confused student re-explaining at length is plausible.
**Warning signs:** Azure returns partial/truncated results or errors on longer clips during the D-04 calibration spot-check against real stored audio.

### Pitfall 3: Calibration must happen before ANY student sees a star, not per-deployment
**What goes wrong:** Shipping the inline star UI (D-02/D-03) live before running the D-04 manual calibration pass risks showing a demoralizing 1-star result to a child whose pronunciation was actually fine, simply because default/example Azure thresholds (tuned for adult/native comparison) are miscalibrated for young non-native ESL speech.
**Why it happens:** It's tempting to ship the full vertical slice (score → store → display) in one plan/wave since it's "just wiring," skipping the explicit calibration gate.
**How to avoid:** Structure the plan so scoring + storage (PRON-01, PRON-06) can ship and run silently (writing to `pronunciation_scores`, visible only in a not-yet-built or feature-flagged teacher panel) *before* the student-facing star UI (PRON-04) is turned on. The calibration task (spot-check against the 6 real students' stored audio, set thresholds) must be an explicit phase task gating the final student-UI-enablement task.
**Warning signs:** A plan wave that ships student-facing stars in the same task as the first Azure integration, with no separate calibration checkpoint.

### Pitfall 4: Azure region + endpoint mismatch
**What goes wrong:** `SpeechConfig.fromSubscription(key, region)` requires the exact Azure region string (e.g. `"eastus"`) matching where the Speech resource was provisioned; a wrong region produces auth or 404-style failures that look like a bad key.
**Why it happens:** Region is easy to omit or hardcode incorrectly when following quickstart samples that assume a fixed region.
**How to avoid:** Add both `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` (or a full custom endpoint) to `.env.example`, following the existing pattern of documenting server-only vendor env vars with a comment (see `OPENAI_API_KEY` / `OPENAI_TRANSCRIPTION_MODEL` block in `.env.example`).
**Warning signs:** Azure calls fail immediately with generic auth errors despite a correct-looking key.

### Pitfall 5: Serverless (Vercel) function constraints on ffmpeg + Azure SDK
**What goes wrong:** Bundling `ffmpeg-static`'s binary and running a real subprocess inside a Vercel serverless function can hit function size limits, cold-start latency, or (rarely) missing-binary issues if the build doesn't include the platform-specific binary for Vercel's Linux runtime.
**Why it happens:** `ffmpeg-static` downloads a platform-specific binary at `npm install` time; local dev (macOS) and Vercel's build environment (Linux x64) need matching binaries, which `ffmpeg-static`/`@ffmpeg-installer/ffmpeg` both handle automatically via postinstall platform detection — but this should be explicitly verified in the actual deploy environment, not assumed.
**How to avoid:** After implementation, deploy to a Vercel preview and manually trigger one real Azure-scored turn to confirm ffmpeg actually runs server-side in production, not just in local dev. Add this as an explicit verification step, not just unit tests with a stubbed transcode function.
**Warning signs:** Works locally, fails only in the Vercel preview/production deployment with an `ENOENT` or "spawn ffmpeg" error.

## Code Examples

### Migration: `pronunciation_scores` table (PRON-06, D-06)
```sql
-- Source: pattern-matched from existing migrations (202606250001_foundation_schema.sql, audio_clips table)
create table public.pronunciation_scores (
  id uuid primary key default gen_random_uuid(),
  audio_clip_id uuid not null references public.audio_clips(id) on delete cascade,
  provider text not null default 'azure_speech',
  reference_text text not null,
  accuracy_score numeric not null check (accuracy_score >= 0 and accuracy_score <= 100),
  fluency_score numeric check (fluency_score >= 0 and fluency_score <= 100),
  completeness_score numeric check (completeness_score >= 0 and completeness_score <= 100),
  pronunciation_score numeric not null check (pronunciation_score >= 0 and pronunciation_score <= 100),
  star_band smallint not null check (star_band in (1, 2, 3)),
  word_scores jsonb not null default '[]'::jsonb, -- per-word AccuracyScore + ErrorType array
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (audio_clip_id) -- one score per clip; re-scoring updates in place (D-06: "independently re-scorable")
);

alter table public.pronunciation_scores enable row level security;
-- RLS policy pattern: follow existing audio_clips read-policy shape (teacher owns via
-- attempt_turns -> attempts -> assignment_students -> assignments -> classes.teacher_id chain)
```

### Server-side WAV transcode via ffmpeg-static
```typescript
// Source: standard ffmpeg-static usage pattern (project convention: server-only module)
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export async function transcodeToWav(input: Blob): Promise<Buffer> {
  const inputBuffer = Buffer.from(await input.arrayBuffer());

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath as string, [
      "-i", "pipe:0",
      "-ar", "16000",   // 16kHz sample rate (Azure default)
      "-ac", "1",       // mono
      "-f", "wav",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Content assessment (vocabulary/grammar/topic scoring) via Speech SDK preview API | Retired from Speech SDK 1.46.0+; use Azure OpenAI chat models (e.g. gpt-4o) for content assessment instead | Documented as of the current Microsoft Learn page (checked 2026-07-02) | Not directly relevant to Phase 9's scope (pronunciation only, not content/grammar), but worth knowing this app already has an OpenAI-based evaluator (Phase 6 `turn-evaluator.ts`) that plays this role — do not attempt to also use Azure for content scoring |

**Deprecated/outdated:**
- `fluent-ffmpeg`: flagged deprecated on the npm registry despite continued high download counts — do not adopt as a new dependency for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Individual student turn audio clips are typically well under Azure's 30-second single-shot pronunciation-assessment limit | Common Pitfalls (Pitfall 2) | If wrong, a meaningful fraction of clips silently fail scoring or need continuous-mode handling added; low-moderate risk since D-08 already tolerates "no pronunciation data" as a valid empty state, but should be confirmed against real stored audio during the D-04 calibration pass rather than assumed |
| A2 | `ffmpeg-static`'s bundled binary works correctly inside a Vercel serverless Node.js function without additional configuration | Common Pitfalls (Pitfall 5) | If wrong, transcoding fails only in production/preview deploys; moderate risk, mitigated by requiring an explicit Vercel-preview verification step before considering the phase done |
| A3 | Concurrent (`Promise.all`) execution of the OpenAI turn-evaluation call and the new Azure transcode+score call is safe and won't introduce race conditions in `uploadAttemptAudioClip` | Anti-Patterns (blocking latency note) | Low risk technically (the two calls read independent inputs and write to independent tables), but this is an implementation choice for the planner to make explicitly, not something verified here — flagging so the plan doesn't default to naive serial `await` chains that add unnecessary latency to the student's wait time |

**None of these block planning** — they are implementation-detail confirmations the planner/executor should verify during the phase, not blockers to scoping tasks now.

## Open Questions

1. **Should pronunciation scoring failures (Azure down, transcode failure) block the student's existing feedback flow, or degrade gracefully?**
   - What we know: D-01 says scoring "runs automatically inline" and should be "ready by the time the student sees feedback." The existing pattern for AI evaluation failures (`provider_failed`, `schema_failed`) routes to teacher review rather than blocking the student.
   - What's unclear: Whether a pronunciation-scoring failure should also route to a "needs teacher check" style state, or simply omit the star band for that turn (silently degrade) while the rest of the feedback (meaning/pattern) proceeds normally.
   - Recommendation: Given D-03's "every attempt shows at least 1 star... never an empty/failed-looking result" language is about the *scored* case, the safest interpretation is: on Azure/transcode failure, omit the star band entirely for that turn (don't fabricate a fake 1-star) and let the existing meaning/pattern feedback proceed unaffected — pronunciation scoring is explicitly additive (per D-05/D-06 framing), so its failure should never block the core homework loop. The planner should confirm this framing explicitly as a task requirement.

2. **Does the teacher's per-word diagnostic panel need syllable/phoneme depth, or is word-level `ErrorType` sufficient for v1?**
   - What we know: PRON-05 requires "per-word pronunciation breakdown." PRON-F1 (phoneme-level detail) is explicitly deferred to a future point release. D-04's calibration is described as a manual review of "raw scores," not phoneme drill-down.
   - What's unclear: Whether "Claude's Discretion" on "phoneme detail depth" (per CONTEXT.md) means phoneme data should be stored now (in `word_scores` jsonb) even if not rendered, for future-proofing.
   - Recommendation: Store the full word-level `PronunciationAssessment` block (including nested `Syllables`/`Phonemes` if granularity is set to `Phoneme`) in the `word_scores` jsonb column regardless — it costs nothing extra from Azure (same API call) and un-blocks PRON-F1 later without a backfill. Render only word-level `AccuracyScore`/`ErrorType` in the v1 UI per PRON-05's stated scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Azure AI Speech resource (subscription key + region) | PRON-01, PRON-02 | Not yet provisioned (must be created before phase execution) | — | Blocking — teacher/operator must provision an Azure Speech resource and free-tier (F0) key before this phase can be executed; this is a setup task the plan must include |
| `ffmpeg` (local dev, via `ffmpeg-static`) | Audio transcoding | ✓ (verified: `/opt/homebrew/bin/ffmpeg`, v8.1.2 present on this dev machine; `ffmpeg-static` bundles its own binary so this is not a hard runtime dependency, just confirms transcoding is a well-supported local operation) | 8.1.2 (system) / 5.3.0 (npm bundled) | — |
| Vercel serverless deploy target | Running ffmpeg + Azure SDK in production | Confirmed via `vercel.json` (existing cron jobs already deployed there) | — | See Pitfall 5 — verify explicitly with a preview deploy rather than assuming parity with local dev |

**Missing dependencies with no fallback:**
- Azure AI Speech resource/key — must be provisioned by the teacher/operator (human_needed setup task) before any scoring code can be tested against the real API. Tests should still use injected fake clients (per project convention) so this does not block automated verification, but the D-04 calibration pass against real stored audio is a genuine human/manual-setup blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.6 (existing project standard) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/server/pronunciation-scorer.test.ts` (new file, planner to create) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRON-01 | Pronunciation scoring runs against reused audio, no new capture | unit | `npm test -- tests/server/pronunciation-scorer.test.ts` | ❌ Wave 0 |
| PRON-01 | Scoring hooks into `uploadAttemptAudioClip` inline after transcription | unit | `npm test -- tests/server/audio-upload.test.ts` (extend existing) | ✅ existing file, needs new cases |
| PRON-03 | Score-to-star mapping function produces correct bands at threshold boundaries | unit | `npm test -- tests/domain/pronunciation-scoring.test.ts` | ❌ Wave 0 |
| PRON-03 | Manual calibration spot-check against 6 real students' stored audio | manual-only | n/a — human review task, not automatable; the operator must run scoring against real stored clips and adjust thresholds by inspection | ❌ Wave 0 (documented as a manual phase task, not a test file) |
| PRON-04 | Student never sees a raw numeric score in any API response or rendered DOM | unit + smoke | `npm test -- tests/server/pronunciation-scorer.test.ts` (assert response shape excludes raw score) + manual DOM inspection | ❌ Wave 0 |
| PRON-05 | Teacher panel is collapsed by default and additive (doesn't alter transcript DOM) | e2e or component | `npx playwright test tests/e2e/teacher-audio-evidence.spec.ts` (extend existing) | ✅ existing file, needs new cases |
| PRON-06 | `pronunciation_scores` row keyed on `audio_clips.id`, independent of `attempt_turns.evaluation` | schema/integration | `npm run test:schema` (extend `tests/schema/foundation-schema.test.ts` or add a new migration test) | ✅ existing pattern, new migration needs its own schema test |

### Sampling Rate
- **Per task commit:** targeted `npm test -- <file>` for the module just touched
- **Per wave merge:** `npm test` (full suite) + `npm run typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the D-04 manual calibration checkpoint explicitly signed off before enabling student-facing stars

### Wave 0 Gaps
- [ ] `tests/server/pronunciation-scorer.test.ts` — covers PRON-01, PRON-04 (adapter unit tests with injected fake Azure client, mirrors `tests/server/transcription.test.ts`)
- [ ] `tests/domain/pronunciation-scoring.test.ts` — covers PRON-03 (pure score-to-star mapping function, boundary tests)
- [ ] `tests/server/audio-transcode.test.ts` — new: covers the ffmpeg wrapper in isolation (can use a small fixture WAV/webm file, or mock `child_process.spawn`)
- [ ] Migration: `supabase/migrations/2026XXXX_pronunciation_scores.sql` — new table, needs schema test coverage added to `tests/schema/foundation-schema.test.ts` or a new schema test file
- [ ] Framework install: `npm install microsoft-cognitiveservices-speech-sdk ffmpeg-static`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth surface — scoring runs server-side, triggered by the already-authenticated student upload flow |
| V3 Session Management | No | Not touched by this phase |
| V4 Access Control | Yes | `pronunciation_scores` RLS must mirror `audio_clips`' existing teacher-ownership chain (teacher can only read scores for clips belonging to their own classes); service-role writes stay server-only, consistent with `createSupabaseServiceClient()` usage throughout this codebase |
| V5 Input Validation | Yes | Reference text (target/improved sentence) sent to Azure must be validated non-empty server-side before the API call (mirrors `validOriginalInput`/`validRepeatInput` checks in `turn-evaluator.ts`); audio duration must be checked against Azure's 30s single-shot limit before calling (Pitfall 2) |
| V6 Cryptography | No new requirement | Azure SDK handles TLS to the Speech endpoint internally; no custom crypto needed. `AZURE_SPEECH_KEY` should follow the same server-only-env-var handling as `OPENAI_API_KEY` (never `NEXT_PUBLIC_`-prefixed, never logged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Vendor API key leakage into client bundle or logs | Information Disclosure | `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` read only in server-only modules (`src/server/audio/pronunciation-scorer.ts`); never imported into a `"use client"` file — same guard rail already enforced for `OPENAI_API_KEY` per Phase 6 D-notes ("source-contract checks guard client/server AI boundaries") |
| Student audio sent to an unintended/wrong Azure resource due to region misconfig | Tampering (data sent to wrong endpoint) | Explicit `AZURE_SPEECH_REGION` env var, documented in `.env.example` with a comment, checked at startup/first-call rather than failing silently (Pitfall 4) |
| Cross-tenant data leakage: teacher A viewing pronunciation scores for teacher B's students | Elevation of Privilege / Information Disclosure | RLS policy on `pronunciation_scores` must replicate the exact ownership-chain pattern already used for `audio_clips`/`attempt_turns` (teacher_id traced through assignment_students → assignments → classes) |
| Raw pronunciation score exposed via API response inspection (network tab) even if UI hides it | Information Disclosure (policy violation, not a security vuln per se, but a explicit product requirement PRON-04) | Server action/route returning feedback to the student must omit the raw `accuracy_score`/`pronunciation_score` fields entirely from the response payload — return only the pre-computed star band and copy string, not "hide via CSS" |

## Sources

### Primary (HIGH confidence)
None — all findings below were sourced via WebSearch/WebFetch against official Microsoft Learn documentation (MEDIUM tier per this project's `classify-confidence` seam for cited-but-not-cross-verified sources), not Context7 or a project-embedded canonical doc.

### Secondary (MEDIUM confidence) — [CITED: source]
- [CITED: learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment] — Node.js/JavaScript SDK usage pattern, `PronunciationAssessmentConfig` parameters, JSON result shape including `ErrorType`, `NBestPhonemes`, scripted vs. unscripted result differences, 30-second single-shot limit, pronunciation score calculation formula.
- [CITED: learn.microsoft.com/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/transparency-note-pronunciation-assessment] — `ErrorType` field definitions, recommended-use guidance for children's education apps, "consider different thresholds per scenario... children's learning might not be as strict" guidance directly relevant to D-04.
- [CITED: learn.microsoft.com/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security] — "For real-time speech to text, audio input is processed only on the Azure's server memory, and no data is stored at rest" and "When doing real-time speech to text, fast transcription, pronunciation assessment, and speech translation, Microsoft does not retain or store the data provided by customers." Directly populates D-07's data-use doc.
- [CITED: learn.microsoft.com/azure/ai-services/speech-service/how-to-use-codec-compressed-audio-input-streams] — Explicit statement: "The Speech SDK for JavaScript does not support compressed audio... you must first convert it to a WAV file in the default input format." This is the single most load-bearing finding in this research.
- [CITED: npmjs.com registry via `npm view`] — `microsoft-cognitiveservices-speech-sdk` v1.50.0, `ffmpeg-static` v5.3.0, `@ffmpeg-installer/ffmpeg` v1.1.0, `fluent-ffmpeg` v2.1.3 (flagged deprecated) — all verified directly against the npm registry, 2026-07-02.

### Tertiary (LOW confidence) — [ASSUMED], flagged for validation
- Azure pricing figures (F0 free tier: 5 audio hours/month; Standard real-time: ~$1.32/hour for pronunciation assessment with the enhanced-feature add-on) — sourced from WebSearch summaries of third-party pricing-comparison articles, not fetched directly from `azure.microsoft.com/pricing/details/speech`. PRON-02 states "free tier expected to cover the current 6-student/1-class-week volume at ~$0/mo" as a locked decision, so this is a confirmation input, not a blocking gap — but the planner/operator should verify current exact pricing at `azure.microsoft.com/pricing/details/cognitive-services/speech-services` when provisioning the Azure resource, since Azure pricing pages change and this figure was not fetched from the primary source.
- Exact 30-second limit applicability to this app's real turn-recording durations (Assumption A1) — no actual duration data from this app's stored clips was inspected during this research session; the D-04 calibration pass is the correct place to confirm this empirically.

## Metadata

**Confidence breakdown:**
- Standard Stack (Azure SDK + ffmpeg choice): HIGH — package identities and audio-format constraints verified against official docs and the npm registry directly, not from training-data memory alone.
- Architecture (integration point, table design, UI insertion points): HIGH — derived directly from reading the actual existing source files (`audio-upload.ts`, `audio-evidence.ts`, `StepAiEvaluationFeedback.tsx`, the evidence page, and the foundation migration), not inference.
- Pitfalls: HIGH for the WAV-format constraint (directly cited from Microsoft docs) and MEDIUM for the serverless/ffmpeg-on-Vercel pitfall (reasoned from known Vercel constraints + confirmed `ffmpeg-static` is a common pattern, but not empirically tested against this specific project's Vercel config in this research session).
- Calibration/accuracy validation (PRON-03): explicitly LOW/not-applicable to pre-verify — this requirement is empirical by design (per the roadmap's own research flag) and must be executed as a phase task against this app's real 6 students' stored audio, not resolved by research.

**Research date:** 2026-07-02
**Valid until:** 30 days (Azure SDK ships frequent releases; re-verify `npm view microsoft-cognitiveservices-speech-sdk version` and re-check pricing at implementation time if the phase start is delayed beyond that window)
</content>
