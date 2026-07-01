# Phase 8: Coco Voice (TTS) - Research

**Researched:** 2026-07-01
**Domain:** OpenAI text-to-speech, cache-first audio delivery, Next.js App Router, Supabase Storage, browser audio playback
**Confidence:** MEDIUM

## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Playback Timing
- **D-01:** Coco should try to autoplay whenever a new mission-flow step appears, because students are doing homework on their own device and the experience should feel alive.
- **D-02:** Browser autoplay failure must be expected. If autoplay is blocked, show a clear play affordance and continue the mission normally.
- **D-03:** Prompt text appears immediately. Audio should feel synchronized when cached or fast, but audio generation/fetching must not block the student from seeing the prompt.
- **D-04:** Recording stays available even if Coco audio is loading or playing. TTS is presence/modeling, not a gate on homework completion.

### Lines Voiced
- **D-05:** Coco voices character-like lines, not every UI/status label.
- **D-06:** Voice the mission prompts.
- **D-07:** Voice improved/model target sentences so students hear the sentence they are expected to repeat.
- **D-08:** Voice short Coco-style encouragement and transition lines, such as "Good job! Ready for the next one."
- **D-09:** Voice AI evaluation feedback only when the line is phrased as Coco talking to the student, not as system/status text.
- **D-10:** Do not voice the student's transcript back to them. Coco should model and respond, not read speech-recognition output aloud.
- **D-11:** Voice a short completion celebration.

### Replay UX
- **D-12:** Replay controls live inline inside the Coco speech card, next to the line Coco said.
- **D-13:** Replay uses an icon-only speaker/play button. The icon must be visually obvious, consistently placed, and have an accessible label such as `aria-label="Play Coco"`.
- **D-14:** Every voiced line can be replayed while it is visible. Once the app moves to a new step and the line is no longer on screen, it does not need a replay control.
- **D-15:** If audio cannot load or TTS generation fails, keep the text visible and show a small disabled/error state on the speaker button. Voice failure must not block the homework flow.
- **D-16:** Do not surface replay counts or replay behavior to teachers in v2.1. Cache-hit/provider logging is enough for verification.

### the agent's Discretion

- Choose the exact server/API structure, cache table/storage layout, and preload timing as long as the implementation satisfies the product decisions above and the Phase 8 requirements.
- Use standard implementation judgment for technical logging, retries, and cache-hit verification. These should support debugging and acceptance tests without creating new teacher-facing product surface.

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope.

## Summary

Phase 8 should add Coco voice as an additive, server-owned playback capability over the existing one-step student flow: the client sends only a normalized voice-line request, the server computes the content hash, checks `tts_audio_cache`, generates on miss through the existing `openai` dependency, stores immutable audio, and returns playback metadata including `cacheStatus`. [VERIFIED: codebase grep] [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] [CITED: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create]

Use OpenAI `gpt-4o-mini-tts` through a new server-only adapter shaped like `src/server/audio/transcription.ts`: injected fake client for tests, `OPENAI_API_KEY` resolution, model override via env/deps, and `ok/error` results that hide provider detail from child-facing UI. [VERIFIED: codebase grep] [CITED: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create]

The client must treat autoplay as opportunistic: render text immediately, attach a standard `<audio>` element, call `play()`, handle the returned promise, and show the inline speaker button in loading/ready/error states. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play] [VERIFIED: codebase grep]

