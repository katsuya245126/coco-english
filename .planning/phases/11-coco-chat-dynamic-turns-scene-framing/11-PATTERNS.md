# Phase 11: Coco Chat (dynamic turns + scene framing) - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 12 (new + modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/server/ai/conversation-generator.ts` (NEW) | service (AI adapter) | request-response | `src/server/ai/mission-generator.ts` | exact |
| `src/server/ai/content-moderation.ts` (NEW) | service (AI adapter) | request-response | `src/server/ai/turn-evaluator.ts` | exact (shape) / net-new (fail-closed semantics) |
| `src/domain/ai/conversation-generation.ts` (NEW) | model (zod schemas) | transform | `src/domain/ai/mission-generation.ts` | exact |
| `src/domain/conversation/fallback-lines.ts` (NEW) | utility (static data) | batch | `src/domain/character/profile.ts` | role-match |
| `src/domain/mission/schemas.ts` (MODIFY) | model | CRUD | itself (extend in place) | exact |
| `src/server/student-access/mission-flow.ts` (MODIFY) | service | CRUD + event-driven (turn-cap gate) | itself (extend in place) | exact |
| `src/server/teacher/audio-evidence.ts` (MODIFY) | service (data assembly) | request-response | itself (extend in place) | exact |
| `src/components/teacher/MissionForm.tsx` (MODIFY) | component (form) | request-response | itself (extend in place) | exact |
| `src/components/teacher/CocoLineTranscriptRow.tsx` (NEW) | component | request-response (presentational) | `src/components/teacher/PronunciationDiagnosticPanel.tsx` | exact |
| `src/components/teacher/ModerationFlagPanel.tsx` (NEW, implied by D-16) | component | request-response (presentational) | `src/components/teacher/PronunciationDiagnosticPanel.tsx` | exact |
| `src/app/teacher/evidence/[attemptId]/page.tsx` (MODIFY) | route (server component) | request-response | itself (extend in place) | exact |
| `src/components/student/MissionFlowShell.tsx` (MODIFY) + `StepCocoThinking.tsx` (NEW) | component (state machine + step) | event-driven (client step transitions) | itself (extend in place) | exact |
| `supabase/migrations/2026070Xxxxx_coco_chat_dynamic_turns.sql` (NEW) | migration | batch | `supabase/migrations/202606250001_foundation_schema.sql` | exact (additive-column precedent) |

## Pattern Assignments

### `src/server/ai/conversation-generator.ts` (service, request-response)

**Analog:** `src/server/ai/mission-generator.ts` (132 lines, read in full)

This is a near-literal clone of the file's structure. Copy the whole adapter shape verbatim, renaming domain-specific pieces.

**Imports pattern** (lines 1-17):
```typescript
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  generatedMissionDraftSchema,
  missionDraftInputSchema,
  parseGeneratedMissionDraft,
  type GenerateMissionDraftInput,
  type GeneratedMissionDraft,
  type ParsedGenerateMissionDraftInput,
} from "@/domain/ai/mission-generation";
```
For the new adapter, import from the new `@/domain/ai/conversation-generation` instead, mirroring the same symbol names (`generatedCocoReplySchema`, `conversationInputSchema`, `parseGeneratedCocoReply`, etc.).

**Deps/client type pattern** (lines 30-49):
```typescript
export type MissionResponsesClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{ role: "system" | "user"; content: string }>;
      text: { format: unknown };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type GenerateMissionDraftDeps = {
  apiKey?: string;
  model?: string;
  client?: MissionResponsesClient;
};
```
Rename to `ConversationResponsesClient` / `GenerateCocoReplyDeps` — identical shape. This is the injectable-fake-client pattern (AI-06 boundary) — non-negotiable, copy exactly.

