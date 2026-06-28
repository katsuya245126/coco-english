# Phase 06: AI Mission and Turn Intelligence - Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 24 likely new/modified files
**Analogs found:** 24 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/ai/mission-generation.ts` | model/utility | transform | `src/domain/mission/schemas.ts` | role-match |
| `src/domain/ai/turn-evaluation.ts` | model/utility | transform | `src/domain/flow/evaluation.ts` | role-match |
| `src/server/ai/mission-generator.ts` | service | request-response | `src/server/audio/transcription.ts` | role-match |
| `src/server/ai/turn-evaluator.ts` | service | request-response | `src/server/audio/transcription.ts` | role-match |
| `src/app/teacher/missions/actions.ts` | route/action | request-response | `src/app/teacher/missions/actions.ts` | exact |
| `src/components/teacher/MissionDraftPanel.tsx` | component | event-driven | `src/components/teacher/MissionForm.tsx` | role-match |
| `src/components/teacher/MissionForm.tsx` | component | event-driven | `src/components/teacher/MissionForm.tsx` | exact |
| `src/server/student-access/audio-upload.ts` | service | file-I/O/request-response | `src/server/student-access/audio-upload.ts` | exact |
| `src/server/student-access/mission-flow.ts` | service | CRUD/request-response | `src/server/student-access/mission-flow.ts` | exact |
| `src/domain/flow/completion.ts` | utility | transform | `src/domain/flow/completion.ts` | exact |
| `src/domain/flow/evaluation.ts` | utility/model | transform | `src/domain/flow/evaluation.ts` | exact |
| `src/components/student/MissionFlowShell.tsx` | component | event-driven | `src/components/student/MissionFlowShell.tsx` | exact |
| `src/components/student/StepAiEvaluationFeedback.tsx` | component | event-driven | `src/components/student/StepImprovedRepeat.tsx` | role-match |
| `src/components/student/StepImprovedRepeat.tsx` | component | event-driven | `src/components/student/StepImprovedRepeat.tsx` | exact |
| `src/components/student/styles.ts` | utility/config | transform | `src/components/student/styles.ts` | exact |
| `src/server/teacher/audio-evidence.ts` | service | CRUD | `src/server/teacher/audio-evidence.ts` | exact |
| `src/app/teacher/evidence/[attemptId]/page.tsx` | component/route | request-response | `src/app/teacher/evidence/[attemptId]/page.tsx` | exact |
| `tests/domain/mission-generation.test.ts` | test | transform | `tests/domain/mission-schemas.test.ts` | role-match |
| `tests/domain/turn-evaluation.test.ts` | test | transform | `tests/domain/placeholder-evaluation.test.ts` and `tests/server/mission-flow.test.ts` | role-match |
| `tests/server/ai-mission-generator.test.ts` | test | request-response | `tests/server/transcription.test.ts` | role-match |
| `tests/server/turn-evaluator.test.ts` | test | request-response | `tests/server/transcription.test.ts` | role-match |
| `tests/server/student-mission-flow.test.ts` | test | CRUD/request-response | `tests/server/mission-flow.test.ts` | role-match |
| `tests/e2e/teacher-ai-mission-draft.spec.ts` | test | event-driven/source-contract | `tests/e2e/teacher-missions.spec.ts` | role-match |
| `tests/e2e/student-ai-evaluation.spec.ts` | test | event-driven/source-contract | `tests/e2e/student-audio.spec.ts` | role-match |

**Filename decision:** use `tests/domain/mission-generation.test.ts` for mission draft domain coverage and `tests/server/student-mission-flow.test.ts` for student flow/server-owned routing coverage. Do not create `tests/domain/ai-mission-generation.test.ts` or `tests/server/mission-flow-ai.test.ts`.

## Pattern Assignments

### `src/domain/ai/mission-generation.ts` (model/utility, transform)

**Analog:** `src/domain/mission/schemas.ts`

**Imports and Zod schema pattern** (lines 1-20):

```typescript
import { z } from "zod";

export const missionLevelSchema = z.enum([
  "beginner",
  "elementary",
  "intermediate",
]);