**Primary recommendation:** Build a dedicated `tts_audio_cache` table plus `tts-audio` Storage bucket, a server route such as `/student/missions/[assignmentStudentId]/tts`, and a reusable `CocoSpeechAudio` client component used by the specific mission step cards. [VERIFIED: codebase grep] [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Decide which lines are voice-eligible | Browser / Client | Domain constants | The visible step components know whether a line is prompt/model/transition/completion/feedback and CONTEXT.md locks that not every UI label is spoken. [VERIFIED: codebase grep] |
| TTS provider call | API / Backend | External OpenAI API | OpenAI keys and paid calls already stay server-only in `mission-generator.ts`, `turn-evaluator.ts`, and `transcription.ts`. [VERIFIED: codebase grep] |
| Cache key and provider de-duplication | API / Backend | Database / Storage | VOICE-03 requires verified cache hits by content hash before provider calls, which is server-owned state. [VERIFIED: .planning/REQUIREMENTS.md] |
| Audio bytes persistence | Database / Storage | API / Backend | Existing student audio uses Supabase Storage plus DB metadata; TTS needs the same separation but with a different table/lifecycle. [VERIFIED: codebase grep] |
| Playback and replay UI | Browser / Client | API / Backend | Requirement VOICE-04 locks standard HTML audio playback; browser autoplay failure must be handled from `HTMLMediaElement.play()`. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play] |
| Cache-hit verification/logging | API / Backend | Test suite | Cache hits are not visually observable; server response metadata and unit tests should prove provider call count. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: codebase grep] |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Student hears Coco's mission/prompt lines spoken aloud via text-to-speech, using the existing OpenAI TTS (`gpt-4o-mini-tts`) through the current OpenAI SDK. | OpenAI docs list `gpt-4o-mini-tts` and `POST /audio/speech`; current code has server-only OpenAI adapter patterns. [CITED: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create] [VERIFIED: codebase grep] |
| VOICE-02 | Student can tap to replay any spoken Coco line. | Browser playback should use `<audio>` plus explicit play controls; MDN documents promise-based `play()` handling. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play] |
| VOICE-03 | Generated TTS audio is cached by content hash (text + character + voice + provider + format) so identical lines are not regenerated. | Dedicated DB table with `unique(content_hash)` and provider-call-count tests gives observable cache-hit behavior. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED] |
| VOICE-04 | Voice playback works on low-end school devices using a standard HTML audio element without a streaming pipeline. | Existing teacher playback already uses a standard `<audio controls src={signedUrl}>`; OpenAI supports non-streaming MP3 output by default. [VERIFIED: codebase grep] [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] |

## Project Constraints (from AGENTS.md)