**Resolve apiKey/model + createClient pattern** (lines 51-66):
```typescript
function resolveApiKey(deps?: GenerateMissionDraftDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: GenerateMissionDraftDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_MISSION_MODEL?.trim() ||
    DEFAULT_MISSION_MODEL
  );
}

function createClient(apiKey: string): MissionResponsesClient {
  return new OpenAI({ apiKey }) as MissionResponsesClient;
}
```
Use a new env var, e.g. `OPENAI_CONVERSATION_MODEL`, same `DEFAULT_..._MODEL = "gpt-4.1-mini"` fallback.

**Core request-response pattern** (lines 85-131, full function body):
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
        { role: "system", content: "..." },
        { role: "user", content: JSON.stringify(buildPrompt(parsedInput.data)) },
      ],
      text: { format: zodTextFormat(generatedMissionDraftSchema, "mission_draft") },
    });
    const parsedDraft = parseGeneratedMissionDraft(response.output_parsed);
    if (!parsedDraft.ok) return { ok: false, error: "schema_failed" };
    return { ok: true, draft: parsedDraft.draft };
  } catch {
    return { ok: false, error: "provider_failed" };
  }
}
```
Same three-tier error union (`missing_api_key | provider_failed | schema_failed`) must be reused for `GenerateCocoReplyResult`. Reconstruct the prompt payload fresh every call per RESEARCH.md Pattern 2 — do not carry history state.

**Error-logging enrichment (better analog: `turn-evaluator.ts` lines 190-194 and 240-242):**
```typescript
} catch {
  log("error", "ai.evaluation_failed", { turnKind: "original", error: "provider_failed" });
  return { ok: false, error: "provider_failed" };
}
```
`mission-generator.ts` does NOT log; `turn-evaluator.ts` does via `@/server/logging/logger`. Prefer the `turn-evaluator.ts` logging convention for `conversation-generator.ts` since dynamic-turn failures need audit visibility (D-13 "the event is logged").

---

### `src/server/ai/content-moderation.ts` (service, request-response — net-new fail-closed semantics)

**Analog (structure only):** `src/server/ai/turn-evaluator.ts` (deps/client/error-union shape); **no direct in-repo analog for fail-closed defaulting** — this is the first moderation integration in the codebase (confirmed by RESEARCH.md).

**Deps/client type pattern** — copy the same shape as above:
```typescript
export type ModerationClient = {
  moderations: {
    create(input: { input: string; model?: string }): Promise<{
      results: Array<{ flagged: boolean }>;
    }>;
  };
};
```

**Fail-closed pattern (net-new — RESEARCH.md Pitfall 3, must NOT mirror the existing adapters' error-surfacing convention):**
```typescript
export async function isContentSafe(
  text: string,
  deps?: { client?: ModerationClient; apiKey?: string },
): Promise<{ safe: boolean; failedOpen: false } | { safe: false; failedOpen: true }> {
  try {
    const client = deps?.client ?? createClient(resolveApiKey(deps));
    const result = await client.moderations.create({
      input: text,
      model: "omni-moderation-latest",
    });
    const flagged = result.results[0]?.flagged;
    if (typeof flagged !== "boolean") {
      return { safe: false, failedOpen: true }; // malformed → fail closed
    }
    return { safe: !flagged, failedOpen: false };
  } catch {
    return { safe: false, failedOpen: true }; // provider error → fail closed
  }
}
```
Critical divergence from existing adapters: `mission-generator.ts`/`turn-evaluator.ts` surface a typed `provider_failed` error upward for the caller to handle; this wrapper must instead resolve to `safe: false` on any ambiguity so the caller can route directly to the canned-fallback path (D-10/D-13) without a separate error-branch decision.

---

### `src/domain/ai/conversation-generation.ts` (model, transform)

**Analog:** `src/domain/ai/mission-generation.ts` (not read in full this pass — module referenced by `mission-generator.ts` imports; same directory convention).

**Pattern to copy:** zod schema + `parseGeneratedX` safe-parse helper + typed `GeneratedX` export, matching:
```typescript
generatedMissionDraftSchema, missionDraftInputSchema, parseGeneratedMissionDraft,
type GenerateMissionDraftInput, type GeneratedMissionDraft, type ParsedGenerateMissionDraftInput
```
New file exports the equivalent for Coco replies: `generatedCocoReplySchema`, `conversationTurnInputSchema`, `parseGeneratedCocoReply`, `type GenerateCocoReplyInput`, `type GeneratedCocoReply`.

---

### `src/domain/mission/schemas.ts` (model, CRUD — MODIFY in place)

**Analog:** itself, full file read (115 lines).

**Existing refine to relax (lines 35-68, `missionFormSchema`):**
```typescript
export const missionFormSchema = z
  .object({
    // ...
    requiredTurns: z.coerce.number().int().min(1).max(12),
    turns: z.array(missionTurnInputSchema).min(1, "Add at least one turn."),
  })
  .refine((value) => value.requiredTurns === value.turns.length, {
    path: ["requiredTurns"],
    message: "Required turns must match the number of authored turns.",
  });
