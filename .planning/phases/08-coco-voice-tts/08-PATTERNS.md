# Phase 8: Coco Voice (TTS) - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 18 new/modified files
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/student/missions/[assignmentStudentId]/tts/route.ts` | route | request-response | `src/app/student/missions/[assignmentStudentId]/audio/route.ts` | exact |
| `src/server/audio/tts-generator.ts` | service | request-response | `src/server/audio/transcription.ts` | role-match |
| `src/server/audio/tts-cache.ts` | service | CRUD + file-I/O | `src/server/student-access/audio-upload.ts` | role-match |
| `src/domain/audio/tts.ts` | model/utility | transform | `src/domain/audio/recorder.ts`, `src/domain/character/profile.ts` | role-match |
| `src/components/student/CocoSpeechAudio.tsx` | component | event-driven + request-response | `src/components/teacher/AudioClipPlayer.tsx`, `src/components/student/VoiceRecorderControl.tsx` | partial |
| `src/components/student/MissionFlowShell.tsx` | component | event-driven | `src/components/student/MissionFlowShell.tsx` | exact |
| `src/components/student/StepBuddyQuestion.tsx` | component | event-driven | `src/components/student/StepBuddyQuestion.tsx` | exact |
| `src/components/student/StepImprovedRepeat.tsx` | component | event-driven | `src/components/student/StepImprovedRepeat.tsx` | exact |
| `src/components/student/StepAiEvaluationFeedback.tsx` | component | event-driven | `src/components/student/StepAiEvaluationFeedback.tsx` | exact |
| `src/components/student/StepTurnTransition.tsx` | component | event-driven | `src/components/student/StepTurnTransition.tsx` | exact |
| `src/components/student/StepMissionComplete.tsx` | component | event-driven | `src/components/student/StepMissionComplete.tsx` | exact |
| `src/domain/character/profile.ts` | model/config | transform | `src/domain/character/profile.ts` | exact |
| `supabase/migrations/*_tts_audio_cache.sql` | migration | CRUD + file-I/O | `supabase/migrations/202606270001_student_audio_storage.sql` | role-match |
| `src/lib/db/types.ts` | model/config | CRUD | `src/lib/db/types.ts` | exact |
| `tests/domain/tts.test.ts` | test | transform | `tests/domain/audio-recorder.test.ts`, `tests/domain/character-profile.test.ts` | role-match |
| `tests/server/tts-generator.test.ts` | test | request-response | `tests/server/transcription.test.ts` | exact |
| `tests/server/tts-cache.test.ts` | test | CRUD + file-I/O | `tests/server/audio-upload.test.ts` | role-match |
| `tests/e2e/student-coco-voice.spec.ts` | test | event-driven + request-response | `tests/e2e/student-audio.spec.ts`, `tests/e2e/student-ai-evaluation.spec.ts` | role-match |

## Pattern Assignments

### `src/app/student/missions/[assignmentStudentId]/tts/route.ts` (route, request-response)

**Analog:** `src/app/student/missions/[assignmentStudentId]/audio/route.ts`

**Imports pattern** (lines 1-9):
```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { readStudentUnlock } from "@/app/join/actions";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_MS,
  uploadAttemptAudioClip,
} from "@/server/student-access/audio-upload";
```

**Validation and route context pattern** (lines 11-23):
```typescript
const audioUploadSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.coerce.number().int().positive(),
  clipKind: z.enum(["original_answer", "repeat_attempt"]),
  durationMs: z.coerce.number().int().min(0).max(MAX_AUDIO_DURATION_MS),
});

type RouteContext = {
  params: Promise<{ assignmentStudentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
```

**Student auth/guard pattern** (lines 23-30):
```typescript
export async function POST(request: Request, context: RouteContext) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    return NextResponse.json({ ok: false, error: "session_expired" }, { status: 401 });
  }

  const { assignmentStudentId } = await context.params;
```

**Service delegation and response pattern** (lines 66-85):
```typescript
const result = await uploadAttemptAudioClip({
  studentId: unlock.studentId,
  assignmentStudentId: parsed.data.assignmentStudentId,
  attemptId: parsed.data.attemptId,
  turnOrder: parsed.data.turnOrder,
  clipKind: parsed.data.clipKind,
  file,
  mimeType,
  durationMs: parsed.data.durationMs,
  byteSize: file.size,
});

if (result.ok) {
  return NextResponse.json({
    ok: true,
    audioClipId: result.audioClipId,
    processingStatus: result.processingStatus,
    transcript: result.transcript,
    evaluation: result.evaluation,
  });
}
```

**Error mapping pattern** (lines 88-107):
```typescript
if (result.error === "not_found") {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

if (result.error === "invalid_audio") {
  return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
}

return NextResponse.json(
  { ok: false, error: "upload_failed_retryable" },
  { status: 502 },
);
```

**Apply to TTS:** Keep the same route shape: `readStudentUnlock`, Zod body parsing, route param UUID validation, then delegate to a server service. Return `{ ok, audioUrl, contentHash, cacheStatus }` on success. Map malformed body to 400, missing unlock to 401, ownership/not found to 404, and generation/storage failures to a non-blocking 502 response the client can render as disabled/error speaker state.

---

### `src/server/audio/tts-generator.ts` (service, request-response)

**Analog:** `src/server/audio/transcription.ts`

**Server-only adapter header and imports** (lines 1-10):
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

**Small result union and injectable client type** (lines 13-28):
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

**Env/model resolution pattern** (lines 42-65):
```typescript
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

function createClient(apiKey: string): TranscriptionClient {
  return new OpenAI({ apiKey }) as TranscriptionClient;
}
```

**Provider call and error hiding pattern** (lines 68-99):
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
    const response = await client.audio.transcriptions.create({
      file: transcriptFile,
      model: resolveModel(input, deps),
      prompt: "The student is an ESL learner speaking English or Korean.",
    });
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

**Related OpenAI adapter pattern:** `src/server/ai/mission-generator.ts` validates input before provider calls and uses dependency injection in the same way (lines 85-131):
```typescript
export async function generateMissionDraft(
  input: GenerateMissionDraftInput,
  deps?: GenerateMissionDraftDeps,
): Promise<GenerateMissionDraftResult> {
  const parsedInput = missionDraftInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: "schema_failed" };
  }

  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        { role: "system", content: "Generate a concise, safe ESL speaking mission draft. Return only data matching the schema." },
        { role: "user", content: JSON.stringify(buildPrompt(parsedInput.data)) },
      ],
      text: { format: zodTextFormat(generatedMissionDraftSchema, "mission_draft") },
    });
    const parsedDraft = parseGeneratedMissionDraft(response.output_parsed);

    if (!parsedDraft.ok) {
      return { ok: false, error: "schema_failed" };
    }

    return { ok: true, draft: parsedDraft.draft };
  } catch {
    return { ok: false, error: "provider_failed" };
  }
}
```

**Apply to TTS:** Define a `SpeechClient` around `client.audio.speech.create`, an injected deps object with `apiKey`, `model`, `voice`, and `client`, and a small result union such as `{ ok: true; audio: Blob; mimeType: "audio/mpeg" } | { ok: false; error: "missing_api_key" | "provider_failed" }`. Do not expose provider exception text to the route/client.

---

### `src/server/audio/tts-cache.ts` (service, CRUD + file-I/O)

**Analog:** `src/server/student-access/audio-upload.ts`

**Server-only service imports and service client pattern** (lines 1-10):
```typescript
/**
 * Student audio upload service (T-05-04..T-05-07).
 *
 * Server-only module. Uses the service-role client, so every write is preceded
 * by app-level ownership checks against assignment_students.student_id and the
 * attempt's assignment_student_id.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
```

**Constants and result union pattern** (lines 39-84):
```typescript
const DEFAULT_AUDIO_BUCKET = "student-audio";
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 90_000;
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
]);

export type UploadAttemptAudioClipResult =
  | {
      ok: true;
      audioClipId: string;
      processingStatus: "transcribed";
      transcript: string;
      evaluation?: StoredOriginalTurnEvaluation | StoredRepeatTurnEvaluation;
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid_audio"
        | "upload_failed_retryable"
        | "transcription_failed_retryable"
        | "db_error";
      retryable: boolean;
    };
```

**Object key and storage upload pattern** (lines 214-240, 388-393):
```typescript
function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

function buildObjectKey(input: {
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  clipKind: AudioClipKind;
  audioClipId: string;
  mimeType: string;
}) {
  const ext = extensionForMimeType(input.mimeType);
  return [
    input.assignmentStudentId,
    input.attemptId,
    String(input.turnOrder),
    `${input.clipKind}-${input.audioClipId}.${ext}`,
  ].join("/");
}

const { error: uploadError } = await supabase.storage
  .from(getStudentAudioBucketId())
  .upload(objectKey, input.file, {
    contentType: input.mimeType,
    upsert: false,
  });
```

**Ownership and snapshot lookup pattern** (lines 304-347):
```typescript
const supabase = createSupabaseServiceClient();

const { data: assignmentStudent, error: assignmentError } = await supabase
  .from("assignment_students")
  .select("id, student_id, status, assignments(mission_snapshot)")
  .eq("id", input.assignmentStudentId)
  .eq("student_id", input.studentId)
  .maybeSingle();

if (assignmentError) {
  return { ok: false, error: "db_error", retryable: true };
}
if (!assignmentStudent) {
  return { ok: false, error: "not_found", retryable: false };
}
if (assignmentStudent.status !== "started") {
  return { ok: false, error: "not_found", retryable: false };
}

const snapshot = readMissionSnapshot(assignmentStudent);
const snapshotTurn = snapshot?.turns.find(
  (missionTurn) => missionTurn.turnOrder === input.turnOrder,
);
if (!snapshot || !snapshotTurn) {
  return { ok: false, error: "invalid_audio", retryable: false };
}
```

**Signed/private Storage URL pattern if planner chooses private bucket** (`src/server/teacher/audio-evidence.ts` lines 315-377):
```typescript
export async function createSignedAudioUrlForTeacher(input: {
  teacherId: string;
  audioClipId: string;
}): Promise<{ signedUrl: string } | null> {
  const supabase = createSupabaseServiceClient();

  const clip = await supabase
    .from("audio_clips")
    .select(`id, object_key, processing_status, deleted_at`)
    .eq("id", input.audioClipId)
    .maybeSingle();

  if (clip.error) {
    throw new Error(`Unable to load audio clip: ${clip.error.message}`);
  }

  if (!clip.data) {
    return null;
  }

  const signed = await supabase.storage
    .from(getStudentAudioBucketId())
    .createSignedUrl(ownedClip.object_key, SIGNED_AUDIO_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`Unable to create signed audio URL: ${signed.error?.message ?? "missing signed URL"}`);
  }

  return { signedUrl: signed.data.signedUrl };
}
```

**Logging pattern** (`src/server/logging/logger.ts` lines 20-31):
```typescript
export function log(
  level: LogLevel,
  event: string,
  context?: Record<string, unknown>,
): void {
  const entry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...context,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}
```

**Apply to TTS:** `tts-cache.ts` should own canonical hash construction, cache lookup, provider call on miss, Storage upload, DB insert/upsert, and cache-hit metadata. Reuse the service-role pattern, but do not reuse `audio_clips` or `student-audio`; TTS needs its own cache table and bucket. Log `contentHash`, `cacheStatus`, model/voice/provider, and non-PII IDs only. Never log spoken text or student transcript text.

---

### `src/domain/audio/tts.ts` (model/utility, transform)

**Analogs:** `src/domain/audio/recorder.ts`, `src/domain/character/profile.ts`

**Pure domain constants pattern** (`src/domain/audio/recorder.ts` lines 1-7):
```typescript
export const MAX_RECORDING_MS = 20000;

export const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;
```

**Pure helper pattern** (`src/domain/audio/recorder.ts` lines 22-41):
```typescript
export function getSupportedAudioMimeType(
  mediaRecorderCtor: MediaRecorderProbe | undefined,
): string {
  if (typeof mediaRecorderCtor?.isTypeSupported !== "function") {
    return "";
  }

  return (
    AUDIO_MIME_CANDIDATES.find((mimeType) =>
      mediaRecorderCtor.isTypeSupported?.(mimeType),
    ) ?? ""
  );
}
```

**Character copy source pattern** (`src/domain/character/profile.ts` lines 14-39):
```typescript
export type CharacterProfile = {
  characterId: string;
  displayName: string;
  questionIntro: string;
  questionLabel: string;
  improvedSentenceIntro: string;
  repeatInstruction: string;
  turnTransition: string;
  completionHeading: string;
  completionBody: (turnCount: number) => string;
  resumeNotice: string;
};

export const DEFAULT_BUDDY: CharacterProfile = {
  characterId: DEFAULT_CHARACTER_ID,
  displayName: "Coco",
  questionIntro: "Hi! Let's practice together.",
  questionLabel: "Coco asks:",
  improvedSentenceIntro: "Nice! Here is a better way to say it:",
  repeatInstruction: "Now try saying it this way:",
  turnTransition: "Good job! Ready for the next one.",
  completionHeading: "Mission complete!",
  completionBody: (turnCount: number) =>
    `Great work! You finished all ${turnCount} turns. Your teacher will see your answers.`,
  resumeNotice: "Welcome back! Picking up where you left off.",
};
```

**Apply to TTS:** Keep `src/domain/audio/tts.ts` pure: Zod schemas, enums for voice/provider/format/line kind, normalization helpers, hash input builders, and line-eligibility helpers only. No DB, server, OpenAI, or React imports.

---

### `src/components/student/CocoSpeechAudio.tsx` (component, event-driven + request-response)

**Analogs:** `src/components/teacher/AudioClipPlayer.tsx`, `src/components/student/VoiceRecorderControl.tsx`

**Client component state/action pattern** (`AudioClipPlayer.tsx` lines 1-38):
```typescript
"use client";

import { useState } from "react";
import {
  loadAudioClipUrlAction,
  type LoadAudioClipUrlActionResult,
} from "@/app/teacher/evidence/[attemptId]/actions";

export function AudioClipPlayer({ audioClipId, label, unavailableCopy = "Audio is not available for this clip." }: AudioClipPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadAudio() {
    setPending(true);
    setError(null);

    const result: LoadAudioClipUrlActionResult =
      await loadAudioClipUrlAction(audioClipId);

    setPending(false);

    if (result.ok) {
      setSignedUrl(result.signedUrl);
    } else {
      setError(unavailableCopy);
    }
  }
```

**Standard `<audio>` playback pattern** (`AudioClipPlayer.tsx` lines 40-67):
```typescript
return (
  <div style={containerStyle}>
    <div style={headerStyle}>
      <span style={labelStyle}>{label}</span>
      {!signedUrl ? (
        <button type="button" onClick={handleLoadAudio} disabled={pending} style={buttonStyle}>
          {pending ? "Preparing audio..." : "Load audio"}
        </button>
      ) : null}
    </div>

    {error ? (
      <p role="alert" style={errorStyle}>
        {error}
      </p>
    ) : null}

    {signedUrl ? (
      <audio controls src={signedUrl} style={audioStyle}>
        Your browser does not support audio playback.
      </audio>
    ) : null}
  </div>
);
```

**Lifecycle cleanup pattern** (`VoiceRecorderControl.tsx` lines 66-81):
```typescript
useEffect(() => {
  if (
    !canUseBrowserRecorder({
      navigator: window.navigator,
      MediaRecorder: window.MediaRecorder,
    })
  ) {
    setState("unsupported");
  }

  return () => {
    clearStopTimer();
    clearCountdown();
    stopStream();
  };
}, []);
```

**Error-state copy and disabled action pattern** (`VoiceRecorderControl.tsx` lines 220-255, 324-349):
```typescript
function statusText() {
  if (state === "failure") {
    return errorMessage ?? "We could not save that recording. Try again.";
  }
  if (isProcessing) {
    return "Saving…";
  }
  if (state === "success") {
    return "Saved";
  }
  return readyCopy[mode];
}

<button
  type="button"
  style={{
    ...(state === "recording" || isError
      ? secondaryButtonStyle
      : primaryButtonStyle),
    opacity: disabled || state === "waiting-permission" ? 0.7 : 1,
    cursor:
      disabled || state === "waiting-permission" || state === "success"
        ? "not-allowed"
        : "pointer",
  }}
  onClick={handleAction}
  disabled={disabled || state === "waiting-permission" || state === "success"}
>
```

**Apply to TTS:** Build `CocoSpeechAudio` as a client component with `loading | ready | playing | error` state, a hidden/unstyled standard `<audio>` element, an icon-only button with `aria-label="Play Coco"`, and a `play()` promise catch path that returns to a replayable ready state. Text rendering must stay outside/alongside this component so TTS failure never hides the line.

---

### `src/components/student/MissionFlowShell.tsx` (component, event-driven)

**Analog:** `src/components/student/MissionFlowShell.tsx`

**Step machine ownership pattern** (lines 3-11, 36-43):
```typescript
/**
 * Mission flow step-state machine (FLOW-02/04/05, D-03/D-12, CHAR-01/02).
 *
 * Owns `FlowState` (turnIndex, step, hintLevel, originalTranscript) via useState.
 * Shows exactly ONE step card at a time (D-12 — no scrolling thread).
 * Steps: question -> repeat -> transition -> (next turn or complete).
 * Step transitions are client state, NOT URL changes (Anti-Pattern).
 * All buddy/sentence text comes from snapshot + static profile — no AI client.
 */