export const hintLadderSchema = z.object({
  tier1: z.string().trim().min(1, "Hint 1: Target pattern is required."),
  tier2: z.string().trim().min(1, "Hint 2: Word bank is required."),
  tier3: z.string().trim().min(1, "Hint 3: Full example is required."),
});
```

**Strict mission shape pattern** (lines 35-68):

```typescript
export const missionFormSchema = z
  .object({
    title: z.string().trim().min(1, "Mission title is required."),
    targetPattern: z.string().trim().min(1, "Target pattern is required."),
    topic: z.string().trim().min(1, "Topic is required."),
    level: missionLevelSchema,
    requiredTurns: z.coerce.number().int().min(1).max(12),
    turns: z.array(missionTurnInputSchema).min(1, "Add at least one turn."),
  })
  .refine((value) => value.requiredTurns === value.turns.length, {
    path: ["requiredTurns"],
    message: "Required turns must match the number of authored turns.",
  });
```

**Copy this for Phase 6:** keep generated draft schemas as local Zod object roots, reuse `missionLevelSchema`, `missionTurnInputSchema`, and the required-turns-equals-turns refinement. Add any AI metadata outside assignable mission data.

### `src/domain/ai/turn-evaluation.ts` (model/utility, transform)

**Analog:** `src/domain/flow/evaluation.ts`

**Pure domain module boundary** (lines 1-14):

```typescript
/**
 * Placeholder evaluation shape (D-02 swap point).
 *
 * Pure domain module - no DB, server, or AI/LLM imports.
 */
export const PLACEHOLDER_EVALUATION_VERSION = "placeholder-v1" as const;
```

**Evaluation versioned object pattern** (lines 16-32):

```typescript
export type PlaceholderEvaluation = {
  version: typeof PLACEHOLDER_EVALUATION_VERSION;
  meaningUnderstood: true;
  targetPatternAttempted: true;
  evaluatedAt: string;
};

export function buildPlaceholderEvaluation(
  now: string = new Date().toISOString(),
): PlaceholderEvaluation {
  return {
    version: PLACEHOLDER_EVALUATION_VERSION,
    meaningUnderstood: true,
    targetPatternAttempted: true,
    evaluatedAt: now,
  };
}
```

**Copy this for Phase 6:** use `version: "ai-eval-v1"` plus an `outcome` enum and explicit nullable fields. Keep it pure: no Supabase, OpenAI, server env, or UI copy.

### `src/server/ai/mission-generator.ts` (service, request-response)

**Analog:** `src/server/audio/transcription.ts`

**Server-only adapter and injected fake-client seam** (lines 1-19, 21-39):

```typescript
/**
 * Server-only audio transcription adapter.
 *
 * Keep this module out of client components. Tests inject a fake client so no
 * automated verification calls the paid OpenAI API.
 */
import OpenAI from "openai";

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; error: TranscriptionError };

export type TranscribeAudioFileDeps = {
  apiKey?: string;
  model?: string;
  client?: TranscriptionClient;
};
```

**Env/model resolution and narrow errors** (lines 41-52, 67-95):

```typescript
function resolveApiKey(deps?: TranscribeAudioFileDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

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
    });
    const text = response.text?.trim() ?? "";

    if (!text) {
      return { ok: false, error: "empty_transcript" };
    }

    return { ok: true, text };
  } catch {
    return { ok: false, error: "transcription_failed" };
  }
}
```

**Copy this for Phase 6:** construct OpenAI only server-side, accept `deps.client`, resolve model from input/deps/env/default, return `{ ok:false, error:"missing_api_key" | "schema_failed" | "provider_failed" }`, and do a local Zod parse after provider parsing.

### `src/server/ai/turn-evaluator.ts` (service, request-response)

**Analog:** `src/server/audio/transcription.ts`

Use the same adapter structure as `mission-generator.ts`. The evaluator-specific result should be a narrow union for original and repeat evaluation. Provider/schema failures should not throw across service boundaries; they should return a value the caller can route to teacher review.

**Provider-failure mapping** (lines 76-94):

```typescript
try {
  const client = deps?.client ?? createClient(apiKey);
  const response = await client.audio.transcriptions.create({
    file: transcriptFile,
    model: resolveModel(input, deps),
  });
  const text = response.text?.trim() ?? "";

  if (!text) {
    return { ok: false, error: "empty_transcript" };
  }

  return { ok: true, text };
} catch {
  return { ok: false, error: "transcription_failed" };
}
```

### `src/app/teacher/missions/actions.ts` (route/action, request-response)

**Analog:** same file.

**Server action auth, validation, delegate, revalidate** (lines 1-14, 52-74):

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { missionFormSchema } from "@/domain/mission/schemas";

export async function createMissionAction(
  formData: FormData,
): Promise<MissionActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = missionFormSchema.safeParse(missionPayloadFromFormData(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }

  try {
    const mission = await createMission({ ...parsed.data, teacherId: profile.id });
    revalidatePath("/teacher/missions");
    return { ok: true, missionId: mission.id };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}
```