```
**Existing refine to relax (lines 78-92, `missionSnapshotSchema`):**
```typescript
export const missionSnapshotSchema = z
  .object({ /* ... */ turns: z.array(missionSnapshotTurnSchema).min(1) })
  .refine((value) => value.requiredTurns === value.turns.length, {
    path: ["requiredTurns"],
    message: "Snapshot required turns must match turn count.",
  });
```
Per RESEARCH.md Pitfall 1 (Common Pitfalls) and Pattern 4: add `conversationMode: z.boolean().default(false)` and `scenePremise: z.string().trim().nullable().default(null)` to both `missionFormSchema` and `missionSnapshotSchema`, and make the `.refine()` a no-op when `conversationMode === true` (e.g. `value.conversationMode || value.requiredTurns === value.turns.length`). Also widen `requiredTurns.max(12)` is already compatible with D-02's 3–8 range for chat missions — reuse the existing field, just validate 3–8 only when `conversationMode` is true (Claude's discretion on whether that's a separate `.refine()` branch or a conditional min/max).

---

### `src/server/student-access/mission-flow.ts` (service, CRUD + event-driven — MODIFY in place)

**Analog:** itself, key sections read (imports/helpers lines 1-96, `recordAnswer` lines 361-413).

**Module boundary comment to preserve (lines 1-11):**
```typescript
/**
 * Mission-flow service (D-01..D-08, FLOW-02/04/05/07).
 *
 * Server-only module — performs NO free-text generation and imports NO
 * AI client (AI-06 structural). Uses the service-role client to bypass
 * RLS; every function enforces app-level ownership by filtering on
 * student_id = the caller's unlocked identity.
 */
