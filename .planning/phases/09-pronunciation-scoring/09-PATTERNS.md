# Phase 9: Pronunciation Scoring - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 10 (5 new, 3 modified, 2 test-only additions covered inline)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `src/server/audio/pronunciation-scorer.ts` (new) | service (vendor adapter) | request-response | `src/server/audio/transcription.ts` | exact |
| `src/server/audio/audio-transcode.ts` (new) | utility | transform | `src/server/audio/transcription.ts` (shape only; no direct transcode analog exists) | role-match |
| `src/domain/pronunciation/scoring.ts` (new) | utility (pure mapping) | transform | `mapMeaningResult()`/`mapTargetPatternResult()`/`mapRepeatResult()` in `src/server/teacher/audio-evidence.ts` | exact |
| `src/server/student-access/audio-upload.ts` (modified) | service | request-response / event-driven | itself (existing `uploadAttemptAudioClip` inline-evaluation call site) | exact |
| `src/server/teacher/audio-evidence.ts` (modified) | service | CRUD (read/join) | itself (existing `mapClip`/`mapTurn` join pattern) | exact |
| `src/components/student/StepAiEvaluationFeedback.tsx` (modified) | component | request-response (props-driven render) | itself (existing outcome-branch render pattern) | exact |
| `src/components/teacher/PronunciationDiagnosticPanel.tsx` (new) | component | request-response (on-demand/collapsed) | `src/components/teacher/AudioClipPlayer.tsx` | exact |
| `src/app/teacher/evidence/[attemptId]/page.tsx` (modified) | route (Server Component) | request-response | itself (existing `TurnEvidenceSection` insertion point) | exact |
| `supabase/migrations/2026XXXX_pronunciation_scores.sql` (new) | migration | CRUD | `supabase/migrations/202606250001_foundation_schema.sql` (`audio_clips` table) + `202606250002_teacher_auth_rls.sql` (`audio_clips` RLS policy) | exact |
| `tests/server/pronunciation-scorer.test.ts` (new) | test | request-response | `tests/server/transcription.test.ts` | exact |

## Pattern Assignments

### `src/server/audio/pronunciation-scorer.ts` (service, request-response)

**Analog:** `src/server/audio/transcription.ts` (full file, 99 lines — read in one pass)

This is the canonical "injectable-client vendor adapter" shape used by every external AI call in this codebase (also mirrored in `src/server/ai/turn-evaluator.ts`). Copy the shape exactly; swap OpenAI specifics for Azure Speech SDK specifics.

**Imports pattern** (lines 1-10):
```typescript
/**
 * Server-only audio transcription adapter.
 *
 * Keep this module out of client components. Tests inject a fake client so no
 * automated verification calls the paid OpenAI API.
 */

import OpenAI from "openai";
import { log } from "@/server/logging/logger";
```
For the new file: swap `import OpenAI from "openai"` for `import * as sdk from "microsoft-cognitiveservices-speech-sdk"`, keep the same doc-comment convention ("Server-only ... adapter. Keep this module out of client components. Tests inject a fake client...").

**Discriminated-union result + error-type pattern** (lines 13-28):
```typescript
export type TranscriptionError =
  | "missing_api_key"
  | "empty_transcript"
  | "transcription_failed";

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; error: TranscriptionError };

export type TranscriptionClient = {
  audio: {
    transcriptions: {
      create(input: { file: File; model: string; prompt?: string }): Promise<{ text?: string | null }>;
    };
  };
};
```
Apply the same shape for pronunciation scoring: `PronunciationScoreError = "missing_api_key" | "transcode_failed" | "provider_failed" | "audio_too_long"`, `PronunciationScoreResult = { ok: true; score: PronunciationScoreDetail } | { ok: false; error: PronunciationScoreError }`, and an injectable `PronunciationRecognizerFactory` client type (see RESEARCH.md Pattern 1 for the exact shape — it was already drafted there against this same analog).

**`resolveApiKey`/deps-override pattern** (lines 36-54):
```typescript
export type TranscribeAudioFileDeps = {
  apiKey?: string;
  model?: string;
  client?: TranscriptionClient;
};

function resolveApiKey(deps?: TranscribeAudioFileDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(input: TranscribeAudioFileInput, deps?: TranscribeAudioFileDeps) {
  return (
    input.model?.trim() ||
    deps?.model?.trim() ||
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
    DEFAULT_TRANSCRIPTION_MODEL
  );
}
```
Note the `"apiKey" in deps` check (not just `deps?.apiKey`) — this lets tests pass an explicit empty string to force the `missing_api_key` path, distinguishing "not provided" from "provided as empty." Reuse this exact idiom for `resolveApiKey`/`resolveRegion` reading `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`.