**Copy this for Phase 6:** add `generateMissionDraftAction` here or adjacent, require teacher profile first, Zod-validate source fields, delegate to `src/server/ai/mission-generator.ts`, return a typed action result, and avoid saving assignment data.

### `src/components/teacher/MissionDraftPanel.tsx` (component, event-driven)

**Analogs:** `src/components/teacher/MissionForm.tsx`, `src/components/teacher/TurnEditor.tsx`

**Client state and action call pattern** (`MissionForm.tsx` lines 1-16, 30-82):

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createMissionAction, updateMissionAction } from "@/app/teacher/missions/actions";

export function MissionForm({ mode, mission, activeAssignmentCount = 0 }: MissionFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(mission?.title ?? "");
  const [targetPattern, setTargetPattern] = useState(mission?.targetPattern ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createMissionAction(formData);
    setSubmitting(false);
    if (result.ok) router.push(`/teacher/missions/${result.missionId}`);
    else setError(result.error);
  }
}
```

**Turn preview shape to copy** (`TurnEditor.tsx` lines 62-130):

```typescript
<div style={{ display: "grid", gap: 24 }}>
  {turns.map((turn, index) => (
    <div key={index} style={turnBlockStyle}>
      <h3 style={labelStyle}>Turn {index + 1}</h3>
      <Field label="Buddy question" value={turn.prompt} />
      <Field label="Target-form example" value={turn.targetExample} />
      <p style={{ ...labelStyle, color: "#4B5563", marginTop: 16 }}>
        Hints
      </p>
    </div>
  ))}
</div>
```

**Style pattern** (`MissionForm.tsx` lines 196-244):

```typescript
const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};
```

### `src/components/teacher/MissionForm.tsx` (component, event-driven)

**Analog:** same file.

Add an optional draft-use callback or compose the new panel above the form. Preserve current manual form state and `turns` state shape.

**State fields that draft should fill** (lines 36-50, 63-68):

```typescript
const [title, setTitle] = useState(mission?.title ?? "");
const [targetPattern, setTargetPattern] = useState(mission?.targetPattern ?? "");
const [topic, setTopic] = useState(mission?.topic ?? "");
const [level, setLevel] = useState<MissionLevel>(mission?.level ?? "elementary");
const [turns, setTurns] = useState<MissionTurnInput[]>(...);