export type FlowStep =
  | "question"
  | "aiFeedback"
  | "repeat"
  | "repeatFeedback"
  | "transition"
  | "reviewPending"
  | "complete";
```

**Fetch-to-student-route pattern** (lines 159-198):
```typescript
const formData = new FormData();
formData.set("file", input.recording.blob, `${input.clipKind}.webm`);
formData.set("attemptId", input.aid);
formData.set("turnOrder", String(currentTurn.turnOrder));
formData.set("clipKind", input.clipKind);
formData.set("durationMs", String(input.recording.durationMs));
formData.set("mimeType", input.recording.mimeType);

const response = await fetch(
  `/student/missions/${assignmentStudentId}/audio`,
  {
    method: "POST",
    body: formData,
  },
);

const payload = (await response.json().catch(() => null)) as
  | { ok?: boolean; transcript?: string; error?: string; evaluation?: UploadVoiceClipPayload["evaluation"] }
  | null;
if (!response.ok || payload?.ok !== true || typeof payload.transcript !== "string") {
  throw new Error("audio_upload_failed");
}
```

**Step rendering pattern** (lines 519-596):
```typescript
{flow.step === "question" && currentTurn && (
  <StepBuddyQuestion
    questionLabel={characterProfile.questionLabel}
    prompt={currentTurn.prompt}
    hintLadder={currentTurn.hintLadder}
    hintLevel={flow.hintLevel}
    onRevealHint={handleRevealHint}
    onVoiceRecorded={handleSubmitOriginalVoice}
    isSubmitting={false}
  />
)}