**Core call + error handling pattern** (lines 68-99):
```typescript
export async function transcribeAudioFile(
  input: TranscribeAudioFileInput,
  deps?: TranscribeAudioFileDeps,
): Promise<TranscriptionResult> {
  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  try {
    const client = deps?.client ?? createClient(apiKey);
    const transcriptFile = new File([input.file], fileNameForMimeType(input.mimeType), {
      type: input.mimeType,
    });
    const response = await client.audio.transcriptions.create({...});
    const text = response.text?.trim() ?? "";

    if (!text) {
      log("error", "audio.transcription_failed", { error: "empty_transcript" });
      return { ok: false, error: "empty_transcript" };
    }

    return { ok: true, text };
  } catch {
    log("error", "audio.transcription_failed", { error: "transcription_failed" });
    return { ok: false, error: "transcription_failed" };
  }
}
```
Key conventions to replicate: (1) guard on missing key *before* the try block, (2) generic catch with no leaked exception text, only a fixed `log("error", "<domain>.<verb>_failed", { error: <code> })` call, (3) never log student audio/text content — only structured error codes.

---

### `src/server/audio/audio-transcode.ts` (utility, transform)

**Analog:** RESEARCH.md's own drafted example (no direct ffmpeg precedent exists in this codebase) + `src/server/audio/transcription.ts`'s server-only module header convention.

**Pattern to follow:** Server-only module doc comment (same style as transcription.ts line 1-6), a single exported async function with a typed error surface consistent with the adapter's `TranscodeError` union, using `node:child_process.spawn` + `ffmpeg-static`. See RESEARCH.md "Server-side WAV transcode via ffmpeg-static" code block for the exact implementation to adapt — treat it as [CITED: RESEARCH.md] rather than a codebase analog since no ffmpeg usage exists yet in this repo.