formData.set("title", title);
formData.set("targetPattern", targetPattern);
formData.set("topic", topic);
formData.set("level", level);
formData.set("requiredTurns", String(turns.length));
formData.set("turns", JSON.stringify(turns));
```

### `src/server/student-access/audio-upload.ts` (service, file-I/O/request-response)

**Analog:** same file.

**Ownership, audio metadata, transcription sequence** (lines 94-147, 197-220):

```typescript
export async function uploadAttemptAudioClip(
  input: UploadAttemptAudioClipInput,
  deps: UploadAttemptAudioClipDeps = {},
): Promise<UploadAttemptAudioClipResult> {
  if (!isValidInput(input)) {
    return { ok: false, error: "invalid_audio", retryable: false };
  }

  const supabase = createSupabaseServiceClient();
  const { data: assignmentStudent } = await supabase
    .from("assignment_students")
    .select("id, student_id")
    .eq("id", input.assignmentStudentId)
    .eq("student_id", input.studentId)
    .maybeSingle();

  const transcribe = deps.transcribeAudioFile ?? transcribeAudioFile;
  const transcription = await transcribe({
    file: input.file,
    mimeType: input.mimeType,
  });

  if (!transcription.ok) {
    await supabase.from("audio_clips").update({ processing_status: "failed" });
    return { ok: false, error: "transcription_failed_retryable", retryable: true };
  }
}
```

**Current placeholder write to replace** (lines 222-241):

```typescript
const transcript = transcription.text;
const turnWrite =
  input.clipKind === "original_answer"
    ? await supabase.from("attempt_turns").upsert({
        attempt_id: input.attemptId,
        turn_order: input.turnOrder,
        original_transcript: transcript,
        target_attempted: true,
        evaluation: buildPlaceholderEvaluation(),
      })
    : await supabase.from("attempt_turns").update({
        repeat_transcript: transcript,
        repeat_accepted: true,
      });
