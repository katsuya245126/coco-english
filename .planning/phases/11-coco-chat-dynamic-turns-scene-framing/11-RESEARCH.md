# Phase 11: Coco Chat (dynamic turns + scene framing) - Research

**Researched:** 2026-07-03
**Domain:** Server-orchestrated dynamic LLM conversation with hard turn caps, moderation gating, and teacher-reviewable transcripts, layered onto an existing preset-turn ESL homework app
**Confidence:** HIGH (architecture/stack — reuses verified existing adapters); MEDIUM (per-turn re-grounding prompt design — pattern is standard but not project-tested); LOW-MEDIUM (exact drift-prevention efficacy — requires the manual-review UAT the roadmap explicitly calls for)

## Summary

Phase 11 does not need any new AI vendor or new npm package. The project already depends on `openai@6.45.0`, which ships a typed `client.moderations.create()` resource (confirmed by reading the installed SDK's `.d.ts` directly) and the `client.responses.parse()` structured-output pattern already used in `mission-generator.ts` and `turn-evaluator.ts`. The moderation endpoint is free and does not count against usage limits, so D-11's "extra moderation call per turn is accepted" costs nothing beyond latency. The entire dynamic-conversation feature can be built as a third server-only AI adapter (`conversation-generator.ts`) that follows the exact same fake-client-injectable, try/catch-to-typed-error shape as the two existing adapters — this is a strong precedent, not a new pattern to invent.

The highest-risk part of this phase is not the API integration (that's routine) but the **prompt/architecture design that keeps Coco anchored to the target pattern over multiple turns**. The OpenAI Responses API is stateless per call unless you use `previous_response_id` chaining or Conversation objects — critically, **system instructions do NOT automatically carry over between calls in the stateless pattern**, meaning every turn must reconstruct the full steering payload (target pattern, scene premise, turns-remaining, wind-down state) from scratch. This is actually the *safe* default and matches what the two existing adapters already do (build a fresh `input` array per call) — there is no "conversation drift from stale system prompt" risk as long as the turn-generation function is called fresh each time with the current turn count and grounding data re-injected, never reusing a chat-history blob that could let steering decay.

The second major finding is a **schema conflict**: `missions.required_turns` is currently enforced 1:1 against pre-authored `mission_turn_templates` rows via a Zod `.refine()` (`requiredTurns === turns.length`) and the mission form requires one authored turn per required turn. Dynamic conversation-mode missions do not have pre-authored per-turn content (Coco's replies are generated live), so this refine and the turn-authoring UI must either be bypassed or reinterpreted for `conversation_mode = true` missions. This is flagged prominently in the Don't Hand-Roll and Common Pitfalls sections below because it is exactly the kind of assumption a plan can silently violate.

**Primary recommendation:** Build one new server-only AI adapter (`src/server/ai/conversation-generator.ts`) mirroring `mission-generator.ts`'s dependency-injection/error-shape conventions, wrap every Coco output AND every student input through `client.moderations.create()` before use (D-10/D-11), enforce the 8-turn hard cap and `required_turns` wind-down entirely in `mission-flow.ts` (never in the LLM call or client), and treat conversation-mode missions as a variant snapshot shape that skips the `turns.length === requiredTurns` refine.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scene premise generation | API/Backend (`mission-generator.ts` extension) | — | Same draft-then-edit flow as existing mission generation; teacher-editable afterward |
| Conversation-mode toggle + required_turns (3-8) | API/Backend (mission create/edit form + schema) | Browser (form UI) | Teacher-owned config, persisted server-side, validated server-side |
| Turn-cap enforcement (hard 8) | API/Backend (`mission-flow.ts`) | — | D-03: server-owned, not client, not LLM-decided — must be a hard `if (turnOrder > 8) refuse` gate before any generation call |
| Dynamic Coco reply generation | API/Backend (new `conversation-generator.ts` adapter) | — | Mirrors AI-06 boundary: `mission-flow.ts` orchestrates, never imports the AI client itself |
| Per-turn re-grounding / on-pattern steering | API/Backend (prompt construction inside the adapter) | — | Must be rebuilt fresh every call, not carried via chat history state |
| Moderation of Coco output + student input | API/Backend (moderation wrapper around both directions) | — | CHAT-05/D-10/D-11: gate before storage/TTS/display, before the LLM even sees flagged student input |
| Canned fallback line library | API/Backend (static data, no AI call) | — | D-10/D-13 shared degrade path; must not itself require an LLM call to select |
| TTS of dynamic Coco lines | API/Backend (Phase 8 `tts-generator.ts` + `tts-cache.ts`, reused) | Browser (`CocoSpeechAudio.tsx` playback) | Same adapter, same cache table; only the cache-hit rate differs (near-zero for unique lines) |
| Scene premise + "thinking" indicator display | Browser/Client (`MissionFlowShell.tsx` step variant) | — | UI-only; no new AI call from the client |
| Coco-line row / pattern badge / moderation flag on evidence page | API/Backend (data assembly in `audio-evidence.ts`) | Browser (evidence page render) | Server assembles the additive fields; page is presentation-only, matching existing pattern |
| Turn/conversation persistence | Database (`attempt_turns.coco_line`, `missions.scene_premise`, `missions.conversation_mode`) | — | Additive columns only, per milestone rule |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | 6.45.0 (already installed, verified via `npm ls openai`) | Structured chat generation (`responses.parse`) + moderation (`moderations.create`) | Already the project's sole AI vendor for mission-generator and turn-evaluator; no new vendor needed for CHAT-01–06 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | already installed (project-wide) | Validate conversation-turn generator output the same way `zodTextFormat` validates mission drafts | Same structured-output pattern as `generatedMissionDraftSchema` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenAI `moderations.create` (`omni-moderation-latest`) | A third-party moderation vendor (Azure Content Safety, Perspective API) | Would add a second vendor/API key/FERPA review for no benefit — OpenAI moderation is free, already in the installed SDK, and the project already has an OpenAI data-use posture from Phase 6/8. `[ASSUMED]` that no separate FERPA note is needed since text-only moderation of already-processed content doesn't introduce new student PII handling beyond what mission-generator/turn-evaluator already do — **flag this assumption for discuss-phase/planner confirmation**, it was not explicitly re-verified this session the way Phase 9's Azure data-use note was. |
| Rebuilding full prompt/context per turn (stateless) | OpenAI Conversation objects / `previous_response_id` chaining | Stateless per-call reconstruction is safer for the CHAT-04 "architectural guardrail, not prompt hope" requirement — it's impossible for grounding instructions to silently drop out of context, and it matches the two existing adapters' pattern exactly. Chaining would save token cost on scene premise/target pattern repetition but reintroduces the exact drift risk the phase is designed to prevent. |

**Installation:**
```bash
# No installation needed — openai@6.45.0 is already a dependency with
# both responses.parse and moderations.create available.
```

**Version verification:** `npm ls openai` confirms `openai@6.45.0` is installed. `npm view openai versions` confirms 6.45.0 is the latest published version as of this research session `[VERIFIED: npm registry]`. The `moderations.create` typed resource was confirmed present by reading `node_modules/openai/resources/moderations.d.ts` directly `[VERIFIED: local installed SDK type declarations]` — this is stronger evidence than a docs page because it reflects the exact version pinned in this repo's `package.json`.

## Package Legitimacy Audit

No new external packages are required for this phase. `openai` is already installed and was audited/approved in Phase 6 (mission-generator) and Phase 8 (TTS). No new audit needed.

**Packages removed due to [SLOP] verdict:** none — no new packages proposed
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ STUDENT BROWSER (MissionFlowShell.tsx)                              │
│                                                                       │
│  Scene premise text (D-09)                                          │
│         │                                                            │
│         ▼                                                            │
│  [Coco line: preset OR dynamic] ──(TTS replay, Phase 8 reused)──►    │
│         │                                                            │
│         ▼                                                            │
│  Student records answer ──► upload/transcribe (existing Phase 5)    │
│         │                                                            │
│         ▼                                                            │
│  "Coco is thinking…" indicator (D-12) while server round-trips      │
└─────────────────────────┬─────────────────────────────────────────┬─┘
                          │ turn submit                            │ poll/await
                          ▼                                         │
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: mission-flow.ts  (AI-06 boundary — imports NO AI client)     │
│                                                                       │
│  1. Load attempt + assignment_students + mission_snapshot            │
│  2. Existing v1 correction loop: evaluateOriginalTurn (turn-evaluator)│
│     → needs_correction? → show improved sentence → require repeat    │
│  3. IF conversation_mode:                                            │
│     a. HARD CAP CHECK: turnOrder > 8 ? refuse, do not generate (D-03)│
│     b. Moderate student transcript FIRST (D-11)                      │
│        flagged? → canned redirect line, NO LLM call, turn logged     │
│     c. NOT flagged → call conversation-generator (new AI adapter)    │
│        with: scene_premise, target_pattern, turn_order,              │
│        required_turns, hard_cap=8, wind-down flag if approaching cap │
│     d. Moderate Coco's generated line (D-10)                         │
│        failed? → regenerate once w/ stronger safety steering         │
│        failed again? → canned fallback line (shared path w/ D-13)    │
│     e. Persist attempt_turns.coco_line (+ moderation flag metadata)  │
│     f. Kick off TTS generation for the line (Phase 8 adapter reused) │
│  4. Return next step payload to client                               │
└─────────────────────────┬─────────────────────────────────────────┬─┘
                          │                                          │
                          ▼                                          ▼
┌───────────────────────────────────┐   ┌────────────────────────────┐
│ src/server/ai/                    │   │ src/server/audio/          │
│  conversation-generator.ts (NEW)  │   │  tts-generator.ts (Phase 8,│
│  - responses.parse, fresh system  │   │  reused unmodified)        │
│    + user message EVERY call      │   │  tts-cache.ts (rarely hits │
│  - injectable fake client (test)  │   │  for unique dynamic lines) │
│                                    │   └────────────────────────────┘
│  moderations.create wrapper       │
│  - wraps BOTH student input (pre) │
│    and Coco output (post)         │
│  - injectable fake client (test)  │
└───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DATABASE (additive columns only)                                     │
│  missions.scene_premise, missions.conversation_mode                  │
│  attempt_turns.coco_line (+ moderation-flag metadata column/table)   │
│  assignments.mission_snapshot (premise + conversation_mode captured  │
│    at assign time — reproducible attempts, D-17 evidence header)     │
└─────────────────────────┬─────────────────────────────────────────┬─┘
                          │                                          │
                          ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TEACHER: evidence/[attemptId]/page.tsx (additive rows only)          │
│  Header: pattern chip + scene premise line (D-17)                    │
│  Per-turn block: Coco-line row (D-15) + pattern-used badge (D-14)    │
│    + collapsed moderation-flag panel (D-16, Phase 9 pattern reused)  │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── server/
│   ├── ai/
│   │   ├── mission-generator.ts       # existing — extend for scene premise (D-07)
│   │   ├── turn-evaluator.ts          # existing — unchanged, still evaluates every turn (D-01)
│   │   ├── conversation-generator.ts  # NEW — dynamic Coco reply generation
│   │   └── content-moderation.ts      # NEW — shared moderation wrapper (used pre-student-input and post-Coco-output)
│   ├── student-access/
│   │   └── mission-flow.ts            # extend: turn-cap gate, conversation orchestration, canned-fallback selection
│   └── teacher/
│       └── audio-evidence.ts          # extend: coco_line, moderation flags, pattern-used badge, premise in evidence shape
├── domain/
│   ├── ai/
│   │   └── conversation-generation.ts # NEW — zod schemas for Coco reply generation input/output
│   ├── conversation/
│   │   └── fallback-lines.ts          # NEW — canned fallback/redirect line library (no AI call, D-10/D-11/D-13)
│   └── mission/
│       └── schemas.ts                 # extend: conversation_mode-aware snapshot shape, relax turns.length refine for chat mode
├── components/
│   ├── student/
│   │   ├── MissionFlowShell.tsx       # extend: scene premise display, "thinking" state, dynamic-turn step variant
│   │   └── StepCocoThinking.tsx       # NEW (small) — thinking indicator, later hostable by Phase 10 mascot idle state
│   └── teacher/
│       ├── MissionForm.tsx            # extend: conversation_mode toggle, required_turns 3-8, scene premise field + generate action
│       └── CocoLineTranscriptRow.tsx  # NEW — labeled Coco-line row on evidence page (D-15)
└── ...
supabase/migrations/
└── 2026070Xxxxx_coco_chat_dynamic_turns.sql  # NEW additive migration
```

### Pattern 1: Server-Only AI Adapter with Injected Fake Client
**What:** Every AI-calling module exports a `Deps` type with an optional `client` field; production code constructs a real `OpenAI` client, tests inject a fake one implementing only the narrow method signature used.
**When to use:** For `conversation-generator.ts` and the new `content-moderation.ts` wrapper — this is the established, non-negotiable project pattern (AI-06 structural boundary, verified in `mission-generator.ts` and `turn-evaluator.ts`).
**Example:**
```typescript
// Source: existing src/server/ai/mission-generator.ts (verified in this codebase)
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
Apply the identical shape to a `ConversationResponsesClient` type in the new adapter, and a `ModerationClient` type (`{ moderations: { create(input): Promise<{ results: Moderation[] }> } }`) for the moderation wrapper.

### Pattern 2: Stateless Per-Turn Reconstruction (CHAT-04 guardrail)
**What:** Never rely on `previous_response_id` chaining or a persisted chat-history blob to carry steering instructions. Every call to `conversation-generator.ts` rebuilds the full system+user payload from the mission snapshot (target pattern, scene premise) plus the current turn's live state (turn order, turns remaining, wind-down flag) plus only the minimal prior-turn context needed for a natural reply (e.g., the student's last transcript and Coco's last line, passed explicitly as data — not as "conversation history the model manages").
**When to use:** Every single dynamic-turn generation call, no exceptions.
**Example:**
```typescript
// Illustrative shape, modeled directly on buildOriginalPrompt() in turn-evaluator.ts
function buildConversationPrompt(input: GenerateCocoReplyInput) {
  return {
    scenePremise: input.scenePremise,
    targetPattern: input.targetPattern,
    turnOrder: input.turnOrder,
    requiredTurns: input.requiredTurns,
    hardCap: 8,
    turnsRemaining: 8 - input.turnOrder,
    windDown: input.turnOrder >= 6, // e.g. nudge starts 2 turns before cap — Claude's discretion per D-05
    lastStudentTranscript: input.studentTranscript,
    lastCocoLine: input.previousCocoLine ?? null,
    instructions: [
      "Stay anchored to the target grammar pattern every turn; do not drift into open-ended topics.",
      "Respond naturally to what the student said, but steer the reply back toward practicing the target pattern.",
      "If turnsRemaining <= 2, begin gently wrapping up the scene toward a natural close.",
      "If turnOrder === hardCap, deliver a closing line — this is the last turn.",
      "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
    ],
  };
}
```

### Pattern 3: Dual-Direction Moderation Gate
**What:** Moderate student input BEFORE sending to the LLM (D-11 — no LLM call on flagged input) and moderate Coco's generated output BEFORE storage/display/TTS (D-10/CHAT-05). Both directions share the same `content-moderation.ts` wrapper, called with different inputs.
**When to use:** Every dynamic turn, in both directions, no sampling/skipping.
**Example:**
```typescript
// Source: OpenAI SDK 6.45.0 typed resource, verified via node_modules/openai/resources/moderations.d.ts
const result = await client.moderations.create({
  input: text,
  model: "omni-moderation-latest", // free; no usage-limit impact [CITED: OpenAI moderation guide]
});
const flagged = result.results[0]?.flagged ?? true; // fail-closed on malformed response
```

### Pattern 4: Additive Snapshot Extension for Reproducible Attempts
**What:** `assignments.mission_snapshot` already captures mission content at assign time so attempts stay reproducible even if the teacher later edits the mission. `scene_premise` and `conversation_mode` must be added to `missionSnapshotSchema` (and the assign-time snapshot builder) the same way, so a started attempt's evidence page (D-17) always reflects what the student actually saw — not the mission's current state.
**When to use:** Any time mission-level config needs to be read later from an attempt/evidence context.
**Example:**
```typescript
// Extend src/domain/mission/schemas.ts missionSnapshotSchema (existing shape shown above)
export const missionSnapshotSchema = z.object({
  // ...existing fields...
  scenePremise: z.string().trim().nullable().default(null),
  conversationMode: z.boolean().default(false),
  // turns.length === requiredTurns refine must NOT apply when conversationMode is true —
  // dynamic-mode missions have zero or few pre-authored turns; Coco generates them live.
});
```

### Anti-Patterns to Avoid
- **Trusting the LLM to self-limit turns:** CHAT-03 explicitly requires a *server-enforced* hard cap. Never phrase "stop after N turns" as an instruction and treat compliance as sufficient — the server must literally refuse to call the generator (or must ignore/override the response) once `turnOrder > 8`, independent of what the model does.
- **Persisting conversation history as an opaque provider-managed blob:** Using OpenAI's stateful Conversation objects or `previous_response_id` would make it harder to audit/replay exactly what was sent on each turn and reintroduces exactly the "prompt hope" risk CHAT-04 is designed to avoid. Keep every call's exact input reconstructable and loggable from your own DB rows.
- **Skipping moderation on retries:** When D-10's retry-once-then-fallback path runs, the regenerated line must be moderated again before use — do not assume a "safety-steered" regeneration is automatically clean.
- **Reusing `mission_turn_templates` unmodified for conversation-mode missions:** The existing `mission_turn_templates` table assumes one fixed prompt/target_example/hint_ladder per turn_order, generated ahead of time. Dynamic mode breaks this 1:1 assumption — plan for either a nullable/optional template relationship on `attempt_turns` for chat-mode missions, or a distinct code path that never expects a `mission_turn_template_id` to exist for turns generated dynamically.
- **Voicing the scene premise:** D-09 is explicit — the premise is unvoiced text, no new TTS call and no new spoken intro step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting unsafe/harmful text | A custom keyword/regex profanity filter | `client.moderations.create()` (`omni-moderation-latest`) | Free, already available in the installed SDK, far more robust than keyword matching, covers categories (harassment, sexual, self-harm, violence, etc.) a hand-rolled filter would miss or over/under-trigger on |
| Structured LLM output validation | Manual JSON.parse + shape checking | `zodTextFormat` + `responses.parse` (already used in `mission-generator.ts`/`turn-evaluator.ts`) | Guarantees schema-conformant output at the API level; consistent with existing adapters |
| Turn-cap / conversation-state tracking | A new "conversation session" abstraction or in-memory state | `attempt_turns` rows keyed by `(attempt_id, turn_order)` — count existing rows server-side before generating turn N+1 | The existing table already tracks turn order per attempt; no new state store needed, and it's already audited/persisted |
| "Is Coco talking" / audio-driven expression cues | A custom lip-sync or timing system for the "thinking" indicator | Simple boolean/loading state hostable by Phase 10's mascot idle state later (per D-12) | Phase 10 will define the amplitude-driven speaking state; Phase 11 only needs a static "thinking" flag, not new audio-analysis code |

**Key insight:** Nearly everything CHAT-01–06 needs is either (a) already implemented as a reusable pattern in this codebase (adapters, snapshot, evidence assembly, collapsed diagnostic panels) or (b) a free, already-installed SDK feature (moderation). The actual net-new engineering surface is small: one new adapter, one new moderation wrapper, a handful of additive columns, and UI variants — not new infrastructure.

## Common Pitfalls

### Pitfall 1: `missionSnapshotSchema`'s `turns.length === requiredTurns` refine silently rejects conversation-mode snapshots
**What goes wrong:** The existing Zod refine on both `missionFormSchema` and `missionSnapshotSchema` requires the number of authored turns to exactly equal `requiredTurns`. Conversation-mode missions may have zero or a small number of authored "opening" turns while the rest are generated live — assign-time snapshot creation would fail validation.
**Why it happens:** The refine was written for preset-only missions and never anticipated a mode where turn content isn't pre-authored.
**How to avoid:** Make the refine conditional on `conversationMode` (skip or relax it when true), or define a distinct snapshot shape for chat-mode missions from the start. Decide this explicitly in planning — do not let a plan step silently "just turn off validation" without noting the schema-level reason.
**Warning signs:** Assign-mission RPC or snapshot-build server action throwing schema validation errors specifically for chat-mode missions during manual testing.

### Pitfall 2: Treating `previous_response_id` chaining as "handles grounding automatically"
**What goes wrong:** If a future implementer reaches for OpenAI's stateful conversation chaining to "simplify" multi-turn context, they will find that `instructions`/system-level steering does NOT automatically persist across chained calls in the stateless-with-chaining pattern — meaning target-pattern grounding and turn-cap awareness must still be explicitly re-passed every call regardless of which conversation-state approach is used.
**Why it happens:** It's an easy mental model to assume "the API manages conversation state, so it manages my system prompt too."
**How to avoid:** Always explicitly reconstruct and pass the full grounding payload (target pattern, scene premise, turn count, wind-down flag) on every single call, independent of whatever state/history mechanism is used underneath.
**Warning signs:** Manual review transcripts show Coco correctly on-pattern for the first 2-3 turns, then drifting — a classic sign steering was only present in the first system message and not re-injected.

### Pitfall 3: Moderation false-negative on malformed/empty API response treated as "safe"
**What goes wrong:** If the moderation call throws, times out, or returns an unexpected shape, a naive `result?.flagged ?? false` fails OPEN (treats unknown as safe) — exactly backwards for a child-safety gate.
**Why it happens:** Most error-handling defaults optimistically assume the happy path; existing adapters in this codebase return `provider_failed` errors precisely to avoid this, but a moderation wrapper needs the opposite default (fail closed → route to canned fallback) rather than the existing adapters' pattern of surfacing a typed error upward.
**How to avoid:** Any moderation call that errors, times out, or returns malformed data must be treated as "flagged" (fail closed), triggering the same canned-fallback path as an actual moderation failure (D-10/D-13 unify these already — lean into that).
**Warning signs:** Code review shows `?? false` or truthy-coercion on a moderation result instead of an explicit fail-closed default.

### Pitfall 4: Turn-cap off-by-one between `required_turns`, wind-down, and the hard cap of 8
**What goes wrong:** Three distinct numbers exist per mission (teacher's `required_turns` 3-8, the wind-down-nudge trigger point, and the fixed server ceiling of 8) — conflating any two of them creates either a premature cutoff (student capped at their own `required_turns` instead of being allowed to keep chatting per D-04) or an cap that never fires (comparing against `required_turns` instead of the fixed 8).
**Why it happens:** `required_turns` already exists as a concept from the preset-turn flow (it drives completion/credit) and it's tempting to reuse the same variable for the hard cap.
**How to avoid:** Keep `HARD_TURN_CAP = 8` as a literal server-side constant, entirely separate from `mission.required_turns`. Completion credit fires at `required_turns`; the conversation only forcibly ends at the constant 8. Wind-down steering triggers on proximity to 8, not proximity to `required_turns`.
**Warning signs:** A test mission set to `required_turns = 3` either can't extend past 3 turns (violates D-04) or a mission set to `required_turns = 8` never gets a wind-down nudge because the check compared against `required_turns` and they happened to be equal.

### Pitfall 5: Fallback lines that read as errors despite good intentions
**What goes wrong:** Canned fallback copy that's too generic ("Something went wrong, let's continue") reads as a system error to the student, violating the no-harsh-failure principle even though functionally nothing failed from their perspective.
**Why it happens:** Engineers write fallback copy defensively/technically rather than in-character.
**How to avoid:** Every fallback/redirect line must be written in Coco's established voice (see `src/domain/character/profile.ts` for the existing tone reference) and phrased as a natural conversational move ("That's interesting! Tell me more about..." per the CONTEXT.md specifics), never as a status message.
**Warning signs:** UAT reviewer (human) reading a transcript can tell exactly which turns hit the fallback path without needing the collapsed diagnostic flag.

## Code Examples

### Structured conversation-turn generation (mirrors existing adapter exactly)
```typescript
// Source: pattern verified against existing src/server/ai/mission-generator.ts in this repo
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { generatedCocoReplySchema } from "@/domain/ai/conversation-generation";

export type GenerateCocoReplyResult =
  | { ok: true; reply: { line: string } }
  | { ok: false; error: "missing_api_key" | "provider_failed" | "schema_failed" };

export async function generateCocoReply(
  input: GenerateCocoReplyInput,
  deps?: ConversationGeneratorDeps,
): Promise<GenerateCocoReplyResult> {
  // ...same apiKey/model resolution as mission-generator.ts...
  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        { role: "system", content: "Generate Coco's next line in a bounded ESL practice conversation. Return only data matching the schema." },
        { role: "user", content: JSON.stringify(buildConversationPrompt(input)) },
      ],
      text: { format: zodTextFormat(generatedCocoReplySchema, "coco_reply") },
    });
    const parsed = generatedCocoReplySchema.safeParse(response.output_parsed);
    if (!parsed.success) return { ok: false, error: "schema_failed" };
    return { ok: true, reply: parsed.data };
  } catch {
    return { ok: false, error: "provider_failed" };
  }
}
```

### Moderation wrapper (both directions)
```typescript
// Source: OpenAI SDK 6.45.0 typed shape, verified via node_modules/openai/resources/moderations.d.ts
export type ModerationClient = {
  moderations: {
    create(input: { input: string; model?: string }): Promise<{
      results: Array<{ flagged: boolean }>;
    }>;
  };
};

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
      // Malformed response — fail closed (Pitfall 3), not fail open.
      return { safe: false, failedOpen: true };
    }
    return { safe: !flagged, failedOpen: false };
  } catch {
    // Provider error — fail closed.
    return { safe: false, failedOpen: true };
  }
}
```

### Hard turn-cap gate (server-owned, D-03)
```typescript
// Illustrative — belongs in mission-flow.ts alongside existing turn-recording functions
const HARD_TURN_CAP = 8; // literal constant, independent of missions.required_turns

export function canGenerateNextDynamicTurn(turnOrder: number): boolean {
  return turnOrder <= HARD_TURN_CAP;
}
// Called BEFORE any AI adapter invocation. If false, the server delivers
// Coco's closing line (a canned or previously-generated closer) and ends
// the conversation — the client never gets to request turn 9 successfully
// regardless of what UI state it's in.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Preset-only turn templates (`mission_turn_templates`, one row per `turn_order`) | Hybrid: preset missions keep templates; conversation-mode missions generate turns live via LLM, grounded per-turn | Phase 11 (this phase) | New code path in `mission-flow.ts`; existing preset path is untouched (additive, not a replacement) |
| No content moderation anywhere in the codebase | Every dynamically-generated Coco line + every student input in conversation mode is moderated via `omni-moderation-latest` before use | Phase 11 (this phase) | New `content-moderation.ts` adapter; first moderation integration in the project |

**Deprecated/outdated:** Nothing in the existing stack is deprecated by this phase — it's purely additive on top of the v1 core and Phase 6/8/9 AI adapters.

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new columns, new adapter, new UI), not a rename/refactor/migration phase. No existing runtime state (stored data, live service config, OS-registered state, secrets, build artifacts) is being renamed or relocated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No new/separate FERPA/COPPA data-use note is required for sending student transcripts through OpenAI's moderation endpoint (beyond the existing OpenAI usage posture from Phase 6/8) | Standard Stack — Alternatives Considered | If wrong, a compliance gap opens before any student input is sent through Coco Chat; the planner should add a checkpoint to confirm with the same rigor as Phase 9's Azure data-use note (09-01) rather than assume text moderation is "already covered." |
| A2 | Wind-down steering should begin 2 turns before the hard cap (i.e., at turn 6 of 8) | Code Examples / Pattern 2 | This exact number is explicitly Claude's discretion per D-05 in CONTEXT.md — if the planner locks a different trigger point, no functional risk, just needs to be a deliberate choice recorded in the plan, not left implicit. |
| A3 | `omni-moderation-latest` (vs. a pinned `omni-moderation-2024-09-26` or the older `text-moderation-*` family) is the right model choice for this phase | Code Examples — Moderation wrapper | Low risk: `omni-moderation-latest` is OpenAI's current recommended default and is free regardless of which moderation model is chosen; if OpenAI changes the "latest" alias behavior, pinning to a dated version would be a one-line fix. |
| A4 | The moderation endpoint's category set (harassment, hate, self-harm, sexual, violence, illicit) is sufficient for "classroom-safe for elementary ESL students" without needing an additional custom classifier layer | Don't Hand-Roll | If wrong (e.g., moderation misses age-inappropriate-but-not-flagged content like scary themes), the manual-review UAT the roadmap explicitly requires should surface this — treat the UAT transcript review as the real safety gate, not this assumption alone. |

## Open Questions

1. **Where does moderation-flag metadata live — a new column on `attempt_turns`, or a new small table?** *(RESOLVED — adopted in plan 11-01: a single additive `attempt_turns.moderation_event jsonb null` column, not a new table.)*
   - What we know: CONTEXT.md's "Claude's Discretion" section explicitly defers this ("where flagged-turn metadata is stored — all schema changes must be additive"). D-16 needs enough data to render a collapsed flag explaining "what happened" (retried line / canned fallback / flagged student input).
   - What's unclear: Whether a single `jsonb` column (`attempt_turns.moderation_flag`) is sufficient, or whether a dedicated table (mirroring the `pronunciation_scores` precedent from Phase 9) is cleaner for future querying/reporting.
   - Recommendation: A `jsonb` column on `attempt_turns` (e.g., `attempt_turns.moderation_event jsonb null`) is simplest and sufficient at this project's scale (6 students); a dedicated table would mirror Phase 9 but adds a join for no clear benefit at this volume. Planner should decide and record explicitly rather than defer further.

2. **Exact wind-down turn-count trigger and closing-line mechanics.** *(RESOLVED — adopted in plan 11-03: `windDown = nextTurnOrder >= 6`, triggered purely relative to the fixed hard cap of 8, independent of `required_turns`.)*
   - What we know: D-05 requires wind-down steering "as the turn count approaches the cap" and a delivered closing line at the cap. The precise trigger turn is explicitly Claude's discretion.
   - What's unclear: Whether wind-down should scale with `required_turns` (e.g., "2 turns before whichever is sooner: required_turns extension point or hard cap") or always trigger relative to the fixed 8.
   - Recommendation: Trigger wind-down steering purely relative to the fixed hard cap (e.g., turn 6+ of 8), independent of the teacher's `required_turns` setting — this keeps the two numbers (completion credit vs. hard ceiling) cleanly separate per Pitfall 4 above.

3. **Does the AI-06 "mission-flow.ts imports no AI client" boundary need a thin orchestration seam, or can mission-flow.ts call the new adapters directly?** *(RESOLVED — adopted in plan 11-03: conversation-generation + moderation are orchestrated in `audio-upload.ts` (the same layer that already calls `turn-evaluator`); `mission-flow.ts` gains only the cap gate + `recordCocoLine` persistence and imports no AI client.)*
   - What we know: The existing structural rule is enforced by a source-contract check (per STATE.md 06-01) that keeps OpenAI out of `mission-flow.ts` directly — but `mission-flow.ts` already doesn't import `turn-evaluator.ts` or `mission-generator.ts` itself either; those are called from the Next.js server actions / route layer, not from `mission-flow.ts`.
   - What's unclear: Whether the new `conversation-generator.ts`/`content-moderation.ts` calls should be orchestrated from the same action/route layer that currently calls `turn-evaluator.ts` for original/repeat evaluation, keeping `mission-flow.ts` purely as the turn-recording/persistence service it already is.
   - Recommendation: Follow the existing layering exactly — confirm during planning where `evaluateOriginalTurn`/`evaluateRepeatTurn` are currently invoked (likely a server action, not `mission-flow.ts` itself) and place the new conversation-generation + moderation calls at that same layer, with `mission-flow.ts` continuing to only own turn-cap counting and persistence.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `OPENAI_API_KEY` env var | Conversation generation + moderation calls | Presumed present (already required for mission-generator/turn-evaluator/TTS) | — | If missing, adapters return `missing_api_key` per existing convention; conversation mode should degrade to a clear teacher-facing block on enabling the toggle, not a silent student-facing failure |
| `openai` npm package | All AI calls including moderation | Yes | 6.45.0 (installed) | N/A |
| Supabase (local/remote) | New additive migration for `missions.scene_premise`, `missions.conversation_mode`, `attempt_turns.coco_line` (+ moderation metadata) | Yes (existing project infra, migrations directory has 9 prior migrations applied) | — | N/A |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** `OPENAI_API_KEY` absence has an existing convention (typed `missing_api_key` error) to reuse.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (inferred from existing `*.test.ts` files referenced in STATE.md, e.g. `tts-cache.test.ts`, `assignment-list.test.ts`, `logger.test.ts`) |
| Config file | Not inspected this session — confirm exact config path during planning; existing test suite is described as "33/33 files green" as of Phase 7 gate |
| Quick run command | `npm test` or `npx vitest run <path>` (confirm exact script name in `package.json` during planning) |
| Full suite command | `npm test` (full suite) — confirm before phase gate |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCENE-01 | Scene premise generated + stored on mission, editable, shown at mission start | unit + integration | `npx vitest run src/server/ai/mission-generator.test.ts` (extend) + snapshot schema test | ❌ Wave 0 — new premise-generation test cases needed |
| CHAT-01 | Conversation mode toggle drives dynamic-turn generation instead of preset turns | integration | new `src/server/ai/conversation-generator.test.ts` with fake client | ❌ Wave 0 |
| CHAT-02 | Coco shares first, consistent friendly personality across turns | unit (prompt construction) + manual transcript review | new adapter test + manual UAT | ❌ Wave 0 (automated) / manual review required regardless |
| CHAT-03 | Hard 8-turn cap server-enforced, wind-down nudge | unit | new `mission-flow.test.ts` case: assert generation refused at turnOrder 9 regardless of fake-client response | ❌ Wave 0 |
| CHAT-04 | Stays on target pattern via architectural guardrails | manual review (cannot be fully automated — this is the phase's explicit research-flagged risk) | Manual transcript review deliverable (roadmap-mandated) | N/A — human_needed by design |
| CHAT-05 | Every Coco output moderated before shown/spoken | unit | new `content-moderation.test.ts`: fake client flagged/unflagged/error-path cases, assert fail-closed | ❌ Wave 0 |
| CHAT-06 | `attempt_turns.coco_line` persisted, transcript teacher-reviewable | integration | extend `audio-evidence.test.ts` (or equivalent) to assert coco_line surfaces in evidence shape | ❌ Wave 0 (confirm existing test file name during planning) |

### Sampling Rate
- **Per task commit:** targeted `vitest run <file>` for the adapter/module just touched
- **Per wave merge:** full `npm test` run
- **Phase gate:** Full suite green before `/gsd-verify-work`, PLUS the roadmap-mandated manual-review UAT deliverable confirming CHAT-04 (on-pattern-ness) and CHAT-05 (moderation) hold in practice across a sample of real generated transcripts — this manual step cannot be waived by automated test coverage per the phase's explicit research flag.

### Wave 0 Gaps
- [ ] `src/server/ai/conversation-generator.test.ts` — new adapter, fake-client injection, schema_failed/provider_failed/missing_api_key branches (mirrors `mission-generator.test.ts` if it exists, or `turn-evaluator` test conventions)
- [ ] `src/server/ai/content-moderation.test.ts` — flagged/unflagged/malformed-response/provider-error branches, asserting fail-closed default
- [ ] `src/server/student-access/mission-flow.test.ts` extension — turn-cap refusal at turnOrder > 8, independent of any mocked LLM response
- [ ] Confirm exact existing test file names/locations for `mission-generator`, `turn-evaluator`, and `audio-evidence` during planning (not verified by filename in this research pass — grep for `*.test.ts` alongside each source file before writing new plans)
- [ ] Manual-review UAT script/rubric for CHAT-04 drift-checking and CHAT-05 moderation-holds-in-practice — this is a deliverable the roadmap explicitly calls for, not an automated test; the plan must include an explicit task producing this artifact (e.g., a set of test transcripts + a written pass/fail rubric a human applies)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged — student/teacher auth already established in prior phases |
| V3 Session Management | No | Unchanged |
| V4 Access Control | Yes | Existing ownership-scoped queries (`loadOwnedAssignmentStudent`, `loadOwnedAttempt` in `mission-flow.ts`) must continue to gate every new dynamic-turn read/write exactly as they gate existing turn recording — no new access-control surface, but new code paths must not bypass it |
| V5 Input Validation | Yes | Zod schemas for conversation-generator input/output (mirrors `generatedMissionDraftSchema`); student transcript passed to moderation and the LLM must be the same validated/trimmed string already produced by the existing transcription pipeline |
| V6 Cryptography | No | No new secrets beyond the existing `OPENAI_API_KEY` (already server-only, never client-exposed) |
| V13/V14 (child-safety adjacent — output handling) | Yes | This is the phase's core concern: CHAT-05 requires moderation-before-display/speech for every generated line; treat this as equivalent in rigor to an output-encoding/injection-prevention control — a generated line is effectively untrusted output until moderated |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via student transcript (student tries to make Coco say something unsafe or off-pattern via crafted speech-to-text input) | Tampering / Elevation of Privilege (of the LLM's behavior) | Moderate student input before it reaches the LLM (D-11); treat the transcript purely as data in the user-message JSON payload (never string-concatenated into the system/instructions text) — mirrors the existing adapters' `JSON.stringify(buildPrompt(...))` pattern, which already avoids raw string interpolation into instructions |
| Generated content drifting into unsafe/off-topic territory despite steering | Tampering (of intended behavior) | Moderation gate (CHAT-05) + per-turn re-grounding (CHAT-04) + hard turn cap bounding total exposure (CHAT-03) — defense in depth, not any single control alone |
| Server accepting a turn-cap bypass via replayed/forged client requests | Tampering | Turn count must be derived server-side from the actual count of `attempt_turns` rows for the attempt (or an equivalent server-tracked counter), never trusted from a client-supplied turn number — mirrors the existing `nextUnfinishedTurnOrder`/upsert-on-`(attempt_id, turn_order)` pattern already used for preset turns |
| Excess student PII sent to moderation/generation calls | Information Disclosure | Continue the existing instruction pattern ("No student names, PINs, audio keys, or private class data" — verbatim from `mission-generator.ts`/`turn-evaluator.ts`) in the new adapter's prompts; the transcript itself is the only per-student content sent, same as the existing evaluation adapters already do |

## Sources

### Primary (HIGH confidence)
- `node_modules/openai/resources/moderations.d.ts` (installed SDK, version 6.45.0 pinned in this repo) — exact `Moderations.create`, `ModerationCreateParams`, `ModerationCreateResponse`, `Moderation` category shapes
- Existing codebase files read directly: `src/server/ai/mission-generator.ts`, `src/server/ai/turn-evaluator.ts`, `src/server/student-access/mission-flow.ts`, `src/domain/mission/schemas.ts`, `src/domain/character/profile.ts`, `src/server/teacher/audio-evidence.ts`, `src/components/teacher/PronunciationDiagnosticPanel.tsx`, `src/server/audio/tts-generator.ts`, `supabase/migrations/202606250001_foundation_schema.sql`
- `.planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-CONTEXT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (project-internal source of truth)

### Secondary (MEDIUM confidence)
- [Is the Moderation endpoint free to use? | OpenAI Help Center](https://help.openai.com/en/articles/4936833-is-the-moderation-endpoint-free-to-use) — confirms moderation endpoint is free and doesn't count against usage limits
- [Conversation state | OpenAI API](https://developers.openai.com/api/docs/guides/conversation-state) — confirms stateless vs. stateful Responses API patterns and that system instructions don't auto-carry in stateless mode
- [omni-moderation Model | OpenAI API](https://platform.openai.com/docs/models/omni-moderation-latest) — model capability reference

### Tertiary (LOW confidence)
- General web search results on LLM conversation-drift-prevention techniques (Medium articles, arXiv papers on "Retcon" prompting, multi-agent critique loops) — informative for general awareness but not adopted as a specific technique; the project's existing stateless-per-call adapter pattern already satisfies the underlying principle without needing an exotic technique name.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new vendor/package; `openai` SDK capability confirmed by reading installed type declarations directly
- Architecture: HIGH for reuse of existing adapter/evidence/snapshot patterns; MEDIUM for the specific per-turn re-grounding prompt content (sound principle, untested prompt wording)
- Pitfalls: HIGH for the schema-refine conflict (directly observed in `schemas.ts`) and turn-cap/moderation fail-closed concerns (derived from direct code reading + standard security reasoning); MEDIUM for exact drift behavior in practice (requires the roadmap's mandated manual-review UAT to confirm)

**Research date:** 2026-07-03
**Valid until:** 30 days (stable — no fast-moving dependency; OpenAI SDK/moderation API is a mature, slow-changing surface, and the project's own architectural patterns are the primary reference)