- Use Next.js App Router, React, TypeScript, Supabase, OpenAI APIs behind server-side adapters, Zod, Vitest, and Playwright. [VERIFIED: AGENTS.md]
- Treat current AI model names, costs, and browser audio support as version-sensitive and recheck before paid classroom pilots. [VERIFIED: AGENTS.md]
- Keep changes tied to the active GSD phase and prefer vertical MVP slices. [VERIFIED: AGENTS.md]
- Keep AI outputs structured, validated, and routed through server-owned workflow state. [VERIFIED: AGENTS.md]
- Do not add v1 scope for SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat. [VERIFIED: AGENTS.md]
- Assignment/attempt status machinery remains server-owned and auditable; TTS must not alter it. [VERIFIED: AGENTS.md]
- Audio evidence remains short per-turn student clips; TTS audio is app-generated and should not be stored in `audio_clips`. [VERIFIED: AGENTS.md] [VERIFIED: codebase grep]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | Existing `package.json`: `^6.45.0`; npm latest checked as `6.45.0`, published 2026-06-24. | OpenAI `audio.speech.create` server adapter for `gpt-4o-mini-tts`. | Existing dependency and existing server-only OpenAI pattern; no new SDK install. [VERIFIED: package.json] [VERIFIED: npm registry] [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] |
| `next` | Existing `package.json`: `^15.0.0`; installed CLI reports `15.5.19`; npm latest checked as `16.2.9`. | App Router route handler for TTS requests. | Existing framework; route handlers return Web `Response` objects with headers. [VERIFIED: package.json] [VERIFIED: npm registry] [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/route] |
| `@supabase/supabase-js` | Existing `package.json`: `^2.45.0`; npm latest checked as `2.110.0`. | Service-role DB lookup/insert and Storage upload/read URL handling. | Existing Supabase stack and Storage pattern. [VERIFIED: package.json] [VERIFIED: npm registry] [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals] |
| Browser `<audio>` / `HTMLMediaElement.play()` | Web platform API. | Low-end-device playback and replay. | VOICE-04 explicitly rejects a streaming pipeline; MDN documents promise-based playback failure handling. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | Existing `package.json`: `^3.23.8`. | Validate TTS request body and response metadata. | Use on the route boundary, matching existing server actions/routes. [VERIFIED: package.json] [VERIFIED: codebase grep] |
| `vitest` | Existing `package.json`: `^3.2.6`; installed CLI reports `3.2.6`; npm latest checked as `4.1.9`. | Unit tests for adapter, cache service, and client boundary checks. | Existing test runner; current project tests inject fake clients for paid API adapters. [VERIFIED: package.json] [VERIFIED: npm registry] [VERIFIED: codebase grep] [CITED: https://vitest.dev/guide/mocking.html] |
| `@playwright/test` | Existing `package.json`: `^1.49.0`; installed CLI reports `1.61.1`. | E2E/static source checks for no client OpenAI imports and visible replay controls. | Existing E2E tool; real low-end-device playback remains manual UAT. [VERIFIED: package.json] [VERIFIED: environment probe] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Non-streaming OpenAI speech response | OpenAI streaming speech response | Streaming is supported, but VOICE-04 explicitly requires no streaming pipeline for this phase. [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] [VERIFIED: .planning/REQUIREMENTS.md] |
| Dedicated TTS cache table | Reuse `audio_clips` | `audio_clips` models student-produced attempt evidence with 30-day deletion semantics; TTS output is generated app content keyed by deterministic hash. [VERIFIED: codebase grep] [ASSUMED] |
| Public immutable TTS bucket | Private bucket plus signed URLs | Public content-hash objects reduce signed-URL round trips but expose synthesized Coco audio to anyone with the URL; private signed URLs are more conservative for a child-facing app. [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals] [ASSUMED] |

**Installation:**

No new npm package should be installed for Phase 8. [VERIFIED: package.json]

## Package Legitimacy Audit

> Phase 8 should not install new external packages. [VERIFIED: package.json]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `openai` | npm | Created 2020-07-09; latest `6.45.0` published 2026-06-24 | Not captured by `npm view` command used | `github.com/openai/openai-node` | Existing dependency; seam returned `SUS` because its metadata fetch reported unknown signals | Approved as existing dependency; no install task. [VERIFIED: npm registry] |
| `next` | npm | Created 2011-07-11; latest `16.2.9` published 2026-06-09 | Not captured by `npm view` command used | `github.com/vercel/next.js` | Existing dependency; seam returned `SUS` because its metadata fetch reported unknown signals | Approved as existing dependency; no install task. [VERIFIED: npm registry] |
| `@supabase/supabase-js` | npm | Created 2020-01-17; latest `2.110.0` published 2026-06-30 | Not captured by `npm view` command used | `github.com/supabase/supabase-js` | Existing dependency; seam returned `SUS` because its metadata fetch reported unknown signals | Approved as existing dependency; no install task. [VERIFIED: npm registry] |
| `vitest` | npm | Created 2021-12-03; latest `4.1.9` published 2026-06-15 | Not captured by `npm view` command used | `github.com/vitest-dev/vitest` | Existing dev dependency; seam returned `SUS` because its metadata fetch reported unknown signals | Approved as existing dependency; no install task. [VERIFIED: npm registry] |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none for new install; planner should not add new packages. The seam warning is recorded above because its local legitimacy check returned unknown registry signals. [VERIFIED: package-legitimacy seam]

## Architecture Patterns

### System Architecture Diagram

```text
Student step appears
  |
  v
Client renders Coco text immediately
  |
  v
Build voice request: text + characterId + voice + provider + format
  |
  v
POST /student/missions/[assignmentStudentId]/tts
  |
  v
Read student unlock cookie + validate route/body with Zod
  |
  v
Compute canonical SHA-256 content hash
  |
  +--> Cache row found and storage object available?
  |       |
  |       +--> yes: return { audioUrl or audioPath, cacheStatus: "hit" }
  |       |
  |       +--> no: call OpenAI audio.speech.create on server
  |                    |
  |                    v
  |              upload immutable object to tts-audio
  |                    |
  |                    v
  |              insert/upsert tts_audio_cache row
  |                    |
  |                    v
  |              return { cacheStatus: "miss" }
  |
  v
Client assigns <audio src>, attempts audio.play()
  |
  +--> play resolves: show ready/replay state
  |
  +--> play rejects: show inline play affordance; homework continues
```

### Recommended Project Structure

```text
src/
├── app/student/missions/[assignmentStudentId]/tts/route.ts   # student-gated TTS lookup/generate endpoint
├── server/audio/tts-generator.ts                             # server-only OpenAI speech adapter
├── server/audio/tts-cache.ts                                 # hash, DB metadata, Storage upload/read URL
├── domain/audio/tts.ts                                       # request schema, voice constants, hash input canonicalization
└── components/student/CocoSpeechAudio.tsx                    # hidden audio element + inline speaker button behavior
```

### Pattern 1: Server-Only Adapter With Fake Client Injection

**What:** Mirror `transcribeAudioFile`: resolve API key, accept an injected client, call OpenAI only on cache miss, return a small union result. [VERIFIED: codebase grep]

**When to use:** Use for all OpenAI speech generation calls so automated tests never call paid APIs. [VERIFIED: codebase grep]

**Example:**

```typescript
// Source: existing src/server/audio/transcription.ts pattern + OpenAI speech docs
export type SpeechClient = {
  audio: {
    speech: {
      create(input: {
        model: string;
        voice: string;
        input: string;
        instructions?: string;
        response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
      }): Promise<Response>;
    };
  };
};
```

### Pattern 2: Cache Service Owns Hash and Provider Calls

**What:** The browser never submits a trusted `contentHash`; it submits text/character/voice/provider/format, and the server canonicalizes that tuple into the hash. [ASSUMED]

**When to use:** Use whenever a client request could otherwise forge a cache key and retrieve a mismatched object. [ASSUMED]

**Example:**

```typescript
// Source: VOICE-03 hash tuple + Node Web Crypto/crypto standard library pattern
const hashInput = JSON.stringify({
  schemaVersion: 1,
  provider: "openai",
  model: "gpt-4o-mini-tts",
  voice,
  format: "mp3",
  characterId,
  text: text.trim().replace(/\s+/g, " "),
});
const contentHash = createHash("sha256").update(hashInput).digest("hex");
```

### Pattern 3: Playback Controller Handles Autoplay Rejection

**What:** `audio.play()` returns a promise; if it rejects, the inline button remains available and text stays visible. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play]