{flow.step === "repeat" && currentTurn && (
  <StepImprovedRepeat
    originalTranscript={flow.originalTranscript}
    improvedSentenceIntro={characterProfile.improvedSentenceIntro}
    targetExample={flow.improvedSentence ?? currentTurn.targetExample}
    repeatInstruction={characterProfile.repeatInstruction}
    onVoiceRecorded={handleSubmitRepeatVoice}
    isSubmitting={false}
  />
)}

{flow.step === "transition" && (
  <StepTurnTransition
    transitionMessage={characterProfile.turnTransition}
    onNextTurn={handleNextTurn}
  />
)}
```

**Apply to TTS:** Preserve this component as the step owner. Pass only the visible, voice-eligible line metadata to child step cards, or compute the `tts` request object immediately beside each child render. Do not convert the mission into chat or add status changes for TTS. TTS fetch/playback must be additive and non-blocking.

---

### `src/components/student/StepBuddyQuestion.tsx` (component, event-driven)

**Analog:** `src/components/student/StepBuddyQuestion.tsx`

**Speech card and recorder pattern** (lines 12-21, 46-80):
```typescript
import type { HintLadder } from "@/domain/mission/schemas";
import {
  stepCardStyle,
  buddyCardStyle,
} from "@/components/student/styles";
import { HintRevealer } from "@/components/student/HintRevealer";
import {
  VoiceRecorderControl,
  type VoiceRecordingMetadata,
} from "@/components/student/VoiceRecorderControl";