```

**Copy this for Phase 6:** keep upload/transcription ordering, then call injected evaluator dependency before writing `target_attempted`, `improved_sentence`, `repeat_accepted`, and evaluation JSON. Do not mark provider/schema uncertainty as a silent success.

### `src/server/student-access/mission-flow.ts` (service, CRUD/request-response)

**Analog:** same file.

**Service-role ownership helper** (lines 53-68):

```typescript
async function loadOwnedAssignmentStudent(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  assignmentStudentId: string,
  studentId: string,
) {
  const { data, error } = await supabase
    .from("assignment_students")
    .select("id, assignment_id, student_id, status, latest_attempt_id, attempt_count, highest_hint_level")
    .eq("id", assignmentStudentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
```

**Audited transition pattern** (lines 159-187):

```typescript
const nowIso = new Date().toISOString();
assertTransitionRequest({
  previousStatus: "assigned",
  nextStatus: "started",
  actorType: "student_session",
  reasonCode: "mission_started",
  occurredAt: nowIso,
});

await supabase.from("assignment_status_events").insert({
  assignment_student_id: input.assignmentStudentId,
  previous_status: "assigned",
  next_status: "started",
  actor_type: "student_session",
  reason_code: "mission_started",
});
```

**Completion gate pattern to update for skip-repeat** (lines 402-424):

```typescript
const { data: turns } = await supabase
  .from("attempt_turns")
  .select("turn_order, original_transcript, repeat_transcript, repeat_accepted")
  .eq("attempt_id", input.attemptId);

if (!isAttemptComplete(input.requiredTurns, turns ?? [])) {
  return { ok: false, error: "not_complete" };
}

assertTransitionRequest({
  previousStatus: "started",
  nextStatus: "completed",
  actorType: "student_session",
  reasonCode: "mission_completed",
  occurredAt: nowIso,
});
```

### `src/domain/flow/completion.ts` (utility, transform)

**Analog:** same file.

**Pure helper pattern** (lines 1-15, 17-26):

```typescript
/**
 * Pure module - no DB, server, or AI/LLM imports.
 */
type CompletionTurn = {
  turn_order: number;
  original_transcript: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
};

function isTurnFinished(turn: CompletionTurn): boolean {
  const hasAnswer = turn.original_transcript !== null && turn.original_transcript.trim().length > 0;
  const hasRepeat = turn.repeat_transcript !== null && turn.repeat_transcript.trim().length > 0;
  const repeatAccepted = turn.repeat_accepted === true;
  return hasAnswer && hasRepeat && repeatAccepted;
}
```

**Copy this for Phase 6:** extend the turn input with the minimal app-owned accepted-original marker needed for correct answers to skip repeat. Keep the function pure and cover both paths in tests.

### `src/components/student/MissionFlowShell.tsx` (component, event-driven)

**Analog:** same file.

**Local state-machine pattern** (lines 34-42, 77-87):

```typescript
export type FlowStep = "question" | "repeat" | "transition" | "complete";

type FlowState = {
  turnIndex: number;
  step: FlowStep;
  hintLevel: number;
  originalTranscript: string | null;
  repeatTranscript: string | null;
};

const [flow, setFlow] = useState<FlowState>({
  turnIndex: startingTurnIndex,
  step: "question",
  hintLevel: 0,
  originalTranscript: null,
  repeatTranscript: null,
});
```

**Upload route contract** (lines 116-153):

```typescript
async function uploadVoiceClip(input: {
  recording: RecordedVoiceClip | RepeatVoiceClip;
  aid: string;
  clipKind: "original_answer" | "repeat_attempt";
}): Promise<string> {
  const formData = new FormData();
  formData.set("file", input.recording.blob, `${input.clipKind}.webm`);
  formData.set("attemptId", input.aid);
  formData.set("turnOrder", String(currentTurn.turnOrder));
  formData.set("clipKind", input.clipKind);
  const response = await fetch(`/student/missions/${assignmentStudentId}/audio`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();
  return payload.transcript;
}
```

**Current forced repeat transition to replace** (lines 165-177):

```typescript
const transcript = await uploadVoiceClip({
  recording,
  aid,
  clipKind: "original_answer",
});

setFlow((prev) => ({
  ...prev,
  step: "repeat",
  originalTranscript: transcript,
  repeatTranscript: null,
}));
```

**Copy this for Phase 6:** change upload return payload to include evaluation decision fields. Add flow steps for checking/correct/non-English/review or model these as a separate evaluation result state, but keep one focused step card at a time.

### `src/components/student/StepAiEvaluationFeedback.tsx` (component, event-driven)

**Analog:** `src/components/student/StepImprovedRepeat.tsx`

**One-card feedback structure** (lines 44-84):

```typescript
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
</div>
```

**Copy this for Phase 6:** use the same `stepCardStyle`, `aria-live="polite"`, visible headings, and static UI-SPEC copy for correct, correction, non-English, and teacher-review states.

### `src/components/student/styles.ts` (utility/config, transform)

**Analog:** same file.

**Existing cards and status surfaces** (lines 103-167):

```typescript
export const stepCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  boxSizing: "border-box",
};

export const improvedSentenceCardStyle: CSSProperties = {
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const recorderProcessingStyle: CSSProperties = {
  ...recorderPanelStyle,
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
};

export const recorderErrorStyle: CSSProperties = {
  ...recorderPanelStyle,
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
};
```

**Copy this for Phase 6:** add or reuse surfaces for correct/review/non-English evaluation states using the UI-SPEC colors, without introducing Tailwind, shadcn, or icons.

### `src/server/teacher/audio-evidence.ts` (service, CRUD)

**Analog:** same file.

**Evidence type and mapper pattern** (lines 34-79, 110-121):

```typescript
type AttemptTurnRow = {
  id: string;
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  repeat_transcript: string | null;
};

export type AttemptTurnEvidence = {
  id: string;
  turnOrder: number;
  originalTranscript: string | null;
  improvedSentence: string | null;
  repeatTranscript: string | null;
  audioClips: AttemptAudioClipEvidence[];
};

function mapTurn(row: AttemptTurnRow, clipsByTurnId: Map<string, AttemptAudioClipEvidence[]>): AttemptTurnEvidence {
  return {
    id: row.id,
    turnOrder: row.turn_order,
    originalTranscript: row.original_transcript,
    improvedSentence: row.improved_sentence,
    repeatTranscript: row.repeat_transcript,
    audioClips: clipsByTurnId.get(row.id) ?? [],
  };
}
```

**Teacher ownership and transcript-first query** (lines 124-167):

```typescript
export async function getAttemptEvidenceForTeacher(input: {
  teacherId: string;
  attemptId: string;
}): Promise<AttemptEvidence | null> {
  const supabase = createSupabaseServiceClient();
  const attempt = await supabase
    .from("attempts")
    .select(`assignment_students!attempts_assignment_student_id_fkey!inner(...)`)
    .eq("id", input.attemptId)
    .eq("assignment_students.assignments.classes.teacher_id", input.teacherId)
    .maybeSingle();

  const turns = await supabase
    .from("attempt_turns")
    .select("id, turn_order, original_transcript, improved_sentence, repeat_transcript")
    .eq("attempt_id", input.attemptId)
    .order("turn_order", { ascending: true });
}
```

**Copy this for Phase 6:** include `evaluation`, `target_attempted`, `repeat_accepted`, and attempt `needs_review_reason` in the service type/query. Keep signed audio loading separate.

### `src/app/teacher/evidence/[attemptId]/page.tsx` (component/route, request-response)

**Analog:** same file.

**Teacher route guard and evidence load** (lines 1-29):

```typescript
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getAttemptEvidenceForTeacher } from "@/server/teacher/audio-evidence";

export default async function AttemptEvidencePage({ params }: { params: Promise<{ attemptId: string }> }) {
  const [{ attemptId }, profile] = await Promise.all([
    params,
    requireTeacherProfile(),
  ]);
  const evidence = await getAttemptEvidenceForTeacher({
    teacherId: profile.id,
    attemptId,
  });

  if (!evidence) {
    notFound();
  }
}
```

**Transcript-first rendering pattern** (lines 91-158):

```typescript
function TurnEvidenceSection({ turn }: { turn: AttemptTurnEvidence }) {
  const originalClips = turn.audioClips.filter((clip) => clip.clipKind === "original_answer");
  const repeatClips = turn.audioClips.filter((clip) => clip.clipKind === "repeat_attempt");

  return (
    <article style={turnCardStyle}>
      <h2 style={turnHeadingStyle}>Turn {turn.turnOrder}</h2>
      <TranscriptBlock label="Original answer" transcript={turn.originalTranscript} />
      <TranscriptBlock label="Repeat attempt" transcript={turn.repeatTranscript} />
      <AudioClipList label="Original answer audio" clips={originalClips} />
      <AudioClipList label="Repeat attempt audio" clips={repeatClips} />
    </article>
  );
}
```

### Test Files

#### `tests/server/ai-mission-generator.test.ts` and `tests/server/turn-evaluator.test.ts`

**Analog:** `tests/server/transcription.test.ts`

**Fake client and no paid calls** (lines 1-19, 21-40):

```typescript
import { describe, expect, it, vi } from "vitest";

function createFakeClient(result: unknown): FakeTranscriptionClient {
  return {
    audio: {
      transcriptions: {
        create: vi.fn(async () => result),
      },
    },
  };
}

it("returns transcript text from an injected client", async () => {
  const { transcribeAudioFile } = await import("@/server/audio/transcription");
  const client = createFakeClient({ text: "I like apples." });
  const result = await transcribeAudioFile(input, { apiKey: "test-key", client });
  expect(result).toEqual({ ok: true, text: "I like apples." });
});
```

**Error fixtures** (lines 62-75, 93-114):

```typescript
it("maps missing API key before creating a provider request", async () => {
  const client = createFakeClient({ text: "Should not run" });
  const result = await transcribeAudioFile(input, { apiKey: "", client });
  expect(result).toEqual({ ok: false, error: "missing_api_key" });
  expect(client.audio.transcriptions.create).not.toHaveBeenCalled();
});

it("maps provider failures without exposing provider details", async () => {
  const client = { audio: { transcriptions: { create: vi.fn(async () => { throw new Error("provider unavailable"); }) } } };
  const result = await transcribeAudioFile(input, { apiKey: "test-key", client });
  expect(result).toEqual({ ok: false, error: "transcription_failed" });
});
```

#### `tests/domain/mission-generation.test.ts`

**Analog:** `tests/domain/mission-schemas.test.ts`

**Schema success/failure shape** (lines 17-51):

```typescript
it("accepts complete mission content with ordered turns and hint tiers", () => {
  const parsed = missionFormSchema.parse({
    title: "After-school likes",
    targetPattern: "I like ___ing.",
    topic: "After school",
    level: "elementary",
    requiredTurns: 2,
    turns: [completeTurn, { ...completeTurn, prompt: "What does your friend like doing?" }],
  });

  expect(parsed.turns).toHaveLength(2);
});

it("rejects required turns that differ from authored turns", () => {
  const parsed = missionFormSchema.safeParse({ requiredTurns: 3, turns: [completeTurn] });
  expect(parsed.success).toBe(false);
});
```

#### `tests/domain/turn-evaluation.test.ts` and `tests/server/student-mission-flow.test.ts`

**Analogs:** `tests/server/mission-flow.test.ts`, `tests/domain/foundation-status.test.ts`

**Pure completion fixtures** (`tests/server/mission-flow.test.ts` lines 24-43, 45-112):

```typescript
function makeTurn(
  turnOrder: number,
  overrides: Partial<Omit<TestTurn, "turn_order">> = {},
): TestTurn {
  return {
    turn_order: turnOrder,
    original_transcript: overrides.original_transcript ?? null,
    repeat_transcript: overrides.repeat_transcript ?? null,
    repeat_accepted: overrides.repeat_accepted ?? null,
  };
}

it("returns false when repeat_accepted is false", () => {
  const turns = [makeCompleteTurn(1), makeTurn(2, { repeat_accepted: false })];
  expect(isAttemptComplete(3, turns)).toBe(false);
});
```

**Teacher-review transition fixtures** (`tests/domain/foundation-status.test.ts` lines 21-35, 70-93):

```typescript
it.each([
  ["started", "teacher_review"],
  ["needs_retry", "teacher_review"],
  ["teacher_review", "completed"],
] as const)("allows legal transition %s -> %s", (previousStatus, nextStatus) => {
  expect(canTransitionAssignmentStatus(previousStatus, nextStatus)).toBe(true);
});

it("requires teacher override audit data", () => {
  expect(() =>
    assertTransitionRequest({ ...base, actorId: "teacher-1" }),
  ).not.toThrow();
});
```

#### `tests/e2e/teacher-ai-mission-draft.spec.ts`

**Analog:** `tests/e2e/teacher-missions.spec.ts`

**Env-gated teacher route pattern** (lines 27-60):

```typescript
test("mission list empty state matches UI-SPEC copy", async ({ page }) => {
  if (!SUPABASE_ENV_PRESENT) {
    await page.goto("/teacher/missions");
    await expect(page).toHaveURL(/\/auth\/login/);
    return;
  }

  test.skip(
    !process.env.E2E_TEACHER_EMAIL || !process.env.E2E_TEACHER_PASSWORD,
    "Logged-in teacher fixture not provisioned; empty state test is env-gated.",
  );
});
```

#### `tests/e2e/student-ai-evaluation.spec.ts`

**Analog:** `tests/e2e/student-audio.spec.ts`

**Source-contract checks for UI flow** (lines 13-29, 31-50):

```typescript
test("student audio upload posts FormData before original answer progression", async () => {
  const source = readFileSync("src/components/student/MissionFlowShell.tsx", "utf8");
  expect(source).toContain("new FormData()");
  expect(source).toContain('clipKind: "original_answer"');
  expect(source).toContain('clipKind: "repeat_attempt"');
});

test("student audio transcription states use classroom-safe copy", async () => {
  const recorderSource = readFileSync("src/components/student/VoiceRecorderControl.tsx", "utf8");
  expect(recorderSource).toContain("Saving your voice...");
  expect(recorderSource).toContain("Listening to your answer...");
});
```

## Shared Patterns

### Authentication and Ownership

**Teacher source:** `src/app/teacher/missions/actions.ts` lines 52-56 and `src/app/teacher/evidence/[attemptId]/page.tsx` lines 18-24.

```typescript
const profile = await requireTeacherProfile();
const evidence = await getAttemptEvidenceForTeacher({
  teacherId: profile.id,
  attemptId,
});
```

**Student source:** `src/app/student/missions/[assignmentStudentId]/audio/route.ts` lines 18-22 and `src/server/student-access/mission-flow.ts` lines 53-68.

```typescript
const unlock = await readStudentUnlock();
if (!unlock) {
  return NextResponse.json({ ok: false, error: "session_expired" }, { status: 401 });
}

.eq("id", assignmentStudentId)
.eq("student_id", studentId)
```

### Validation

**Source:** `src/app/student/missions/[assignmentStudentId]/audio/route.ts` lines 6-12, 33-43.

```typescript
const audioUploadSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.coerce.number().int().positive(),
  clipKind: z.enum(["original_answer", "repeat_attempt"]),
  durationMs: z.coerce.number().int().min(0),
});