**When to use:** On every newly visible voiced line, not only first page load. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]

**Example:**

```typescript
// Source: MDN HTMLMediaElement.play docs
try {
  await audioRef.current?.play();
  setPlaybackState("playing");
} catch {
  setPlaybackState("ready");
}
```

### Anti-Patterns to Avoid

- **Client-side OpenAI call:** This would expose paid provider access and violate existing server-only OpenAI boundaries. [VERIFIED: codebase grep]
- **Blocking prompt rendering on TTS:** CONTEXT.md locks that prompt text appears immediately and audio cannot gate homework completion. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
- **Reading the student transcript aloud:** CONTEXT.md explicitly says not to voice the student's transcript. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
- **Using native audio controls as the visible replay UI:** CONTEXT.md requires an inline icon-only replay button in the Coco speech card. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
- **Using `audio_clips` for TTS cache:** Existing `audio_clips` table is attempt-turn evidence with `clip_kind`, processing status, and expiry fields for student recordings. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text-to-speech synthesis | Custom speech model or browser SpeechSynthesis voice | OpenAI `audio.speech.create` with `gpt-4o-mini-tts` | Requirement locks OpenAI TTS and current SDK. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create] |
| Audio playback engine | Web Audio playback pipeline | Standard `<audio>` element | VOICE-04 explicitly requires standard HTML audio and no streaming pipeline. [VERIFIED: .planning/REQUIREMENTS.md] |
| Cache de-duplication | Client-only memoization | Server DB unique hash plus Storage object | VOICE-03 requires second request to serve cached result instead of provider regeneration. [VERIFIED: .planning/REQUIREMENTS.md] |
| Provider mocking | Real OpenAI calls in tests | Injected fake speech client | Existing OpenAI adapter tests already use fake clients to avoid paid calls. [VERIFIED: codebase grep] |
| Autoplay policy detection | Browser-specific UA heuristics | Handle `play()` promise rejection | MDN documents rejection when script-initiated playback is blocked. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play] |