```
This comment IS the AI-06 boundary contract — update the phase/decision references (add "D-01..D-05 Phase 11") but preserve "imports NO AI client." Per RESEARCH.md Open Question 3, `mission-flow.ts` should keep owning only turn-cap counting + persistence; the new `conversation-generator.ts`/`content-moderation.ts` calls belong in the server-action/route layer that already calls `evaluateOriginalTurn`/`evaluateRepeatTurn` (locate that call site during planning — likely `src/app/student/...` actions, not this file).

**Ownership-scoped load pattern (lines 64-96, reuse verbatim shape for any new loader):**
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

**Idempotent upsert-on-turn-order pattern (lines 361-413, `recordAnswer` — the pattern for persisting `coco_line`):**
```typescript
export async function recordAnswer(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  originalTranscript: string;
}): Promise<RecordAnswerResult> {
  const trimmed = input.originalTranscript.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty_transcript" };

  const supabase = createSupabaseServiceClient();
  const asRow = await loadOwnedAssignmentStudent(supabase, input.assignmentStudentId, input.studentId);
  if (!asRow) return { ok: false, error: "not_found" };
  const attempt = await loadOwnedAttempt(supabase, input.assignmentStudentId, input.attemptId);
  if (!attempt.ok) return attempt;
  if (attempt.attempt.status !== "in_progress") return { ok: false, error: "not_found" };

  const { error } = await supabase
    .from("attempt_turns")
    .upsert(
      {
        attempt_id: input.attemptId,
        turn_order: input.turnOrder,
        original_transcript: trimmed,
        target_attempted: true,
        evaluation: buildPlaceholderEvaluation(),
      },
      { onConflict: "attempt_id,turn_order" },
    );
  if (error) return { ok: false, error: "db_error" };
  return { ok: true };
}
```
New `recordCocoLine` (or extend `recordAnswer`'s upsert payload) follows this exact upsert-on-`(attempt_id, turn_order)` idempotency shape — add `coco_line` and moderation-flag jsonb column to the same upsert payload object. The `HARD_TURN_CAP = 8` gate (RESEARCH.md Code Examples) belongs as a new pure function in this file, called before any turn-generation invocation, deriving the count server-side from actual `attempt_turns` rows (never trusting a client-supplied turn number) — same defensive posture as the existing `nextUnfinishedTurnOrder` helper imported from `@/domain/flow/completion`.

---

### `src/server/teacher/audio-evidence.ts` (service/data-assembly, request-response — MODIFY in place)

**Analog:** itself, lines 75-258 read.

**Evidence shape pattern to extend (lines 87-118):**
```typescript
export type AttemptTurnEvidence = {
  id: string;
  turnOrder: number;
  originalTranscript: string | null;
  improvedSentence: string | null;
  repeatTranscript: string | null;
  meaningResult: "Understood" | "Try again" | "Needs teacher check";
  targetPatternResult: "Target pattern used" | "Target pattern missing" | "Needs teacher check";
  repeatResult: "Accepted" | "Try again" | "Needs teacher check" | null;
  reviewReason: string | null;
  audioClips: AttemptAudioClipEvidence[];
};

export type AttemptEvidence = {
  attemptId: string;
  // ...
  missionTitle: string;
  // ...
  turns: AttemptTurnEvidence[];
};
```
Add to `AttemptTurnEvidence`: `cocoLine: string | null`, `moderationFlag: { kind: "retried" | "canned_fallback" | "flagged_student_input"; detail?: string } | null` (D-16). Add to `AttemptEvidence`: `targetPattern: string`, `scenePremise: string | null` (D-17, sourced from `mission_snapshot`).

**Mapper pattern to mirror (lines 148-177, `mapPronunciationScore`/`mapClip` — same style for a new `mapModerationFlag`/`mapCocoLine`):**
```typescript
function mapPronunciationScore(row: PronunciationScoreRow): AttemptPronunciationScoreEvidence {
  const wordScores = Array.isArray(row.word_scores) ? row.word_scores : [];
  return {
    starBand: row.star_band as PronunciationStarBand,
    words: wordScores.map((entry) => { /* narrow unknown → typed shape */ }),
  };
}
```
Follow this same "narrow unknown jsonb → typed evidence shape, default to safe fallback" convention for reading `attempt_turns.moderation_event` jsonb (RESEARCH.md Open Question 1 recommends a `jsonb` column) and `attempt_turns.coco_line`.

**Result-mapping convention (line 215-222, `mapTargetPatternResult` — same "safe default when unknown" pattern):**
```typescript
function mapTargetPatternResult(...): AttemptTurnEvidence["targetPatternResult"] {
  const targetAttempted = typeof evaluation?.targetPatternAttempted === "boolean"
    ? evaluation.targetPatternAttempted
    : /* default */;
  return targetAttempted ? "Target pattern used" : "Target pattern missing";
}
```
Reuse directly for D-14's "pattern used ✓ / not yet" per-turn badge — it already exists; only the evidence-page rendering (below) needs to surface it more prominently near a header chip.

---

### `src/components/teacher/CocoLineTranscriptRow.tsx` (NEW, component, presentational)

**Analog:** `src/components/teacher/PronunciationDiagnosticPanel.tsx` (147 lines, read in full).

**Structure to mirror (whole-file shape):** typed props from an `AttemptXEvidence` type, `"use client"` if interactive (D-16's flag needs expand/collapse; D-15's Coco-line row is likely static and does not need `"use client"`), inline `React.CSSProperties` style objects at module scope (not styled-components/Tailwind — this codebase uses plain inline style objects consistently), a null/unavailable branch first:
```typescript
type PronunciationDiagnosticPanelProps = {
  pronunciationScore?: AttemptPronunciationScoreEvidence | null;
};