return (
  <div style={stepCardStyle} aria-live="polite">
    <div style={buddyCardStyle}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        {questionLabel}
      </p>
      <p style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.25 }}>
        {prompt}
      </p>
    </div>

    <div style={{ marginTop: 16 }}>
      <HintRevealer hintLadder={hintLadder} hintLevel={hintLevel} onReveal={onRevealHint} />
    </div>

    <div style={{ marginTop: 16 }}>
      <VoiceRecorderControl mode="original" maxSeconds={30} disabled={isSubmitting} onRecorded={...} />
    </div>
  </div>
);
```

**Apply to TTS:** Place `CocoSpeechAudio` inline inside `buddyCardStyle`, next to the prompt line, using the mission prompt as a `mission_prompt` voice line. Do not disable `VoiceRecorderControl` while TTS loads or plays.

---

### `src/components/student/StepImprovedRepeat.tsx` (component, event-driven)

**Analog:** `src/components/student/StepImprovedRepeat.tsx`

**Transcript plus improved sentence pattern** (lines 43-69):
```typescript
return (
  <div style={stepCardStyle} aria-live="polite">
    {originalTranscript && (
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
          We heard:
        </p>
        <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
          {originalTranscript}
        </p>
      </div>
    )}

    <div style={{ ...improvedSentenceCardStyle, marginTop: originalTranscript ? 16 : 0 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        {improvedSentenceIntro}
      </p>
      <p style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.25 }}>
        {targetExample}
      </p>
    </div>

    <p style={{ fontSize: 16, color: "#4B5563", margin: "16px 0 8px", lineHeight: 1.5 }}>
      {repeatInstruction}
    </p>
```

**Apply to TTS:** Voice `targetExample`/improved sentence, not `originalTranscript`. The transcript block must remain text-only. Add the speaker control inside the improved sentence card.

---

### `src/components/student/StepAiEvaluationFeedback.tsx` (component, event-driven)

**Analog:** `src/components/student/StepAiEvaluationFeedback.tsx`

**Feedback branch pattern** (lines 73-96):
```typescript
if (outcome === "needsCorrection") {
  return (
    <div style={stepCardStyle} aria-live="polite">
      <Transcript transcript={transcript} />
      <div style={{ ...improvedSentenceCardStyle, marginTop: transcript ? 16 : 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
              Nice try! Here is a clearer way to say it:
        </p>
        <p style={sentenceStyle}>{improvedSentence}</p>
      </div>
      <p style={{ ...bodyInlineStyle, marginTop: 16 }}>
        Now say it out loud.
      </p>
      <button type="button" style={{ ...primaryButtonStyle, marginTop: 8 }} onClick={onContinue} disabled={isSubmitting}>
        Continue practice
      </button>
      <RecordingReview audioUrl={audioUrl} onRetry={onRetry} />
    </div>
  );
}
```

**Transcript rendering pattern to avoid voicing** (lines 179-190):
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

**Existing native recording review pattern** (lines 193-205):
```typescript
function RecordingReview({ audioUrl, onRetry }: { audioUrl?: string; onRetry?: () => void }) {
  if (!audioUrl && !onRetry) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {audioUrl && (
        <audio controls src={audioUrl} style={{ height: 36, flex: 1, minWidth: 180 }} />
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ fontSize: 14, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
          Record again
        </button>
      )}
    </div>
  );
}
```

**Apply to TTS:** Voice only Coco-style feedback text and improved/model sentences. Do not send `transcript`, `originalTranscript`, or `repeatTranscript` to TTS. Keep the student's own recording review separate from Coco's TTS playback.

---

### `src/components/student/StepTurnTransition.tsx` (component, event-driven)

**Analog:** `src/components/student/StepTurnTransition.tsx`

**Transition line pattern** (lines 15-44):
```typescript
export type StepTurnTransitionProps = {
  transitionMessage: string;
  onNextTurn: () => void;
};

export function StepTurnTransition({ transitionMessage, onNextTurn }: StepTurnTransitionProps) {
  return (
    <div style={{ textAlign: "center", padding: 24 }} aria-live="polite">
      <p style={{ fontSize: 16, color: "#177245", margin: "0 0 16px", fontWeight: 400, lineHeight: 1.5 }}>
        {transitionMessage}
      </p>
      <button type="button" style={primaryButtonStyle} onClick={onNextTurn}>
        Next turn
      </button>
    </div>
  );
}
```

**Apply to TTS:** Add a replay control for `transitionMessage` while visible. Do not make audio completion a prerequisite for `onNextTurn`.

---

### `src/components/student/StepMissionComplete.tsx` (component, event-driven)

**Analog:** `src/components/student/StepMissionComplete.tsx`

**Completion line pattern** (lines 21-57):
```typescript
export function StepMissionComplete({
  completionHeading,
  completionBody,
}: StepMissionCompleteProps) {
  const router = useRouter();

  return (
    <div style={{ textAlign: "center", padding: 24 }} aria-live="polite">
      <h2 style={{ fontSize: 28, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.2 }}>
        {completionHeading}
      </h2>
      <p style={{ fontSize: 16, color: "#4B5563", margin: "8px 0 0", lineHeight: 1.5 }}>
        {completionBody}
      </p>
      <button type="button" style={{ ...primaryButtonStyle, marginTop: 24 }} onClick={() => router.push("/student/home")}>
        Back to homework
      </button>
    </div>
  );
}
```

**Apply to TTS:** Voice a short celebration line. Prefer the Coco-style completion body if it remains concise; avoid voicing navigation text such as "Back to homework".

---

### `src/domain/character/profile.ts` (model/config, transform)

**Analog:** `src/domain/character/profile.ts`

**Static Coco profile pattern** (lines 27-39):
```typescript
export const DEFAULT_BUDDY: CharacterProfile = {
  characterId: DEFAULT_CHARACTER_ID,
  displayName: "Coco",
  questionIntro: "Hi! Let's practice together.",
  questionLabel: "Coco asks:",
  improvedSentenceIntro: "Nice! Here is a better way to say it:",
  repeatInstruction: "Now try saying it this way:",
  turnTransition: "Good job! Ready for the next one.",
  completionHeading: "Mission complete!",
  completionBody: (turnCount: number) =>
    `Great work! You finished all ${turnCount} turns. Your teacher will see your answers.`,
  resumeNotice: "Welcome back! Picking up where you left off.",
};
```

**Apply to TTS:** If adding voice metadata to the character profile, keep it static and bounded: `ttsVoice`, `ttsInstructions`, or similar. Do not add dynamic chat behavior or large character casts.

---

### `supabase/migrations/*_tts_audio_cache.sql` (migration, CRUD + file-I/O)

**Analog:** `supabase/migrations/202606270001_student_audio_storage.sql`

**Bucket migration pattern** (lines 1-13):
```sql
-- Phase 5 (plan 05-02): private Storage bucket for short student audio clips.
--
-- Object access is server-owned. Student uploads go through the service-role
-- app route after unlock-cookie ownership checks, and teacher playback later
-- uses signed URLs only after teacher ownership checks. No public object URLs
-- or public Storage policies are introduced here.

insert into storage.buckets (id, name, public)
values ('student-audio', 'student-audio', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;
```

**Apply to TTS:** Create a separate `tts_audio_cache` table with `content_hash` unique, provider/model/voice/format/character/text metadata, object key, mime type, byte size, and timestamps. Create a separate `tts-audio` bucket. If using private Storage, mirror the private bucket posture above and serve signed URLs from the app route. If using public immutable Storage, document why generated Coco lines contain no student PII and do not reuse this private-student-recording rationale.

---

### `src/lib/db/types.ts` (model/config, CRUD)

**Analog:** existing generated Supabase types

**Current audio table type pattern** (`src/lib/db/types.ts` discovered by grep around `audio_clips`):
```typescript
audio_clips: {
  Row: {
    clip_kind: Database["public"]["Enums"]["audio_clip_kind"];
    processing_status: Database["public"]["Enums"]["audio_processing_status"];
    audio_expires_at: string;
  };
  Insert: {
    clip_kind: Database["public"]["Enums"]["audio_clip_kind"];
    processing_status?: Database["public"]["Enums"]["audio_processing_status"];
    audio_expires_at?: string;
  };
  Update: Partial<Database["public"]["Tables"]["audio_clips"]["Insert"]>;
};
```

**Apply to TTS:** Update generated/manual DB types after the migration so `tts-cache.ts` can use typed `tts_audio_cache` rows. Keep enum-like values in `src/domain/audio/tts.ts` if they are app-owned and not DB enums.

---

### `tests/server/tts-generator.test.ts` (test, request-response)

**Analog:** `tests/server/transcription.test.ts`

**Fake OpenAI client pattern** (lines 1-14):
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

**Provider call assertion pattern** (lines 17-35):
```typescript
const { transcribeAudioFile } = await import("@/server/audio/transcription");
const client = createFakeClient({ text: "I like apples." });

const result = await transcribeAudioFile(
  {
    file: new Blob(["voice"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    model: "test-transcribe",
  },
  { apiKey: "test-key", client },
);

expect(result).toEqual({ ok: true, text: "I like apples." });
expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
  expect.objectContaining({
    model: "test-transcribe",
  }),
);
```

**No paid call on missing key pattern** (lines 57-70):
```typescript
const result = await transcribeAudioFile(
  {
    file: new Blob(["voice"], { type: "audio/webm" }),
    mimeType: "audio/webm",
  },
  { apiKey: "", client },
);

expect(result).toEqual({ ok: false, error: "missing_api_key" });
expect(client.audio.transcriptions.create).not.toHaveBeenCalled();
```

**Apply to TTS:** Assert `audio.speech.create` receives `model`, `voice`, `input`, `instructions`, and `response_format`. Assert missing API key avoids the provider call. Assert provider failures map to a small app-owned error.

---

### `tests/server/tts-cache.test.ts` (test, CRUD + file-I/O)

**Analog:** `tests/server/audio-upload.test.ts`

**Supabase mock pattern** (lines 6-10, 123-220):
```typescript
let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

function createMockSupabase(options: { assignmentFound?: boolean; uploadError?: Error | null } = {}) {
  const operations: Operation[] = [];
  const upload = vi.fn(async () => ({
    error: options.uploadError ?? null,
  }));

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };
    const query = {
      select: vi.fn(() => query),
      insert: vi.fn((payload: unknown) => {
        operation.action = "insert";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      update: vi.fn((payload: unknown) => {
        operation.action = "update";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
    };
    return query;
  }

  return {
    operations,
    storage: { from: vi.fn(() => ({ upload })) },
    upload,
    from: vi.fn((table: string) => createQuery(table)),
  };
}
```

**Ownership/storage assertions pattern** (lines 262-307):
```typescript
const transcribe = successfulTranscriber("I like apples.");
const evaluateOriginal = successfulOriginalEvaluator();
const result = await uploadAttemptAudioClip(audioInput(), {
  transcribeAudioFile: transcribe,
  evaluateOriginalTurn: evaluateOriginal,
});

expect(result).toMatchObject({
  ok: true,
  audioClipId: "clip-1",
  processingStatus: "transcribed",
  transcript: "I like apples.",
});

const assignmentLookup = mockSupabase.operations.find(
  (operation) => operation.table === "assignment_students",
);
expect(assignmentLookup?.filters).toEqual(
  expect.arrayContaining([
    ["id", "as-1"],
    ["student_id", "student-1"],
  ]),
);
expect(mockSupabase.storage.from).toHaveBeenCalledWith("student-audio");
```

**Failure avoids downstream calls pattern** (lines 415-442, 538-576):
```typescript
mockSupabase = createMockSupabase({
  uploadError: new Error("storage unavailable"),
});

const transcribe = successfulTranscriber("should not run");
const result = await uploadAttemptAudioClip(audioInput(), {
  transcribeAudioFile: transcribe,
});

expect(result).toEqual({
  ok: false,
  error: "upload_failed_retryable",
  retryable: true,
});
expect(transcribe).not.toHaveBeenCalled();
```

**Route source-contract pattern** (lines 598-613):
```typescript
const routeSource = readFileSync(
  join(
    process.cwd(),
    "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
  ),
  "utf8",
);

expect(routeSource).toContain("readStudentUnlock");
expect(routeSource).toContain("MAX_AUDIO_BYTES");
expect(routeSource).toContain("MAX_AUDIO_DURATION_MS");
expect(routeSource).toContain("ALLOWED_AUDIO_MIME_TYPES");
expect(routeSource).not.toContain("getPublicUrl");
expect(routeSource).not.toContain("publicUrl");
```

**Apply to TTS:** Add tests where two identical requests cause one fake speech provider call: first response `cacheStatus: "miss"`, second `cacheStatus: "hit"`. Assert assignment/student ownership filters are present before generation. Assert storage/upload failure returns a non-blocking error and does not insert a successful cache row.

---

### `tests/e2e/student-coco-voice.spec.ts` (test, event-driven + request-response)

**Analogs:** `tests/e2e/student-audio.spec.ts`, `tests/e2e/student-ai-evaluation.spec.ts`

**Static mission-flow route contract pattern** (`tests/e2e/student-audio.spec.ts` lines 13-29):
```typescript
test("student audio upload posts FormData before original answer progression", async () => {
  const source = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(source).toContain("new FormData()");
  expect(source).toContain(
    "`/student/missions/${assignmentStudentId}/audio`",
  );
  expect(source).toContain('clipKind: "original_answer"');
  expect(source).toContain('clipKind: "repeat_attempt"');
  expect(source).toContain("await uploadVoiceClip");
});
```

**Classroom-safe copy contract pattern** (`tests/e2e/student-audio.spec.ts` lines 31-49):
```typescript
test("student audio transcription states use classroom-safe copy", async () => {
  const recorderSource = readFileSync(
    "src/components/student/VoiceRecorderControl.tsx",
    "utf8",
  );
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(recorderSource).toContain("Saving…");
  expect(shellSource).toContain("We could not hear that clearly. Record again.");
  expect(shellSource).toContain("Your repeat:");
});
```

**No client OpenAI import pattern** (`tests/e2e/student-ai-evaluation.spec.ts` lines 47-60):
```typescript
test("student client source has no direct OpenAI import or server AI adapter import", async () => {
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );
  const feedbackSource = readFileSync(
    "src/components/student/StepAiEvaluationFeedback.tsx",
    "utf8",
  );

  const clientSource = `${shellSource}\n${feedbackSource}`;
  expect(clientSource).not.toMatch(/from ["']openai["']/);
  expect(clientSource).not.toMatch(/@\/server\/ai/);
});
```

**Apply to TTS:** Add static/e2e assertions that `CocoSpeechAudio` renders a standard `<audio>`, uses an icon button with `aria-label="Play Coco"`, catches `play()` rejection, does not import OpenAI/server audio adapters in client components, and no TTS request uses transcript fields.

## Shared Patterns

### Student Unlock Guard

**Source:** `src/app/join/actions.ts` and `src/app/student/missions/[assignmentStudentId]/audio/route.ts`
**Apply to:** TTS route and any student-facing TTS service call

```typescript
export async function readStudentUnlock(): Promise<StudentUnlockCookie | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(UNLOCK_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StudentUnlockCookie>;
    if (
      typeof parsed.classId === "string" &&
      typeof parsed.studentId === "string" &&
      typeof parsed.className === "string" &&
      typeof parsed.displayName === "string"
    ) {
      return {
        classId: parsed.classId,
        studentId: parsed.studentId,
        className: parsed.className,
        displayName: parsed.displayName,
      };
    }
    return null;
  } catch {
    return null;
  }
}
```

Route use (audio route lines 23-27):
```typescript
const unlock = await readStudentUnlock();
if (!unlock) {
  return NextResponse.json({ ok: false, error: "session_expired" }, { status: 401 });
}
```

### Service-Role Supabase Access

**Source:** `src/lib/supabase/server.ts`
**Apply to:** `tts-cache.ts`, route backing services

```typescript
export function createSupabaseServiceClient() {
  const env = getSupabaseEnv();

  if (!env.url || !env.serviceRoleKey) {
    throw new Error("Supabase service environment is not configured");
  }

  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

### Server-Owned Workflow and No Client AI

**Source:** `tests/server/student-mission-flow.test.ts` lines 150-163 and `tests/domain/ai-boundary.test.ts` lines 16-30
**Apply to:** all student client modules and TTS route/component boundaries

```typescript
const clientSource = `${shellSource}\n${feedbackSource}`;
expect(clientSource).not.toMatch(/from ["']openai["']/);
expect(clientSource).not.toMatch(/@\/server\/ai/);
```

```typescript
const SCAN_DIRS = [
  "src/app/student",
  "src/server/student-access",
  "src/components/student",
  "src/domain/character",
  "src/domain/flow",
];

const FORBIDDEN_TOKENS = [
  "openai",
  "@anthropic-ai/sdk",
  "@anthropic-ai",
  "/api/chat",
  "/api/buddy",
];
```

For Phase 8, allow OpenAI only in `src/server/audio/tts-generator.ts`, not in `"use client"` components.

### Student Flow Resilience

**Source:** `src/components/student/MissionFlowShell.tsx`
**Apply to:** TTS playback integration

```typescript
<div style={{ marginTop: 24 }} aria-live="polite">
  {actionError && (
    <p style={{ color: "#B42318", fontSize: 14, margin: "0 0 16px" }}>
      {actionError}
    </p>
  )}

  {flow.step === "question" && currentTurn && (
    <StepBuddyQuestion
      questionLabel={characterProfile.questionLabel}
      prompt={currentTurn.prompt}
      hintLadder={currentTurn.hintLadder}
      hintLevel={flow.hintLevel}
      onRevealHint={handleRevealHint}
      onVoiceRecorded={handleSubmitOriginalVoice}
      isSubmitting={false}
    />
  )}
</div>
```

TTS must not alter assignment/attempt status, completion checks, retry routing, or recording availability.

### Standard HTML Audio

**Source:** `src/components/teacher/AudioClipPlayer.tsx`, `src/components/student/StepAiEvaluationFeedback.tsx`
**Apply to:** `CocoSpeechAudio`

```typescript
{signedUrl ? (
  <audio controls src={signedUrl} style={audioStyle}>
    Your browser does not support audio playback.
  </audio>
) : null}
```

```typescript
{audioUrl && (
  <audio controls src={audioUrl} style={{ height: 36, flex: 1, minWidth: 180 }} />
)}
```

Phase 8 visible control should be custom/icon-only, but the playback element itself should remain a standard `<audio>` element.

### No Transcript Voicing

**Source:** `src/components/student/StepImprovedRepeat.tsx` and `src/components/student/StepAiEvaluationFeedback.tsx`
**Apply to:** line eligibility helpers and TTS component props

```typescript
{originalTranscript && (
  <div>
    <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
      We heard:
    </p>
    <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
      {originalTranscript}
    </p>
  </div>
)}
```

This transcript block is display-only. TTS line kinds must exclude student transcripts.

## No Analog Found

All planned file roles have at least a partial local analog. The only missing exact behavior is browser autoplay rejection handling; use the researched MDN `HTMLMediaElement.play()` promise pattern with local state/error handling conventions from `VoiceRecorderControl.tsx`.

## Metadata

**Analog search scope:** `src/app`, `src/server`, `src/domain`, `src/components`, `tests`, `supabase/migrations`
**Files scanned:** 120 project files via `rg --files` plus targeted `rg`
**Project-local skills:** none found under `.codex/skills/` or `.agents/skills/`
**Pattern extraction date:** 2026-07-01