**Key insight:** The hard part is not generating audio; it is making provider calls idempotent, observable, child-safe, and non-blocking inside the existing mission flow. [VERIFIED: .planning/ROADMAP.md] [ASSUMED]

## Common Pitfalls

### Pitfall 1: Cache Hit Is Not Actually Verified

**What goes wrong:** A replay or second visual playback works, but the server still calls OpenAI again. [ASSUMED]
**Why it happens:** Tests assert that audio plays or a URL is returned instead of asserting provider call count and `cacheStatus`. [ASSUMED]
**How to avoid:** Add server tests where two identical requests produce one fake provider call and response metadata shows `miss` then `hit`. [ASSUMED]
**Warning signs:** No unit test spies on the injected speech client; no returned cache-hit flag exists. [ASSUMED]

### Pitfall 2: Autoplay Failure Looks Like Broken Audio

**What goes wrong:** Browser blocks script-initiated playback, and the UI still indicates that Coco is speaking. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play]
**Why it happens:** Code calls `audio.play()` without awaiting/catching the returned promise. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play]
**How to avoid:** Treat autoplay as a best-effort attempt and keep the icon play button available. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
**Warning signs:** No `NotAllowedError` handling path; no ready state after play rejection. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play]

### Pitfall 3: Wrong Cache Key Granularity

**What goes wrong:** Changing voice, model, provider, or format reuses stale audio for the wrong voice. [ASSUMED]
**Why it happens:** Cache key hashes only text. [ASSUMED]
**How to avoid:** Hash `text + character + voice + provider + model + format + schemaVersion`; requirement explicitly includes text, character, voice, provider, and format. [VERIFIED: .planning/REQUIREMENTS.md]
**Warning signs:** Hash helper accepts only `text`. [ASSUMED]

### Pitfall 4: Storage Privacy Model Is Chosen Casually

**What goes wrong:** TTS audio is either over-protected with slow signed URLs for every replay or under-reviewed as public content without a deliberate classification. [ASSUMED]
**Why it happens:** The project already has a private `student-audio` bucket, but synthesized Coco audio has a different sensitivity class than child recordings. [VERIFIED: codebase grep] [ASSUMED]
**How to avoid:** Planner must choose public immutable bucket or private signed URLs explicitly and document the reason. [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals]
**Warning signs:** TTS objects are inserted into `student-audio` or `audio_clips`. [VERIFIED: codebase grep]

### Pitfall 5: Voicing UI Labels Instead of Coco Lines

**What goes wrong:** Coco reads status text like "Teacher review sent" or student transcripts, making the experience confusing and potentially amplifying ASR errors. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
**Why it happens:** Implementer wraps every visible text node with TTS rather than curating voice-eligible lines. [ASSUMED]
**How to avoid:** Add a line inventory in implementation tasks and wire only prompt, model sentence, selected Coco-style feedback, transition, and completion. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
**Warning signs:** TTS request uses `originalTranscript` or `repeatTranscript`. [VERIFIED: codebase grep]

## Code Examples

Verified patterns from official sources and current code:

### OpenAI Speech Adapter Call Shape

```typescript
// Source: OpenAI Create speech API docs
const response = await client.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "coral",
  input: text,
  instructions: "Speak as a warm, supportive elementary ESL classmate.",
  response_format: "mp3",
});
```

### Route Handler Response Metadata

```typescript
// Source: Next.js route handler docs + current audio route pattern
return Response.json({
  ok: true,
  audioUrl,
  contentHash,
  cacheStatus: wasCacheHit ? "hit" : "miss",
});
```

### Supabase Storage Upload Options