const UNAVAILABLE_COPY = "Pronunciation detail is not available for this attempt.";

export function PronunciationDiagnosticPanel({ pronunciationScore }: PronunciationDiagnosticPanelProps) {
  if (!pronunciationScore) {
    return (
      <div style={containerStyle}>
        <p style={unavailableStyle}>{UNAVAILABLE_COPY}</p>
      </div>
    );
  }
  // ...render rows...
}

const containerStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 12,
  background: "#FFFFFF",
  marginTop: 12,
};
```
`CocoLineTranscriptRow` should be a simple non-collapsible labeled row per D-15 ("purely additive, no new layout") — simpler than the diagnostic panel (no expand state needed), styled consistently with `containerStyle`/`labelStyle` conventions already established.

---

### `src/components/teacher/ModerationFlagPanel.tsx` (NEW, component, presentational — implements D-16)

**Analog:** `src/components/teacher/PronunciationDiagnosticPanel.tsx` — this is the direct template called out in CONTEXT.md D-16 ("Matches the Phase 9 collapsed-diagnostic-panel pattern").

**Collapse/expand pattern to copy verbatim (lines 3, 16-45):**
```typescript
"use client";
import { useState } from "react";
// ...
const [expanded, setExpanded] = useState(false);
// ...
<button
  type="button"
  onClick={() => setExpanded((current) => !current)}
  aria-expanded={expanded}
  style={toggleButtonStyle}
>
  {expanded ? "Hide pronunciation detail" : "Show pronunciation detail"}
</button>
<div aria-hidden={!expanded} style={{ ...contentStyle, display: expanded ? "block" : "none" }}>
  {/* detail content */}
</div>
```
Rename copy to something like "Show moderation detail" / "Hide moderation detail"; content renders the flag kind (`retried` / `canned_fallback` / `flagged_student_input`) and any stored detail text, same collapsed-by-default UX as the pronunciation panel.

---

### `src/app/teacher/evidence/[attemptId]/page.tsx` (route/server component — MODIFY in place)

**Analog:** itself, lines 60-190 read.

**Summary header section pattern to extend for D-17 (lines 74-106):**
```tsx
<section style={summaryStyle} aria-label="Attempt summary">
  <div>
    <p style={labelStyle}>Student</p>
    <p style={valueStyle}>{evidence.studentName}</p>
  </div>
  <div>
    <p style={labelStyle}>Mission</p>
    <p style={valueStyle}>{evidence.missionTitle}</p>
  </div>
  {/* ... */}