const parsed = audioUploadSchema.safeParse({...});
if (!parsed.success) {
  return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
}
```

### Error Handling

**Source:** `src/server/audio/transcription.ts` lines 71-94 and `src/server/student-access/audio-upload.ts` lines 279-281.

```typescript
if (!apiKey) {
  return { ok: false, error: "missing_api_key" };
}

try {
  ...
} catch {
  return { ok: false, error: "db_error", retryable: true };
}
```

### Status Transitions and Audit Events

**Source:** `src/domain/foundation/status.ts` lines 13-28, 36-81.

```typescript
export type StatusActorType =
  | "system"
  | "teacher"
  | "student_session"
  | "job"
  | "ai_evaluator";

const LEGAL_TRANSITIONS = {
  started: new Set(["completed", "missed", "needs_retry", "teacher_review"]),
  teacher_review: new Set(["completed", "needs_retry", "started"]),
};

export function assertTransitionRequest(request: TransitionRequest): void {
  if (!canTransitionAssignmentStatus(request.previousStatus, request.nextStatus)) {
    throw new Error(`Illegal assignment status transition`);
  }
  if (!request.reasonCode?.trim()) throw new Error("Status transition requires reasonCode");
  if (!request.occurredAt?.trim()) throw new Error("Status transition requires occurredAt");
}
```

**Database support:** `supabase/migrations/202606250001_foundation_schema.sql` lines 116-145, 164-174.

```sql
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_student_id uuid not null references public.assignment_students(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  completed_at timestamptz,
  needs_review_reason text
);