```typescript
// Source: Supabase Storage upload docs
await supabase.storage.from(bucket).upload(objectKey, audioBlob, {
  contentType: "audio/mpeg",
  cacheControl: "31536000",
  upsert: false,
});
```

### HTML Audio Autoplay Handling

```typescript
// Source: MDN HTMLMediaElement.play docs
const playResult = audio.play();
if (playResult) {
  playResult.catch(() => {
    setPlaybackState("ready");
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tts-1` / `tts-1-hd` for OpenAI TTS | `gpt-4o-mini-tts` is listed by OpenAI docs as the newest and most reliable TTS model | Official docs checked 2026-07-01 | Use the locked roadmap model unless official docs change before execution. [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] |
| Streaming speech playback | Non-streaming MP3 response cached in Storage | Phase requirement locks no streaming pipeline | Simpler low-end-device playback and easier cache verification. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] |
| Voice all visible text | Voice only character-like Coco lines | Phase context locks line selection | Keeps Coco as a character layer, not a screen reader. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md] |

**Deprecated/outdated:**
- Browser-specific autoplay assumptions are outdated for planning; use `play()` promise handling. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play]
- Public or private TTS bucket cannot be chosen by habit; it must follow the content classification decision. [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals] [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dedicated `tts_audio_cache` table is better than overloading `audio_clips`. | Standard Stack / Patterns / Pitfalls | If wrong, planner may add an unnecessary table; still low blast radius because schema is additive. |
| A2 | Public immutable TTS bucket is acceptable if synthesized Coco audio contains no student PII. | Alternatives / Pitfalls | If school policy treats all child-facing generated audio as private, planner must choose signed private URLs instead. |
| A3 | Client should not be trusted to provide the content hash. | Architecture Patterns | If wrong, implementation might still work, but server-owned hashing is safer against mismatched cache retrieval. |
| A4 | Cache-hit verification should use provider call count plus response metadata. | Pitfalls / Validation | If wrong, acceptance tests may miss accidental provider regeneration. |
| A5 | The main implementation complexity is idempotent, observable, non-blocking delivery rather than TTS synthesis. | Don't Hand-Roll | If wrong, planner may under-allocate tasks for voice quality/manual listening. |

## Open Questions

1. **Should `tts-audio` be public immutable or private with signed URLs?**
   - What we know: Supabase private buckets require authorization/download or signed URLs; public buckets expose objects to anyone with the URL. [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals]
   - What's unclear: The project's policy for generated child-facing audio has not been explicitly decided. [ASSUMED]
   - Recommendation: Default to public immutable only if the planner records "generated Coco lines contain no student PII"; otherwise use private signed URLs. [ASSUMED]

2. **Which built-in OpenAI voice should represent Coco?**
   - What we know: OpenAI docs list built-in voices including `coral`, `nova`, `shimmer`, `marin`, and `cedar`, and recommend `marin` or `cedar` for best quality. [CITED: https://developers.openai.com/api/docs/guides/text-to-speech]
   - What's unclear: No child/teacher preference has been recorded for Coco's exact voice. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md]
   - Recommendation: Planner should include a short manual listening checkpoint over 2-3 voices before locking the env default. [ASSUMED]

3. **Can executor verify on a real low-end school device during this phase?**
   - What we know: VOICE-04 requires Chromebook or older tablet verification, not only a dev machine. [VERIFIED: .planning/ROADMAP.md]
   - What's unclear: Device availability is not known from local probes. [VERIFIED: environment probe]
   - Recommendation: Planner must add a manual UAT gate with a human-needed fallback if the device is unavailable. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next.js/Vitest/OpenAI SDK execution | Available, wrong version | `v20.12.0`; `package.json` requires `>=20.19.0` | Use an upgraded Node runtime before final local verification. [VERIFIED: environment probe] [VERIFIED: package.json] |
| npm | Dependency metadata and scripts | Yes | `10.5.0` | none. [VERIFIED: environment probe] |
| Next CLI | Route/build checks | Yes | `15.5.19` installed via project deps | `npm run typecheck`/`npm run build` still need Node engine parity. [VERIFIED: environment probe] |
| Vitest | Unit tests | Yes | `3.2.6` | none. [VERIFIED: environment probe] |
| Playwright | E2E/static UI checks | Yes | `1.61.1` | Manual browser/device UAT for VOICE-04. [VERIFIED: environment probe] |
| Supabase CLI | DB/storage migration push | Yes, but sandboxed command needed escalated home write | `2.107.0` | Use escalated CLI run or Supabase dashboard for migration verification. [VERIFIED: environment probe] |
| `psql` | Optional direct DB inspection | No output from `command -v psql` | — | Supabase CLI or Supabase dashboard. [VERIFIED: environment probe] |
| Real low-end device | VOICE-04 UAT | Not detectable from repo shell | — | Human UAT required. [VERIFIED: .planning/ROADMAP.md] |

**Missing dependencies with no fallback:**
- Real Chromebook/older tablet verification is a phase success criterion and cannot be fully automated from this environment. [VERIFIED: .planning/ROADMAP.md]

**Missing dependencies with fallback:**
- `psql` is not available from this shell; Supabase CLI is available. [VERIFIED: environment probe]
- Node version is below `package.json` engines; upgrade local Node or run final verification in a compliant environment. [VERIFIED: environment probe] [VERIFIED: package.json]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.6`, Playwright `1.61.1` installed locally. [VERIFIED: environment probe] |
| Config file | `vitest.config.ts`, `playwright.config.ts`. [VERIFIED: codebase grep] |
| Quick run command | `npx vitest run tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts tests/domain/tts.test.ts` [ASSUMED] |
| Full suite command | `npm run typecheck && npm run lint && npm test && npm run test:e2e` [VERIFIED: package.json] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| VOICE-01 | Server uses OpenAI `gpt-4o-mini-tts` through current SDK adapter and returns usable audio metadata. | unit | `npx vitest run tests/server/tts-generator.test.ts` | ❌ Wave 0 |
| VOICE-02 | Visible voiced line has inline replay button with accessible label and calls audio playback on demand. | component/static/e2e | `npx vitest run tests/domain/tts.test.ts && npx playwright test tests/e2e/student-coco-voice.spec.ts` | ❌ Wave 0 |
| VOICE-03 | Two identical requests produce one provider call and second response `cacheStatus: "hit"`. | unit/integration | `npx vitest run tests/server/tts-cache.test.ts` | ❌ Wave 0 |
| VOICE-04 | Playback uses standard `<audio>` and no streaming pipeline; real low-end-device UAT passes. | static + manual UAT | `npx playwright test tests/e2e/student-coco-voice.spec.ts` plus manual device script | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts tests/domain/tts.test.ts` [ASSUMED]
- **Per wave merge:** `npm run typecheck && npm run lint && npm test` [VERIFIED: package.json]
- **Phase gate:** Full suite plus Playwright plus manual low-end-device UAT. [VERIFIED: .planning/ROADMAP.md]

### Wave 0 Gaps

- [ ] `tests/domain/tts.test.ts` — canonical hash inputs, line eligibility rules, no transcript voicing. [ASSUMED]
- [ ] `tests/server/tts-generator.test.ts` — fake OpenAI speech client, missing key branch, provider failure branch, response format/model assertions. [VERIFIED: codebase grep] [ASSUMED]
- [ ] `tests/server/tts-cache.test.ts` — miss/upload/insert path, hit/no provider call path, duplicate/concurrency-safe upsert behavior. [ASSUMED]
- [ ] `tests/e2e/student-coco-voice.spec.ts` — source/static checks for inline replay UI, no OpenAI import in client modules, standard `<audio>` usage. [ASSUMED]
- [ ] Manual UAT script in `08-VERIFICATION.md` or plan task for Chromebook/older tablet playback. [VERIFIED: .planning/ROADMAP.md]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Yes | Student route must read existing short-lived unlock cookie before serving/generating TTS for an assignment. [VERIFIED: codebase grep] |
| V3 Session Management | Yes | Reuse `readStudentUnlock`; do not create student auth/session model. [VERIFIED: codebase grep] |
| V4 Access Control | Yes | Server checks `assignment_students.id` and `student_id` before returning mission-specific TTS metadata. [VERIFIED: codebase grep] [ASSUMED] |
| V5 Input Validation | Yes | Zod-validate UUID route params, text length, voice enum, provider, and format. [VERIFIED: package.json] [CITED: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create] |
| V6 Cryptography | Yes | Use Node crypto SHA-256 for content hash; do not hand-roll hashing. [ASSUMED] |
| V8 Data Protection | Yes | Do not send student transcripts to TTS; classify TTS bucket public/private deliberately. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md] [CITED: https://supabase.com/docs/guides/storage/buckets/fundamentals] |
| V9 Communications | Yes | OpenAI and Supabase calls use server-side SDK/HTTPS; browser should receive only app-controlled URLs/metadata. [VERIFIED: codebase grep] [CITED: https://developers.openai.com/api/docs/guides/text-to-speech] |

### Known Threat Patterns for Next.js + Supabase + TTS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client imports OpenAI SDK or server adapter | Information Disclosure / Elevation of Privilege | Source-contract test like existing AI boundary tests; no OpenAI imports from `"use client"` modules. [VERIFIED: codebase grep] |
| Student requests arbitrary text to synthesize paid audio | Denial of Service / Abuse | Server only accepts visible mission-flow lines or validates text against assignment snapshot/character profile. [ASSUMED] |
| Forged cache key returns wrong audio | Tampering | Server computes hash from canonical tuple and does not trust client hash. [ASSUMED] |
| Public TTS object leaks sensitive content | Information Disclosure | Do not voice transcripts; decide public/private bucket based on generated-content classification. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md] [ASSUMED] |
| Cache stampede on same missing line | Denial of Service / Cost | Unique `content_hash`, upsert conflict handling, and provider call tests. [ASSUMED] |
| Provider error blocks homework | Availability | Return error state to speaker button while text and recorder remain usable. [VERIFIED: .planning/phases/08-coco-voice-tts/08-CONTEXT.md] |

## Sources

### Primary (HIGH confidence)

- Local codebase grep and file reads: `mission-generator.ts`, `transcription.ts`, `MissionFlowShell.tsx`, student step components, `AudioClipPlayer.tsx`, Supabase migrations, tests. [VERIFIED: codebase grep]
- `package.json` and local CLI probes for installed dependencies and scripts. [VERIFIED: package.json] [VERIFIED: environment probe]

### Secondary (MEDIUM confidence)

- OpenAI text-to-speech guide: https://developers.openai.com/api/docs/guides/text-to-speech
- OpenAI Create speech API reference: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
- Next.js route handler docs: https://nextjs.org/docs/app/api-reference/file-conventions/route
- Supabase Storage bucket fundamentals: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase JS Storage upload reference: https://supabase.com/docs/reference/javascript/storage-from-upload
- MDN `HTMLMediaElement.play()`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
- Vitest mocking docs: https://vitest.dev/guide/mocking.html
- Vitest request mocking docs: https://vitest.dev/guide/mocking/requests

### Tertiary (LOW confidence)

- Prior planning research files under `.planning/research/*` were scanned for context but not treated as authoritative for current docs. [VERIFIED: codebase grep]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for existing dependencies and local versions; MEDIUM for current external API docs because official docs were fetched via websearch fallback, not Context7. [VERIFIED: package.json] [CITED: https://developers.openai.com/api/docs/guides/text-to-speech]
- Architecture: MEDIUM because codebase patterns are clear but public/private TTS bucket policy remains an open product/security decision. [VERIFIED: codebase grep] [ASSUMED]
- Pitfalls: MEDIUM because cache/autoplay/security pitfalls are grounded in requirements and docs, while storage-classification and concurrency details need planning decisions. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play] [ASSUMED]

**Research date:** 2026-07-01
**Valid until:** 2026-07-08 for OpenAI model/API details and browser/audio behavior; 2026-07-31 for codebase architecture patterns.