</section>
```
Add two more `<div>` blocks in this same grid for "Target pattern" (chip, D-14) and "Scene premise" (short line, D-17), following the identical `labelStyle`/`valueStyle` pair convention — no new layout system needed.

**Per-turn block pattern to extend for D-15/D-16 (lines 123-162, `TurnEvidenceSection`):**
```tsx
function TurnEvidenceSection({ turn }: { turn: AttemptTurnEvidence }) {
  return (
    <article style={turnCardStyle}>
      <h2 style={turnHeadingStyle}>Turn {turn.turnOrder}</h2>
      <TranscriptBlock label="Original answer" transcript={turn.originalTranscript} />
      <AnnotationGrid turn={turn} />
      <PronunciationDiagnosticList clips={turn.audioClips} />
      {turn.improvedSentence && (
        <TranscriptBlock label="Improved sentence" transcript={turn.improvedSentence} />
      )}
      <TranscriptBlock label="Repeat attempt" transcript={turn.repeatTranscript} />
      {turn.reviewReason && (
        <div style={reviewBlockStyle}>
          <p style={reviewBadgeStyle}>Teacher review</p>
          <p style={reviewReasonTextStyle}>{reviewReasonLabel(turn.reviewReason)}</p>
        </div>
      )}
      <AudioClipList label="Original answer audio" clips={originalClips} />
      <AudioClipList label="Repeat attempt audio" clips={repeatClips} />
    </article>
  );
}
```
Per D-15: insert `<CocoLineTranscriptRow line={turn.cocoLine} />` at the TOP of this block (before `TranscriptBlock label="Original answer"`), conditionally when `turn.cocoLine` is non-null. Per D-16: insert `<ModerationFlagPanel flag={turn.moderationFlag} />` near the existing `reviewBlockStyle` conditional block (same conditional-render-if-present convention as `turn.reviewReason`). Per D-14: the `AnnotationGrid` (lines 185-189) already emits `"Target pattern result"` — surface this reused, do NOT add inline transcript highlighting (explicitly rejected by D-14).

**`AnnotationGrid` rows pattern already reusable (lines 185-190):**
```tsx
function AnnotationGrid({ turn }: { turn: AttemptTurnEvidence }) {
  const rows: [string, string | null][] = [
    ["Meaning result", friendlyMeaningResult(turn.meaningResult)],
    ["Target pattern result", friendlyPatternResult(turn.targetPatternResult)],
    ...(turn.repeatResult !== null /* ... */),
  ];
  // ...
}
```
This IS the per-turn "pattern used ✓ / not yet" badge infrastructure — no new component needed, it already exists; D-14 is largely "already built," confirm during planning whether display needs restyling as a "badge" vs. current text row.

---

### `src/components/student/MissionFlowShell.tsx` + `StepCocoThinking.tsx` (MODIFY / NEW, component, event-driven)

**Analog:** itself (758-line one-step-at-a-time state machine) — not fully read this pass (large; RESEARCH.md and CONTEXT.md both point here directly as the integration seam). Planner/implementer should grep for the existing step-type union (likely a discriminated union like `type MissionStep = "answer" | "repeat" | "hint" | ...`) and add a new step variant (`"coco_thinking"` and/or a dynamic-reply-display step) following the same discriminated-union + step-component convention already used for the existing preset-turn steps. `StepCocoThinking.tsx` is a small new leaf component; follow the same file-per-step convention implied by the "Step..." naming visible in RESEARCH.md's structure diagram (`StepCocoThinking.tsx` alongside whatever existing step files pair with `MissionFlowShell.tsx`).

**Reused unmodified:** `src/components/student/CocoSpeechAudio.tsx` — dynamic Coco lines get voiced through the exact same playback component as Phase 8's preset lines; do not fork this component, just pass the dynamically-generated text/audio URL through the same prop contract already used for preset turns.

---

### `supabase/migrations/2026070Xxxxx_coco_chat_dynamic_turns.sql` (NEW, migration)

**Analog:** `supabase/migrations/202606250001_foundation_schema.sql` (foundation schema — defines `missions`, `mission_turn_templates`, `attempt_turns`, `assignments.mission_snapshot`).

**Pattern:** Purely additive `ALTER TABLE ... ADD COLUMN` statements only — no destructive changes, matching the "all v2.0 schema changes are additive, v1 core untouched" rule already established across Phases 8/9. Add:
- `missions.scene_premise text null`
- `missions.conversation_mode boolean not null default false`
- `attempt_turns.coco_line text null`
- `attempt_turns.moderation_event jsonb null` (per RESEARCH.md Open Question 1 recommendation — simplest, sufficient at this project's 6-student scale; do not build a separate table)

---

## Shared Patterns

### Server-only AI adapter with injected fake client (AI-06 boundary)
**Source:** `src/server/ai/mission-generator.ts` lines 30-66, 85-131; `src/server/ai/turn-evaluator.ts` lines 34-89
**Apply to:** `conversation-generator.ts`, `content-moderation.ts`
```typescript
export type XDeps = { apiKey?: string; model?: string; client?: XClient };
function resolveApiKey(deps?: XDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}
function createClient(apiKey: string): XClient {
  return new OpenAI({ apiKey }) as XClient;
}
```

### Three-tier typed error union
**Source:** `mission-generator.ts` line 21-24; `turn-evaluator.ts` line 21-24
**Apply to:** `conversation-generator.ts` (`missing_api_key | provider_failed | schema_failed`); `content-moderation.ts` uses a DIFFERENT fail-closed shape (`{ safe: boolean; failedOpen: boolean }`) — do not force it into the same union, per RESEARCH.md Pitfall 3.

### Ownership-scoped Supabase loaders (V4 access control)
**Source:** `src/server/student-access/mission-flow.ts` lines 64-96
**Apply to:** Any new mission-flow.ts function touching `attempt_turns`/`attempts`/`assignment_students` — always `.eq("id", x).eq("student_id"/"assignment_student_id", callerScopedId)`, never trust a client-supplied turn number.

### Idempotent upsert on `(attempt_id, turn_order)`
**Source:** `src/server/student-access/mission-flow.ts` lines 394-406 (`recordAnswer`)
**Apply to:** Persisting `coco_line` and `moderation_event` — extend the same upsert payload/onConflict clause rather than a new insert path.

### Collapsed diagnostic panel (Phase 9 precedent, explicitly named in D-16)
**Source:** `src/components/teacher/PronunciationDiagnosticPanel.tsx` (full file)
**Apply to:** `ModerationFlagPanel.tsx` — copy the `useState` expand/collapse + `aria-expanded`/`aria-hidden` + inline-style-object conventions verbatim.

### Additive evidence-shape extension + narrow-unknown-jsonb mapper
**Source:** `src/server/teacher/audio-evidence.ts` lines 87-118 (types), 148-177 (mappers), 215-222 (safe-default result mapping)
**Apply to:** Adding `cocoLine`, `moderationFlag`, `targetPattern`, `scenePremise` fields to `AttemptTurnEvidence`/`AttemptEvidence` and their mapper functions.

### No-harsh-failure tone in all fallback copy
**Source:** `src/domain/character/profile.ts` (Coco's voice reference, cited in RESEARCH.md Pitfall 5) — not re-read this pass; planner should pull exact tone guidance from this file when writing `fallback-lines.ts` copy.
**Apply to:** `src/domain/conversation/fallback-lines.ts` — every canned line must read as in-character conversational redirection, never a status/error message.

## No Analog Found

None — all 12 classified files have a strong existing analog. The two genuinely novel pieces of logic (moderation fail-closed semantics in `content-moderation.ts`, and the hard-turn-cap gate in `mission-flow.ts`) still reuse the existing adapter/loader *shapes*; only their internal failure-handling polarity and gate logic are net-new, and RESEARCH.md's Code Examples section already provides concrete illustrative code for both (see RESEARCH.md "Hard turn-cap gate" and "Moderation wrapper" code blocks) — planner should treat those RESEARCH.md snippets as the primary reference for the genuinely-new logic, and this file's excerpts as the primary reference for everything structural/conventional.

## Metadata

**Analog search scope:** `src/server/ai/`, `src/server/student-access/`, `src/server/teacher/`, `src/domain/mission/`, `src/domain/ai/`, `src/components/teacher/`, `src/components/student/`, `src/app/teacher/evidence/`, `supabase/migrations/`
**Files scanned:** mission-generator.ts, turn-evaluator.ts, mission-flow.ts, schemas.ts (domain/mission), audio-evidence.ts, PronunciationDiagnosticPanel.tsx, evidence page.tsx, foundation schema migration (line-counts checked for MissionFlowShell.tsx, CocoSpeechAudio.tsx)
**Pattern extraction date:** 2026-07-03
