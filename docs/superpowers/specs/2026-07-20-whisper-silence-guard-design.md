# Whisper Silence Guard Design

**Date:** 2026-07-20
**Status:** Approved by user 2026-07-20

## Problem

An inaudible recording can cause `gpt-4o-mini-transcribe` to return the transcription prompt itself as English text. The current adapter accepts any normalized transcript containing an English letter, so this prompt echo reaches turn evaluation as if the student spoke it.

The application already has the correct recovery behavior for a failed transcription: it returns `transcription_failed_retryable`, shows the child-friendly existing message "I didn't hear you. Try again.", and does not evaluate, score, or advance the turn. This change closes the detection gap without creating another client state.

## Goals

- Detect strong transcription-prompt echoes and a small set of high-confidence silence hallucinations.
- Reject extremely short accidental taps before storage upload or transcription.
- Route every detection through the existing retryable, no-progression behavior.
- Favor false negatives over rejecting plausible elementary ESL speech.
- Keep the detection policy pure and independently testable.

## Non-goals

- General transcript quality, relevance, or one-word-answer validation.
- Audio-energy analysis, voice activity detection, or model changes.
- Client, API-response-shape, database-schema, or RLS changes.
- Changes to preset or conversation evaluation policy.
- Changes to the existing student-facing retry copy.

## Decision summary

| Decision | Choice |
| --- | --- |
| Detection scope | Strong prompt echo, normalized exact blocklist match, and extreme-short-tap pre-check |
| False-positive posture | Conservative; no fuzzy semantic matching and no duration-only silence inference beyond accidental taps |
| Prompt overlap threshold | Bidirectional 70%: transcript-token coverage by the prompt set and prompt-set coverage by the transcript |
| Minimum overlap transcript | At least 5 word tokens |
| Short-tap cutoff | Strictly less than 500 ms |
| Recovery | Existing `transcription_failed_retryable` path; no new client error or copy |
| Architecture | Pure domain detector plus server adapter hooks |

## Pure no-speech detector

Add `src/domain/audio/no-speech-detection.ts` with this public contract:

```ts
export type NoSpeechReason = "prompt_echo" | "known_hallucination";

export function detectNoSpeech(
  transcript: string,
  promptText: string,
): NoSpeechReason | null;
```

The function has no server, provider, logging, or environment dependency. It normalizes both inputs by lowercasing, replacing punctuation with spaces, collapsing whitespace, and trimming. Matching uses the normalized value only; the adapter continues returning the existing English transcript normalization when no detector rule matches.

The detector evaluates these rules in order. Prompt-based rules are skipped if
the normalized prompt is empty:

1. **Prompt echo:** return `prompt_echo` when the normalized transcript contains the complete normalized prompt as a contiguous substring. This covers provider output that prefixes the prompt with text such as `Context:`.
2. **Strong prompt overlap:** when the normalized transcript contains at least 5 word tokens, return `prompt_echo` only when both directions meet 70%: at least 70% of transcript tokens are members of the normalized prompt's word set, and at least 70% of the prompt's unique words appear in the transcript. Transcript coverage counts repeated tokens; prompt coverage counts unique words. The reciprocal condition prevents a short plausible sentence made from common prompt vocabulary from matching a much longer prompt. Matching is lexical only, not semantic or edit-distance based.
3. **Known hallucination:** return `known_hallucination` only when the complete normalized transcript exactly equals one of these entries:
   - `thank you for watching`
   - `thanks for watching`
   - `subtitles by the amara org community`
   - `please subscribe`
   - `see you in the next video`

Plausible student utterances such as `Thank you.`, `Bye.`, short answers, partial blocklist phrases, and sentences merely containing a blocklist phrase remain valid. Empty text is not classified here because the adapter's existing `empty_transcript` rule already handles it.

## Transcription adapter integration

Export the existing prompt text from `src/server/audio/transcription.ts` as a shared constant and pass that same constant to both the provider request and `detectNoSpeech`. This prevents detection policy from drifting away from the actual prompt.

After `normalizeEnglishTranscript` and the existing empty/non-English validation, call the detector. On a match:

- log `audio.transcription_failed` with `error: "no_speech"` and the returned reason;
- return `{ ok: false, error: "no_speech" }` by adding `no_speech` to `TranscriptionError`.

`audio-upload.ts` already maps any failed transcription to the retryable response before evaluation, pronunciation scoring, or transcript/evaluation persistence. The existing failed-clip bookkeeping remains unchanged. Because storage upload and transcription currently run concurrently, prompt echoes and known hallucinations may still leave a private failed audio clip as diagnostic evidence; they never produce a student transcript or advance mission state.

## Short-tap pre-check

Add an exported `MIN_TRANSCRIBABLE_AUDIO_DURATION_MS = 500` policy constant in `src/server/student-access/audio-upload.ts`. After normal input-shape validation, when `durationMs < 500`:

- log the existing `audio.upload_timing` event as failed with `error: "transcription_failed_retryable"`, `step: "duration_precheck"`, and `reason: "short_clip"`;
- return `{ ok: false, error: "transcription_failed_retryable", retryable: true }` immediately.

The pre-check runs before reading the file, initializing the turn row, inserting an audio-clip row, uploading storage, or calling OpenAI. A duration of exactly 500 ms is allowed through. Clips at or above the cutoff are never rejected by duration alone.

## End-to-end data flow

1. Validate the upload's existing size, MIME type, duration range, and identifiers.
2. Return the existing retryable response immediately for a clip shorter than 500 ms.
3. For other clips, preserve the current ownership checks, mission/attempt checks, private storage upload, and transcription request.
4. Normalize and validate the provider transcript.
5. Run the pure detector against the exact exported provider prompt.
6. On detection, return `no_speech`; `audio-upload.ts` marks the private clip failed and returns the existing retryable response.
7. Only a non-empty English transcript that passes the detector may reach pronunciation scoring, turn evaluation, transcript persistence, or conversation generation.

This applies identically to original-answer and repeat-attempt clips because both already share the same transcription gate.

## Testing

Follow the repository's unit/source-string convention; do not add jsdom or React Testing Library.

### Domain tests

Add `tests/domain/no-speech-detection.test.ts` covering:

- the exact prompt and a `Context:`-prefixed prompt echo;
- the 70% boundary for transcripts of at least five words;
- a below-threshold overlap and overlaps shorter than five words;
- plausible speech using prompt vocabulary without covering most of the prompt;
- punctuation, case, and whitespace normalization;
- every exact blocklist entry;
- blocklist phrases embedded in longer plausible speech;
- plausible negatives including `Thank you.`, `Bye.`, and representative elementary ESL answers.

### Transcription adapter tests

Extend `tests/server/transcription.test.ts` with an injected fake client that returns a prompt echo and assert:

- the adapter returns `{ ok: false, error: "no_speech" }`;
- the request and detector share the exported prompt constant;
- the log contains the distinct `prompt_echo` reason.

Include one exact known-hallucination adapter case if needed to prove detector integration; exhaustive blocklist coverage belongs in the domain test.

### Upload orchestration tests

Extend `tests/server/audio-upload.test.ts` to prove:

- a transcriber returning `no_speech` maps to `transcription_failed_retryable`;
- neither evaluator, pronunciation scorer, transcript/evaluation write, nor mission progression runs;
- a 300 ms clip returns the retryable response without reading the file, creating turn/audio rows, uploading storage, or calling the transcriber;
- a 500 ms clip is not rejected by the duration pre-check.

Add only the narrow source assertion needed if the existing test seams cannot directly prove the pre-check position.

## Verification

Run the narrowest tests first, then the project gate:

```bash
npx vitest run tests/domain/no-speech-detection.test.ts tests/server/transcription.test.ts tests/server/audio-upload.test.ts
npx vitest run
npm run typecheck
npm run lint
```

No browser or phone UAT is required because the design intentionally reuses an already-covered client recovery state and introduces no UI change.

## Safety and operational constraints

- Preserve ownership checks, mission snapshots, RLS, private per-turn audio storage, and signed teacher-review playback.
- Preserve the protected port-3200 dynamic-dialogue worktree and its server.
- Preserve unrelated changes in the dirty main checkout.
- Do not push, merge, deploy, publish, or mutate production without explicit approval.
- Never call the paid transcription API from tests.