create table public.attempt_turns (
  original_transcript text,
  improved_sentence text,
  repeat_transcript text,
  evaluation jsonb not null default '{}'::jsonb,
  target_attempted boolean,
  repeat_accepted boolean
);

create table public.assignment_status_events (
  assignment_student_id uuid not null references public.assignment_students(id) on delete cascade,
  previous_status public.assignment_student_status,
  next_status public.assignment_student_status not null,
  actor_type public.status_actor_type not null,
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb
);
```

### UI Style

**Teacher source:** `src/components/teacher/MissionForm.tsx` lines 196-255.

**Student source:** `src/components/student/styles.ts` lines 103-167.

Use inline `React.CSSProperties`, 8px radii, 44px min controls, no Tailwind/shadcn/icon dependency.

### AI Boundary

**Source:** `tests/domain/ai-boundary.test.ts` lines 16-30, 64-114.

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

expect(violations, `AI-06 boundary violated:\n${violations.join("\n")}`).toEqual([]);
```

Do not import OpenAI into student components or student routes. Phase 6 evaluator calls belong in server services after transcription.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|--------------|------|-----------|--------|
| OpenAI `responses.parse` with `zodTextFormat` | service/provider API | request-response | Existing OpenAI usage is audio transcription only. Planner should use `06-RESEARCH.md` and installed `openai/helpers/zod` docs for this exact provider call. |
| Root-object strict structured output schemas | model/provider contract | transform | Existing Zod schemas are local app validation only. Planner should ensure model output schemas are root `z.object(...)` with required fields and no top-level union. |

## Metadata

**Analog search scope:** `src`, `tests`, `supabase`
**Files scanned:** 73 tracked source/test/schema files by `rg --files`
**Primary analogs read:** `src/server/audio/transcription.ts`, `tests/server/transcription.test.ts`, `src/domain/mission/schemas.ts`, `src/app/teacher/missions/actions.ts`, `src/components/teacher/MissionForm.tsx`, `src/components/student/MissionFlowShell.tsx`, `src/server/student-access/audio-upload.ts`, `src/server/student-access/mission-flow.ts`, `src/domain/foundation/status.ts`, `src/server/teacher/audio-evidence.ts`
**Pattern extraction date:** 2026-06-27