**Error handling convention to add** (matching this codebase's style, not present in the research snippet):
```typescript
export type TranscodeError = "transcode_failed";
export type TranscodeResult =
  | { ok: true; wav: Buffer }
  | { ok: false; error: TranscodeError };
```
Wrap the raw `Promise<Buffer>` from the research snippet in this discriminated-union result shape so `pronunciation-scorer.ts` can compose it the same way `audio-upload.ts` composes `transcribeAudioFile`.

---

### `src/domain/pronunciation/scoring.ts` (pure mapping utility, transform)

**Analog:** `mapMeaningResult()`, `mapTargetPatternResult()`, `mapRepeatResult()` in `src/server/teacher/audio-evidence.ts` (lines 166-199)

**Core qualitative-mapping pattern** (lines 166-172):
```typescript
function mapMeaningResult(row: AttemptTurnRow): AttemptTurnEvidence["meaningResult"] {
  const evaluation = readEvaluation(row);
  if (isTeacherReview(row)) return "Needs teacher check";
  if (evaluation?.outcome === "retry_original") return "Try again";
  if (evaluation?.meaningUnderstood === false) return "Try again";
  return "Understood";
}
```
This is the direct precedent D-03 cites for mapping a raw signal into a small fixed vocabulary of positive-toned outcomes. For `scoreToStarBand`, follow the same shape: a small pure function, early-return branches ordered from most-concerning to most-positive is NOT the pattern here — audio-evidence.ts orders from special-case (teacher review) down to default-positive. Mirror that: check calibrated thresholds top-down, always resolve to 1/2/3, never a null/0 state.

**Copy/vocabulary table pattern:** `audio-evidence.ts`'s `AttemptTurnEvidence["meaningResult"]` type (`"Understood" | "Try again" | "Needs teacher check"`) is the direct precedent for `STAR_BAND_COPY` — a `Record<1|2|3, string>` const, not inline ternaries scattered through UI code. Keep thresholds and copy in this one file as the single source of truth (RESEARCH.md Anti-Patterns explicitly calls this out).

```typescript
// Target shape (informed by RESEARCH.md Pattern 3 + audio-evidence.ts precedent)
export function scoreToStarBand(pronScore: number): 1 | 2 | 3 { /* ... */ }
export const STAR_BAND_COPY: Record<1 | 2 | 3, string> = {
  3: "Great job!",
  2: "Good try!",
  1: "Keep practicing!",
};
```

---

### `src/server/student-access/audio-upload.ts` (modified — service, event-driven inline hook)

**Analog:** itself — the existing `uploadAttemptAudioClip()` function (full file, 595 lines; already read in one pass, no re-read needed).

**Deps-injection extension pattern** (lines 88-93):
```typescript
export type UploadAttemptAudioClipDeps = {
  transcribeAudioFile?: typeof transcribeAudioFile;
  evaluateOriginalTurn?: typeof evaluateOriginalTurn;
  evaluateRepeatTurn?: typeof evaluateRepeatTurn;
  warmTtsAudioCache?: typeof warmTtsAudioCache;
};
```
Add `scorePronunciation?: typeof scorePronunciation;` to this same `Deps` type — this is the exact place new injectable adapters are wired for testability.

**Inline hook-point pattern** (lines 416-441, where transcription is called and its failure is handled before evaluation runs):
```typescript
const transcribe = deps.transcribeAudioFile ?? transcribeAudioFile;
const transcription = await transcribe({
  file: input.file,
  mimeType: input.mimeType,
});

if (!transcription.ok) {
  await supabase
    .from("audio_clips")
    .update({ /* ...mark failed... */ processing_status: "failed" })
    .eq("id", audioClip.id);

  return { ok: false, error: "transcription_failed_retryable", retryable: true };
}
```
Per D-01 + RESEARCH.md's Anti-Patterns section (avoid blocking latency), the new `scorePronunciation()` call should be composed via `Promise.all` alongside the existing `evaluateOriginalTurn`/`evaluateRepeatTurn` call (both run after `transcript` is known and operate on independent inputs — transcript-text vs. raw audio Blob). **Critical: unlike `transcription.ok` above, a pronunciation-scoring failure must NOT cause the function to `return` early / fail the whole upload** — per RESEARCH.md Open Question 1, scoring failure should degrade gracefully (omit the star band, let meaning/pattern feedback proceed). Structure this as a `try/catch` around the `scorePronunciation` call (mirroring the existing `warmTtsAudioCache` try/catch at lines 548-562, which is already the established "best-effort, non-blocking, log-and-continue" pattern in this exact file) rather than the `transcribe`/`turnWrite` early-return pattern used for critical-path failures.

**Best-effort/non-blocking precedent to copy exactly** (lines 544-563):
```typescript
if (
  input.clipKind === "original_answer" &&
  originalEvaluation?.improvedSentence
) {
  try {
    const warm = deps.warmTtsAudioCache ?? warmTtsAudioCache;
    await warm({ /* ... */ });
  } catch (error) {
    log("warn", "audio.tts_improved_sentence_warmup_failed", {
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      turnOrder: input.turnOrder,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```
This is the exact template for the new pronunciation-scoring call site: `try { const score = deps.scorePronunciation ?? scorePronunciation; ...write to pronunciation_scores... } catch (error) { log("warn", "audio.pronunciation_scoring_failed", {...}); }`.

---

### `src/server/teacher/audio-evidence.ts` (modified — service, CRUD read/join)

**Analog:** itself — existing `mapClip()`/`clipsByTurnId` join pattern (lines 132-138, 261-293, 132-138).

**Sibling-table join pattern** (lines 277-293):
```typescript
if (turnIds.length > 0) {
  const clips = await supabase
    .from("audio_clips")
    .select("id, attempt_turn_id, clip_kind, processing_status")
    .in("attempt_turn_id", turnIds)
    .order("created_at", { ascending: true });

  if (clips.error) {
    throw new Error(`Unable to load audio clips: ${clips.error.message}`);
  }

  for (const clip of (clips.data ?? []) as AudioClipEvidenceRow[]) {
    const existing = clipsByTurnId.get(clip.attempt_turn_id) ?? [];
    existing.push(mapClip(clip));
    clipsByTurnId.set(clip.attempt_turn_id, existing);
  }
}
```
For `pronunciation_scores`, add an analogous second query keyed by `audio_clip_id` (collect `audioClipIds` from `clipsByTurnId`'s values, or query directly `in("audio_clip_id", audioClipIds)`), build a `scoresByAudioClipId` Map, and thread it into `mapClip()`/`mapTurn()` the same way `clipsByTurnId` is threaded into `mapTurn()` (line 201-217). Extend `AttemptAudioClipEvidence` (lines 65-69) with an optional `pronunciationScore` field so `AudioClipPlayer`/the new diagnostic panel can consume it without changing the top-level `AttemptTurnEvidence` shape.

**Row-to-DTO mapper pattern** (lines 132-138):
```typescript
function mapClip(row: AudioClipEvidenceRow): AttemptAudioClipEvidence {
  return {
    id: row.id,
    clipKind: row.clip_kind,
    processingStatus: row.processing_status,
  };
}
```
Follow this exact one-function-per-table-row convention for a new `mapPronunciationScore()` helper (raw DB row → camelCase DTO, no business logic beyond field renaming — score-to-star mapping stays in `domain/pronunciation/scoring.ts`, not here).

---

### `src/components/teacher/PronunciationDiagnosticPanel.tsx` (new — component, on-demand/collapsed)

**Analog:** `src/components/teacher/AudioClipPlayer.tsx` (full file, 118 lines — read in one pass)

**"use client" + collapsed/on-demand state pattern** (lines 1-40):
```typescript
"use client";

import { useState } from "react";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover } from "@/components/ui/hover-styles";

type AudioClipPlayerProps = {
  audioClipId: string;
  label: string;
  unavailableCopy?: string;
};

export function AudioClipPlayer({ audioClipId, label, unavailableCopy = "..." }: AudioClipPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ...
}
```
D-05 explicitly names this component as the pattern to follow for "additive, collapsed, teacher-triggered" UI. Since PronunciationDiagnosticPanel's data (word_scores) is already fetched server-side as part of `getAttemptEvidenceForTeacher()` (no separate signed-URL fetch-on-click needed, unlike audio), the "on-demand" behavior here is purely a client-side `<details>`/toggle-open state, not a server round-trip — simpler than `AudioClipPlayer`'s `loadAudioClipUrlAction` call. Use plain `useState<boolean>` for `expanded`, defaulting `false` (collapsed by default per D-05).

**Container/label/button layout + inline style-object convention** (lines 42-118): Copy the exact inline-`style`-object convention (no CSS modules/Tailwind in this codebase's teacher components — `containerStyle`, `headerStyle`, `labelStyle`, `buttonStyle` as `React.CSSProperties` consts at module scope) for visual consistency with `AudioClipPlayer` when both are rendered together under the same turn card.

---

### `src/components/student/StepAiEvaluationFeedback.tsx` (modified — component, request-response render)

**Analog:** itself — existing outcome-branch render pattern (full file, 251 lines; already read in one pass).

**Insertion point:** Every existing outcome branch (`acceptedOriginal`, `needsCorrection`, `retryOriginal`, `teacherReview`/`repeatReview`, `repeatAccepted`, default/retry-repeat) renders `<Transcript transcript={transcript} />` then an outcome-specific card, then `<RecordingReview audioUrl={audioUrl} onRetry={onRetry} />`. Add a new optional prop `starBand?: 1 | 2 | 3 | null` and a new small `<PronunciationStars starBand={starBand} />` sub-component (matching the existing `Transcript`/`RecordingReview` sub-component convention at lines 192-220) rendered inline within each success-path branch (`acceptedOriginal`, `needsCorrection`, `repeatAccepted`) — never in the `retryOriginal`/error branches, since a failed-language-check turn wasn't meaningfully pronunciation-scored in context. If `starBand` is `null`/`undefined` (scoring failed or omitted per graceful-degradation), render nothing — do not show a placeholder or zero-star state (matches D-03's "never an empty/failed-looking result" framing, interpreted as: absence of data ≠ a bad score).

**Sub-component convention to copy exactly** (lines 192-204, `Transcript`):
```typescript
function Transcript({ transcript }: { transcript?: string | null }) {
  if (!transcript) return null;
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        We heard:
      </p>
      <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
        {transcript}
      </p>
    </div>
  );
}
```
Same "early-return null if no data, otherwise a small labeled block using the module's existing inline-style consts" shape applies to the new `PronunciationStars` sub-component. Import `STAR_BAND_COPY` from `@/domain/pronunciation/scoring` for the caption text — never hardcode star copy in the component.

---

### `src/app/teacher/evidence/[attemptId]/page.tsx` (modified — Server Component route)

**Analog:** itself — `TurnEvidenceSection` (referenced at line 108-110; not yet read beyond line 120, but the insertion point is clear from the file's existing structure and RESEARCH.md's confirmed read of this file).

**Insertion point pattern** (lines 107-111):
```tsx
<section aria-label="Turn transcripts" style={turnListStyle}>
  {evidence.turns.map((turn) => (
    <TurnEvidenceSection key={turn.id} turn={turn} />
  ))}
</section>
```
`TurnEvidenceSection` (defined further down the file, not yet in context — read via targeted offset when implementing) is where each turn's transcript block and `AudioClipPlayer` instances are rendered per `audioClips`. Add `<PronunciationDiagnosticPanel wordScores={clip.pronunciationScore?.wordScores} />` alongside each `AudioClipPlayer` invocation inside that section — same per-clip mapping, additive sibling element, never replacing the transcript paragraph above it. This route is a Server Component (`export default async function AttemptEvidencePage`, no `"use client"`), so `evidence` (including the new pronunciation data) is fetched once server-side via `getAttemptEvidenceForTeacher()` and passed down as props — no new data-fetching code needed in this file beyond what the modified `audio-evidence.ts` already returns.

---

### `supabase/migrations/2026XXXX_pronunciation_scores.sql` (new — migration)

**Analog 1 (table shape):** `supabase/migrations/202606250001_foundation_schema.sql`, `audio_clips` table (lines 148-162):
```sql
create table public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  attempt_turn_id uuid not null references public.attempt_turns(id) on delete cascade,
  clip_kind public.audio_clip_kind not null,
  object_key text,
  mime_type text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  byte_size integer check (byte_size is null or byte_size >= 0),
  processing_status public.audio_processing_status not null default 'pending_upload',
  audio_expires_at timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
And RLS-enable convention (line 205, grouped with all other tables):
```sql
alter table public.audio_clips enable row level security;
```

**Analog 2 (RLS policy shape):** `supabase/migrations/202606250002_teacher_auth_rls.sql`, "teachers manage own audio clips" (lines 238-246):
```sql
-- ---------------------------------------------------------------------------
-- audio_clips: ownership through attempt_turns -> attempt chain
-- ---------------------------------------------------------------------------

create policy "teachers manage own audio clips"
on public.audio_clips for all
to authenticated
using (public.is_attempt_turn_owner(attempt_turn_id))
with check (public.is_attempt_turn_owner(attempt_turn_id));
```
`pronunciation_scores` is keyed on `audio_clip_id`, one join-hop further than `audio_clips` (which is keyed on `attempt_turn_id`). Follow the same section-header-comment + named-policy convention; the `using`/`with check` predicate will need a new helper (e.g. `public.is_audio_clip_owner(audio_clip_id)`) or an inline subquery joining `audio_clips -> attempt_turns -> attempts -> assignment_students -> assignments -> classes.teacher_id`, matching the ownership-chain depth already used by `getAttemptEvidenceForTeacher()`'s nested `.select()` (lines 228-251 of `audio-evidence.ts`) and `createSignedAudioUrlForTeacher()`'s nested `.select()` (lines 321-345 of the same file) — reuse whichever existing helper function (`is_attempt_turn_owner`, or check for an `is_audio_clip_owner` if one already exists) rather than hand-rolling a new join chain.

**RESEARCH.md's drafted schema** (already pattern-matched against `audio_clips`, use as starting point):
```sql
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
  word_scores jsonb not null default '[]'::jsonb,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (audio_clip_id)
);

alter table public.pronunciation_scores enable row level security;
```

---

### `tests/server/pronunciation-scorer.test.ts` (new — test)

**Analog:** `tests/server/transcription.test.ts` (first 80 lines read; file follows a consistent per-scenario `it()` block pattern throughout, no need to read further — the pattern is fully established by lines 1-80).

**Fake-client injection pattern** (lines 1-14):
```typescript
import { describe, expect, it, vi } from "vitest";
import type { TranscriptionClient } from "@/server/audio/transcription";

type FakeTranscriptionClient = TranscriptionClient;

function createFakeClient(result: unknown): FakeTranscriptionClient {
  return {
    audio: {
      transcriptions: {
        create: vi.fn(async () => result) as TranscriptionClient["audio"]["transcriptions"]["create"],
      },
    },
  };
}
```
Follow this exact "typed fake client factory function returning a `vi.fn()`-wrapped stub matching the adapter's injectable client interface" convention for a `createFakePronunciationClient()` in the new test file.

**Deps-injection call + assertion pattern** (lines 16-36):
```typescript
describe("transcribeAudioFile", () => {
  it("returns transcript text from an injected client", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like apples." });

    const result = await transcribeAudioFile(
      { file: new Blob(["voice"], { type: "audio/webm" }), mimeType: "audio/webm", model: "test-transcribe" },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: true, text: "I like apples." });
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-transcribe" }),
    );
  });

  it("maps missing API key before creating a provider request", async () => {
    // ... asserts { ok: false, error: "missing_api_key" } and that the client was never called
  });
});
```
Cover the same scenario categories for `scorePronunciation`: (1) happy path returns `{ ok: true, score: {...} }` from injected client, (2) `missing_api_key` short-circuits before any client/transcode call, (3) `transcode_failed` when the injected `transcodeToWav` throws/rejects, (4) `provider_failed` when the Azure client call throws, (5) an explicit assertion that the raw numeric score is present in the internal result type but the response shape used by student-facing code never leaks it unmapped (per PRON-04 test-map requirement).

---

## Shared Patterns

### Injectable vendor-adapter shape (applies to `pronunciation-scorer.ts`, `audio-transcode.ts`)
**Source:** `src/server/audio/transcription.ts` (full file), `src/server/ai/turn-evaluator.ts` (lines 1-70, same shape confirmed)
**Apply to:** All new server-only vendor-integration files.
```typescript
// Discriminated union result, error-code union, Deps type with optional injected client,
// resolveApiKey()/resolveModel() helpers reading process.env with a deps-override,
// try/catch with generic logged error code only (no leaked provider text or student data).
```

### Best-effort/non-blocking side-effect (applies to the pronunciation-scoring call site in `audio-upload.ts`)
**Source:** `src/server/student-access/audio-upload.ts` lines 544-563 (`warmTtsAudioCache` try/catch)
**Apply to:** The new `scorePronunciation()` invocation inside `uploadAttemptAudioClip`.
```typescript
try {
  const warm = deps.warmTtsAudioCache ?? warmTtsAudioCache;
  await warm({ /* ... */ });
} catch (error) {
  log("warn", "audio.tts_improved_sentence_warmup_failed", { /* structured context, message only */ });
}
```

### Qualitative-band mapping from a raw signal (applies to `domain/pronunciation/scoring.ts`)
**Source:** `src/server/teacher/audio-evidence.ts` lines 166-199 (`mapMeaningResult`, `mapTargetPatternResult`, `mapRepeatResult`)
**Apply to:** `scoreToStarBand()` and any Azure `ErrorType` → highlight mapping.
```typescript
function mapMeaningResult(row: AttemptTurnRow): AttemptTurnEvidence["meaningResult"] {
  const evaluation = readEvaluation(row);
  if (isTeacherReview(row)) return "Needs teacher check";
  if (evaluation?.outcome === "retry_original") return "Try again";
  if (evaluation?.meaningUnderstood === false) return "Try again";
  return "Understood";
}
```

### Row-to-DTO mapper functions (applies to `audio-evidence.ts` extension)
**Source:** `src/server/teacher/audio-evidence.ts` lines 132-138 (`mapClip`)
**Apply to:** New `mapPronunciationScore()` helper joining `pronunciation_scores` into `AttemptAudioClipEvidence`.

### Collapsed/on-demand teacher UI (applies to `PronunciationDiagnosticPanel.tsx`)
**Source:** `src/components/teacher/AudioClipPlayer.tsx` (full file)
**Apply to:** The new diagnostic panel component — `"use client"`, module-scope inline `React.CSSProperties` style consts, collapsed-by-default state, additive placement never displacing sibling transcript content.

### RLS ownership-chain policy (applies to the new migration)
**Source:** `supabase/migrations/202606250002_teacher_auth_rls.sql` lines 238-246 (`audio_clips` policy)
**Apply to:** `pronunciation_scores` RLS policy — extend the existing ownership-chain helper one hop further (`audio_clips.id` → `pronunciation_scores.audio_clip_id`).

## No Analog Found

None — every file in scope has a direct or role-matched analog in the existing codebase. The only genuinely new *technique* (not file-role) is ffmpeg subprocess invocation for audio transcoding, which has no codebase precedent; `audio-transcode.ts` should follow RESEARCH.md's drafted code example plus this codebase's server-only-module and discriminated-union-result conventions layered on top.

## Metadata

**Analog search scope:** `src/server/audio/`, `src/server/ai/`, `src/server/student-access/`, `src/server/teacher/`, `src/components/teacher/`, `src/components/student/`, `src/app/teacher/evidence/`, `supabase/migrations/`, `tests/server/`
**Files scanned:** 9 read in full or targeted-range (transcription.ts, turn-evaluator.ts partial, audio-upload.ts, audio-evidence.ts, AudioClipPlayer.tsx, StepAiEvaluationFeedback.tsx, evidence page partial, foundation_schema.sql partial, teacher_auth_rls.sql partial, transcription.test.ts partial)
**Pattern extraction date:** 2026-07-02
