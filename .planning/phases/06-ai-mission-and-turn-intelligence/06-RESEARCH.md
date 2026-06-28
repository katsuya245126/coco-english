# Phase 06: ai-mission-and-turn-intelligence - Research

**Researched:** 2026-06-27 [VERIFIED: gsd init.phase-op]
**Domain:** OpenAI structured mission generation and turn evaluation inside a Next.js/Supabase student homework workflow [VERIFIED: .planning/ROADMAP.md + codebase grep]
**Confidence:** HIGH for codebase integration patterns, MEDIUM for exact AI model/threshold choices [VERIFIED: codebase grep; CITED: https://developers.openai.com/api/docs/guides/text]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Conditional Feedback
- D-01: Only show an improved sentence when the student's original English answer actually needs correction.
- D-02: If the student's original answer already says the target response correctly, skip the correction-and-repeat requirement for that turn and give positive reinforcement instead.
- D-03: Replace the Phase 4 placeholder behavior that always shows a fixed model sentence; Phase 6 AI evaluation must drive whether correction and repeat are required.

### Language Validation
- D-04: Turn evaluation must check that the student's response is in English.
- D-05: Non-English responses, including Japanese or other non-target languages, must not be accepted as successful English speaking practice.

### Confidence And Review Routing
- D-06: Low-confidence, ambiguous, failed-schema, or malformed AI evaluation results must route to teacher review instead of auto-passing or auto-failing.
- D-07: App code owns assignment and attempt status transitions; AI output can recommend evaluation fields but cannot directly own workflow state.

### Mission Generation
- D-08: Generated missions must be previewable and editable by the teacher before assignment.
- D-09: Generated mission output must be validated against a strict mission schema before it can become assignable mission data.

### the agent's Discretion
- D-10: The exact OpenAI model names, response schemas, retry strategy, confidence threshold values, and test fixture structure are implementation details for the planner and executor, provided they satisfy the phase requirements and keep paid API calls out of automated tests.

### Deferred Ideas (OUT OF SCOPE)
- Full teacher review dashboard buckets and manual override workflows remain Phase 7 scope.
- Numerical scoring, pronunciation percentages, ranking, long-form free chat, and autonomous voice-agent behavior remain out of v1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MISS-02 | Teacher can generate a draft mission from target pattern, topic, level, required turns, and due date. | Add a teacher-only mission-generation adapter and action that returns a draft, not a saved assignment [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: src/components/teacher/MissionForm.tsx]. |
| MISS-03 | Teacher can preview and edit a generated mission before assigning it. | Fill the existing manual mission form from an AI draft after schema validation; do not create hidden assignable mission data [VERIFIED: 06-UI-SPEC.md; VERIFIED: src/components/teacher/MissionForm.tsx]. |
| MISS-05 | Mission generation output is validated against a strict mission schema before it can be assigned. | Reuse and extend `missionFormSchema`/`missionSnapshotSchema`; OpenAI strict structured outputs require object roots, required fields, and `additionalProperties:false` [VERIFIED: src/domain/mission/schemas.ts; CITED: https://developers.openai.com/api/docs/guides/structured-outputs]. |
| AI-01 | System evaluates whether the student's meaning is understandable. | Replace `placeholder-v1` with `ai-eval-v1` structured fields in `attempt_turns.evaluation` [VERIFIED: src/domain/flow/evaluation.ts; VERIFIED: supabase/migrations/202606250001_foundation_schema.sql]. |
| AI-02 | System evaluates whether the student attempted the target pattern. | Persist target-pattern result to `target_attempted` plus evaluation JSON while app rules decide status [VERIFIED: src/server/student-access/audio-upload.ts; VERIFIED: 06-CONTEXT.md]. |
| AI-03 | System produces a better target-form sentence for understandable answers. | Write `attempt_turns.improved_sentence` only when correction is needed; correct English answers skip the improved-sentence/repeat UI [VERIFIED: supabase/migrations/202606250001_foundation_schema.sql; VERIFIED: 06-UI-SPEC.md]. |
| AI-04 | System evaluates whether the repeat attempt is close enough for the mission level. | Replace `repeat_accepted=true` placeholder behavior with evaluator-controlled repeat acceptance for repeat clips [VERIFIED: src/server/student-access/audio-upload.ts; VERIFIED: 05-CONTEXT.md]. |
| AI-05 | System routes low-confidence, failed-schema, or ambiguous evaluations to teacher review instead of pretending certainty. | Use existing `teacher_review` statuses, `attempts.needs_review_reason`, and audit events; do not let AI mutate workflow state directly [VERIFIED: src/domain/foundation/status.ts; VERIFIED: supabase/migrations/202606250001_foundation_schema.sql]. |
</phase_requirements>

## Summary

Phase 6 should be planned as two vertical AI slices plus shared evaluation infrastructure: teacher mission draft generation and student turn evaluation. The project already has the right seams: OpenAI is isolated server-side with fake-client tests, Zod owns mission validation, `attempt_turns.evaluation` is explicitly marked as the Phase 6 swap point, and workflow statuses already include `teacher_review` [VERIFIED: src/server/audio/transcription.ts; VERIFIED: tests/server/transcription.test.ts; VERIFIED: src/domain/flow/evaluation.ts; VERIFIED: src/domain/foundation/status.ts].

**Primary recommendation:** Use the installed `openai@6.45.0` Responses API surface with `openai/helpers/zod` structured outputs, validate again with local Zod schemas, and let app services convert evaluator results into existing DB fields and status transitions [VERIFIED: node_modules/openai/helpers/zod.d.ts; VERIFIED: package-lock.json; CITED: https://developers.openai.com/api/docs/guides/structured-outputs].

Do not introduce new packages, a chat endpoint, a scoring engine, or a Phase 7 dashboard in this phase. The plan should preserve Phase 4's guided one-card student flow and Phase 5's transcript-gated audio path, then insert evaluation between transcript availability and the next student step [VERIFIED: 06-UI-SPEC.md; VERIFIED: src/components/student/MissionFlowShell.tsx; VERIFIED: .planning/phases/05-voice-capture-and-evidence-storage/05-UAT.md].

## Project Constraints (from AGENTS.md)

- Use Next.js App Router, React, TypeScript, Vercel, Supabase Postgres/Auth/Storage/RLS, OpenAI server-side adapters, Zod, Vitest, and Playwright as the established stack [VERIFIED: AGENTS.md].
- Keep changes tied to the active GSD phase and prefer vertical MVP slices over broad technical layers [VERIFIED: AGENTS.md].
- Keep teacher review transcript-first and audio-available [VERIFIED: AGENTS.md].
- Keep AI outputs structured, validated, and routed through server-owned workflow state [VERIFIED: AGENTS.md].
- Avoid v1 scope for school SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat [VERIFIED: AGENTS.md].
- Before implementation edits, use GSD workflow entry points; this research artifact is part of `$gsd-plan-phase 6` [VERIFIED: AGENTS.md; VERIFIED: gsd init.phase-op].
- No project-local skills exist under `.codex/skills` or `.agents/skills` in this workspace [VERIFIED: find .codex/skills .agents/skills].

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Mission draft generation | API / Backend | Browser / Client | Teacher UI gathers source fields and previews a draft, but OpenAI calls, schema parsing, and teacher ownership checks belong server-side [VERIFIED: src/app/teacher/missions/actions.ts; CITED: https://developers.openai.com/api/docs/guides/text]. |
| Draft preview/edit | Browser / Client | API / Backend | UI fills existing form fields only after backend validation; saving still uses existing mission actions [VERIFIED: 06-UI-SPEC.md; VERIFIED: src/components/teacher/MissionForm.tsx]. |
| Original-answer evaluation | API / Backend | Browser / Client | Transcription returns text first; backend evaluator decides structured result; UI renders one of correct/correction/non-English/teacher-review states [VERIFIED: src/components/student/MissionFlowShell.tsx; VERIFIED: 06-UI-SPEC.md]. |
| Repeat evaluation | API / Backend | Browser / Client | Repeat transcript and acceptance belong in service-owned turn writes; UI only shows accepted/retry/review copy [VERIFIED: src/server/student-access/audio-upload.ts; VERIFIED: 06-UI-SPEC.md]. |
| Teacher-review routing | API / Backend | Database / Storage | Status transitions and audit events are server-owned; DB already supports `teacher_review` and review reason fields [VERIFIED: src/domain/foundation/status.ts; VERIFIED: supabase/migrations/202606250001_foundation_schema.sql]. |
| Evidence annotation | API / Backend | Browser / Client | Teacher evidence page is transcript-first and can be annotated with stored AI fields while full buckets remain Phase 7 [VERIFIED: src/app/teacher/evidence/[attemptId]/page.tsx; VERIFIED: 06-UI-SPEC.md]. |

## Standard Stack

### Core

| Library | Installed Version | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `openai` [WARNING: flagged as suspicious by seam because latest publish is very recent; already installed, do not upgrade without checkpoint.] | 6.45.0 installed; npm current 6.45.0 | Server-side Responses API and transcription SDK | Existing Phase 5 adapter uses it server-only; installed SDK exposes `responses.parse` and `zodTextFormat` [VERIFIED: package-lock.json; VERIFIED: node_modules/openai/resources/responses/responses.d.ts; VERIFIED: src/server/audio/transcription.ts]. |
| `zod` | 3.25.76 installed; npm current 4.4.3 | Runtime validation for forms, mission snapshots, and AI outputs | Existing schemas use Zod 3; installed OpenAI helper supports `zod/v3` and `zod/v4`, so no upgrade is needed [VERIFIED: package-lock.json; VERIFIED: node_modules/openai/helpers/zod.d.ts; VERIFIED: src/domain/mission/schemas.ts]. |
| `next` [WARNING: flagged as suspicious by seam because latest publish is very recent; already installed, do not upgrade without checkpoint.] | 15.5.19 installed; npm current 16.2.9 | App Router, server actions, route handlers | Existing teacher/student routes and actions use this stack; Phase 6 should follow the same server-action and route-handler boundaries [VERIFIED: package-lock.json; VERIFIED: src/app/teacher/missions/actions.ts; VERIFIED: src/app/student/missions/[assignmentStudentId]/audio/route.ts]. |
| `@supabase/supabase-js` [WARNING: flagged as suspicious by seam because latest publish is very recent; already installed.] | 2.108.2 installed; npm current 2.108.2 | DB and Storage client | Existing services use service-role Supabase clients with app-level ownership checks [VERIFIED: package-lock.json; VERIFIED: src/server/student-access/audio-upload.ts]. |
| `@supabase/ssr` [WARNING: flagged as suspicious by seam because latest publish is very recent; already installed.] | 0.12.0 installed; npm current 0.12.0 | SSR teacher auth | Existing teacher auth and server clients use Supabase SSR/session patterns [VERIFIED: package-lock.json; VERIFIED: src/lib/supabase/server-auth.ts]. |

### Supporting

| Library | Installed Version | Purpose | When to Use |
|---------|-------------------|---------|-------------|
| `vitest` [WARNING: flagged as suspicious by seam because latest publish is very recent; already installed.] | 2.1.9 installed; npm current 4.1.9 | Unit and server tests | Use for AI schema fixtures, fake OpenAI clients, status-transition tests, and source-structure guards [VERIFIED: package-lock.json; VERIFIED: vitest.config.ts; VERIFIED: tests/server/transcription.test.ts]. |
| `@playwright/test` [WARNING: flagged as suspicious by seam because latest publish is very recent; already installed.] | 1.61.1 installed; npm current 1.61.1 | E2E and source contract tests | Use for teacher draft UI and student evaluation-state flows; keep live Supabase paths env-gated [VERIFIED: package-lock.json; VERIFIED: playwright.config.ts; VERIFIED: tests/e2e/student-audio.spec.ts]. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing OpenAI SDK + Zod helper | Hand-written JSON Schema strings | Higher schema drift risk; local Zod schemas already exist and OpenAI helper supports Zod 3 [VERIFIED: src/domain/mission/schemas.ts; VERIFIED: node_modules/openai/helpers/zod.d.ts]. |
| Existing `attempt_turns.evaluation` JSON | New evaluation tables | Existing schema already has evaluation JSON plus indexed booleans; add columns only if Phase 7 query needs cannot be met [VERIFIED: supabase/migrations/202606250001_foundation_schema.sql]. |
| Guided request/response evaluator | Open-ended chat or realtime agent | Product excludes long-form free chat and autonomous voice-agent behavior for v1 [VERIFIED: 06-CONTEXT.md; VERIFIED: AGENTS.md]. |

**Installation:**

```bash
# No new package installation is recommended for Phase 6.
```

**Version verification:** `package-lock.json` reports `openai@6.45.0`, `zod@3.25.76`, `next@15.5.19`, `@supabase/supabase-js@2.108.2`, `@supabase/ssr@0.12.0`, `vitest@2.1.9`, and `@playwright/test@1.61.1` installed [VERIFIED: package-lock.json]. `npm view` on 2026-06-27 reported current registry versions and no postinstall scripts for the audited packages [VERIFIED: npm registry].

## Package Legitimacy Audit

> Phase 6 should not install new external packages. This audit covers the already-installed packages that Phase 6 should keep using [VERIFIED: package.json; VERIFIED: package-lock.json].

| Package | Registry | Age Signal | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------|-----------|-------------|---------|-------------|
| `openai` | npm | published 2026-06-24 | 23,085,997/week | github.com/openai/openai-node | SUS: too-new | Already installed; use current lockfile, do not upgrade without checkpoint [VERIFIED: package-legitimacy seam; VERIFIED: npm registry]. |
| `zod` | npm | published 2026-05-04 | 211,032,942/week | github.com/colinhacks/zod | OK | Already installed; keep Zod 3 for this phase [VERIFIED: package-legitimacy seam; VERIFIED: package-lock.json]. |
| `next` | npm | published 2026-06-09 | 41,271,384/week | github.com/vercel/next.js | SUS: too-new | Already installed; no upgrade in Phase 6 [VERIFIED: package-legitimacy seam; VERIFIED: package-lock.json]. |
| `@supabase/supabase-js` | npm | published 2026-06-15 | 21,054,614/week | github.com/supabase/supabase-js | SUS: too-new | Already installed; no upgrade in Phase 6 [VERIFIED: package-legitimacy seam; VERIFIED: package-lock.json]. |
| `@supabase/ssr` | npm | published 2026-06-09 | 4,720,544/week | github.com/supabase/ssr | SUS: too-new | Already installed; no upgrade in Phase 6 [VERIFIED: package-legitimacy seam; VERIFIED: package-lock.json]. |
| `vitest` | npm | published 2026-06-15 | 69,955,402/week | github.com/vitest-dev/vitest | SUS: too-new | Already installed; no upgrade in Phase 6 [VERIFIED: package-legitimacy seam; VERIFIED: package-lock.json]. |
| `@playwright/test` | npm | published 2026-06-23 | 41,426,692/week | github.com/microsoft/playwright | SUS: too-new | Already installed; no upgrade in Phase 6 [VERIFIED: package-legitimacy seam; VERIFIED: package-lock.json]. |

**Packages removed due to [SLOP] verdict:** none [VERIFIED: package-legitimacy seam].
**Packages flagged as suspicious [SUS]:** `openai`, `next`, `@supabase/supabase-js`, `@supabase/ssr`, `vitest`, `@playwright/test`; because no new installation is planned, the planner should add a human checkpoint only if it proposes install/upgrade work [VERIFIED: package-legitimacy seam].

## Architecture Patterns

### System Architecture Diagram

```text
Teacher mission form
  -> generateMissionDraftAction
  -> server-only mission AI adapter
  -> OpenAI Responses API structured output
  -> Zod mission draft schema
  -> draft preview
  -> "Use draft" fills existing MissionForm
  -> existing create/update mission action
  -> existing assignment snapshot path

Student original audio
  -> Phase 5 upload/transcription route
  -> attempt_turns.original_transcript
  -> evaluateOriginalTurn service
  -> OpenAI Responses API structured output
  -> Zod evaluation schema
  -> app decision:
       English + correct -> positive reinforcement -> next turn
       English + needs correction -> improved_sentence -> repeat recorder
       non-English -> record again, no success
       low-confidence/schema failure -> teacher_review route -> continue with review copy

Student repeat audio
  -> Phase 5 upload/transcription route
  -> attempt_turns.repeat_transcript
  -> evaluateRepeat service
  -> app decision:
       accepted -> next turn or completion
       retry -> repeat again
       low-confidence/schema failure -> teacher_review route
```

### Recommended Project Structure

```text
src/
├── domain/ai/
│   ├── mission-generation.ts   # Zod schemas and pure mapping for generated mission drafts
│   └── turn-evaluation.ts      # Zod schemas and pure decision helpers for original/repeat evaluations
├── server/ai/
│   ├── mission-generator.ts    # server-only OpenAI adapter with fake-client deps
│   └── turn-evaluator.ts       # server-only OpenAI adapter with fake-client deps
├── server/student-access/
│   └── mission-flow.ts         # integrate evaluation results into existing service-owned status writes
├── components/teacher/
│   └── MissionDraftPanel.tsx   # AI draft panel, preview, use/regenerate states
└── components/student/
    └── evaluation state components inside existing one-card flow
```

### Pattern 1: Server-Only AI Adapter With Fake Client

**What:** Keep OpenAI construction in `src/server/**`, accept an injected client in tests, and map provider failures to narrow app errors [VERIFIED: src/server/audio/transcription.ts; VERIFIED: tests/server/transcription.test.ts].
**When to use:** Mission generation, original-turn evaluation, and repeat evaluation [VERIFIED: 06-CONTEXT.md].

```typescript
// Source: src/server/audio/transcription.ts pattern + OpenAI structured outputs docs
export type AiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "missing_api_key" | "schema_failed" | "provider_failed" };

export async function runWithInjectedClient<T>(
  input: unknown,
  deps: { client?: unknown; apiKey?: string },
): Promise<AiResult<T>> {
  // Build client only after resolving server-only env, call Responses API,
  // parse with strict schema, and return a narrow result.
  return { ok: false, error: "provider_failed" };
}
```

### Pattern 2: Root Object Structured Outputs

**What:** Make every OpenAI output schema a single root `z.object` with required fields; represent variants with a required `outcome` enum instead of a top-level discriminated union [CITED: https://developers.openai.com/api/docs/guides/structured-outputs; VERIFIED: node_modules/openai/helpers/zod.d.ts].
**When to use:** Mission draft schemas and evaluation schemas [VERIFIED: 06-CONTEXT.md].

```typescript
// Source: OpenAI structured outputs guide + installed openai/helpers/zod.d.ts
const originalTurnEvaluationSchema = z.object({
  version: z.literal("ai-eval-v1"),
  outcome: z.enum(["correct", "needs_correction", "non_english", "teacher_review"]),
  meaningUnderstood: z.boolean(),
  targetPatternAttempted: z.boolean(),
  correctionNeeded: z.boolean(),
  improvedSentence: z.string().nullable(),
  englishLanguage: z.enum(["english", "non_english", "uncertain"]),
  confidence: z.enum(["high", "medium", "low"]),
  reviewReason: z.enum(["none", "low_confidence", "ambiguous", "failed_schema"]).nullable(),
});
```

### Pattern 3: AI Recommends, App Decides

**What:** AI result is stored as evidence, then deterministic service code writes `target_attempted`, `improved_sentence`, `repeat_accepted`, `attempts.status`, `assignment_students.status`, and audit events [VERIFIED: 06-CONTEXT.md; VERIFIED: src/domain/foundation/status.ts].
**When to use:** Every Phase 6 status-affecting flow [VERIFIED: src/server/student-access/mission-flow.ts].

### Anti-Patterns to Avoid

- **AI-owned status transitions:** Model output must not directly set `completed`, `needs_retry`, or `teacher_review`; app code owns transitions and audit rows [VERIFIED: 06-CONTEXT.md; VERIFIED: src/domain/foundation/status.ts].
- **Top-level discriminated union schema:** OpenAI strict structured outputs require a root object, not a top-level `anyOf` from a discriminated union [CITED: https://developers.openai.com/api/docs/guides/structured-outputs].
- **Paid API calls in tests:** Existing transcription tests use fake clients; Phase 6 tests should do the same [VERIFIED: tests/server/transcription.test.ts].
- **Correct-answer repeat tax:** Correct English target responses must skip the correction/repeat path [VERIFIED: 06-CONTEXT.md; VERIFIED: 06-UI-SPEC.md].
- **Non-English success:** Japanese or other non-target-language responses must not mark English practice successful [VERIFIED: 06-CONTEXT.md].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing AI prose | Regex/string parsing | OpenAI strict structured outputs plus Zod parse | Status decisions need machine-readable fields and schema failure routing [CITED: https://developers.openai.com/api/docs/guides/structured-outputs]. |
| Schema conversion from scratch | Custom Zod-to-JSON-Schema code | Installed `openai/helpers/zod` | SDK helper supports Zod 3 and Zod 4 and returns auto-parseable formats [VERIFIED: node_modules/openai/helpers/zod.d.ts]. |
| Assignment status engine | Inline updates from UI/evaluator | `assertTransitionRequest` and existing status service patterns | Legal transitions and audit requirements already exist [VERIFIED: src/domain/foundation/status.ts]. |
| Teacher review dashboard | New bucket UI in Phase 6 | Existing evidence page annotations only | Full buckets and manual override workflows are Phase 7 scope [VERIFIED: 06-CONTEXT.md; VERIFIED: 06-UI-SPEC.md]. |
| Chat/buddy agent | Student chat endpoint | Existing scripted one-card flow plus bounded evaluator | AI-06 is structurally enforced by no student AI/chat imports [VERIFIED: tests/domain/ai-boundary.test.ts]. |
| Language success heuristic | Checking only string length or transcript presence | Structured evaluator field for English-language validation plus teacher-review fallback for uncertainty | Phase 5 UAT notes language validation belongs to Phase 6 and Phase 6 rejects non-English success [VERIFIED: .planning/phases/05-voice-capture-and-evidence-storage/05-UAT.md; VERIFIED: 06-CONTEXT.md]. |

**Key insight:** The hard part is not making an AI call; it is preserving the deterministic classroom workflow when AI is uncertain, wrong, malformed, or unavailable [VERIFIED: 06-CONTEXT.md; VERIFIED: .planning/research/PITFALLS.md].

## Common Pitfalls

### Pitfall 1: Schema Mismatch Looks Like Product Certainty

**What goes wrong:** A malformed or partial model response is silently coerced into pass/fail behavior [VERIFIED: 06-CONTEXT.md].
**Why it happens:** Structured output failures are treated like ordinary exceptions instead of a teacher-review outcome [CITED: https://developers.openai.com/api/docs/guides/structured-outputs].
**How to avoid:** Every AI adapter returns `{ ok:false, error:"schema_failed" }`; the caller records `teacher_review` with reason `failed_schema` [VERIFIED: src/domain/foundation/status.ts; VERIFIED: 06-UI-SPEC.md].
**Warning signs:** Tests only cover happy-path parsed output and do not include failed-schema fixtures [VERIFIED: 06-CONTEXT.md].

### Pitfall 2: Non-English Transcript Accepted As Practice

**What goes wrong:** The existing Phase 5 flow accepts any transcript because language validation was deferred to Phase 6 [VERIFIED: .planning/phases/05-voice-capture-and-evidence-storage/05-UAT.md].
**Why it happens:** Completion currently keys on transcript presence plus `repeat_accepted`, and Phase 5 placeholder logic sets `repeat_accepted=true` for repeat clips [VERIFIED: src/domain/flow/completion.ts; VERIFIED: src/server/student-access/audio-upload.ts].
**How to avoid:** Insert original-answer evaluation before deciding the next UI step; non-English original answers return to recording and never count as successful English practice [VERIFIED: 06-CONTEXT.md; VERIFIED: 06-UI-SPEC.md].
**Warning signs:** Tests do not include Japanese/non-English fixtures [VERIFIED: 06-CONTEXT.md].

### Pitfall 3: Conditional Skip-Repeat Breaks Completion Rules

**What goes wrong:** Correct English answers skip repeat UI but `isAttemptComplete` still requires `repeat_transcript` and `repeat_accepted=true` [VERIFIED: src/domain/flow/completion.ts; VERIFIED: 06-CONTEXT.md].
**Why it happens:** Phase 4/5 completion assumed every turn includes a repeat [VERIFIED: .planning/phases/04-guided-student-attempt-loop/04-CONTEXT.md].
**How to avoid:** Planner must update completion helpers to accept either a correction-required accepted repeat or a correct-original accepted turn marker; cover both paths with focused tests [VERIFIED: tests/server/mission-flow.test.ts; VERIFIED: 06-CONTEXT.md].
**Warning signs:** UI skips repeat but final completion still returns `not_complete` [VERIFIED: src/server/student-access/mission-flow.ts].

### Pitfall 4: Teacher Review Is Not Compatible With Phase 7

**What goes wrong:** Low-confidence rows are stored only inside opaque JSON and Phase 7 cannot build buckets or reason labels [VERIFIED: supabase/migrations/202606250001_foundation_schema.sql; VERIFIED: .planning/ROADMAP.md].
**Why it happens:** Phase 6 focuses on student continuation and forgets downstream review requirements [VERIFIED: .planning/REQUIREMENTS.md].
**How to avoid:** Store structured `evaluation.version`, `outcome`, `confidence`, `reviewReason`, and mirror high-level fields in existing columns; update `attempts.needs_review_reason` and `assignment_students.status='teacher_review'` when review is required [VERIFIED: src/domain/foundation/status.ts; VERIFIED: src/server/teacher/audio-evidence.ts].
**Warning signs:** Teacher evidence page cannot show "Teacher review" reason text from stored data [VERIFIED: 06-UI-SPEC.md].

### Pitfall 5: Prompt Changes Ship Without Fixtures

**What goes wrong:** A prompt tweak changes classroom behavior without tests covering correct English, correction, non-English, low-confidence, ambiguous, failed-schema, repeat accepted, and repeat retry cases [CITED: https://developers.openai.com/api/docs/guides/text; VERIFIED: 06-CONTEXT.md].
**Why it happens:** Prompt code is treated like content, not production logic [CITED: https://developers.openai.com/api/docs/guides/text].
**How to avoid:** Keep prompt builders in code near the feature, use typed arguments, and require fixture tests before prompt/model changes [CITED: https://developers.openai.com/api/docs/guides/text].
**Warning signs:** Only snapshot tests exist and no fake OpenAI client asserts request shape [VERIFIED: tests/server/transcription.test.ts pattern].

## Code Examples

### Mission Draft Adapter Shape

```typescript
// Source: src/server/audio/transcription.ts pattern; OpenAI structured outputs guide
export type GenerateMissionDraftResult =
  | { ok: true; draft: MissionDraft }
  | { ok: false; error: "missing_api_key" | "schema_failed" | "provider_failed" };

// Tests inject `client`; production constructs OpenAI only inside server code.
export async function generateMissionDraft(
  input: GenerateMissionDraftInput,
  deps: { client?: Pick<OpenAI, "responses">; apiKey?: string } = {},
): Promise<GenerateMissionDraftResult> {
  // Use client.responses.parse({ text: { format: zodTextFormat(schema, name) } })
  // Then missionDraftSchema.safeParse again before returning.
  return { ok: false, error: "provider_failed" };
}
```

### Teacher Review Transition Helper

```typescript
// Source: src/domain/foundation/status.ts
assertTransitionRequest({
  previousStatus: "started",
  nextStatus: "teacher_review",
  actorType: "ai_evaluator",
  reasonCode: "low_confidence_evaluation",
  occurredAt: new Date().toISOString(),
});
```

## Recommended Vertical Plan Decomposition

1. **Wave 0 - schemas and fixtures:** Add mission draft and turn evaluation Zod schemas, fake-client fixtures, and completion-helper tests for correct-original skip-repeat, correction-required repeat, non-English retry, and teacher-review route [VERIFIED: vitest.config.ts; VERIFIED: 06-CONTEXT.md].
2. **Mission generation slice:** Add server-only generator adapter, teacher action, `MissionDraftPanel`, strict-schema failure state, and "Use draft" form-fill behavior [VERIFIED: src/components/teacher/MissionForm.tsx; VERIFIED: 06-UI-SPEC.md].
3. **Evaluator adapter slice:** Add server-only evaluator adapter and pure mapper from structured result to app decision fields; use fake clients in tests [VERIFIED: src/server/audio/transcription.ts; VERIFIED: tests/server/transcription.test.ts].
4. **Student original-answer integration:** After original transcript, evaluate and branch to correct/correction/non-English/teacher-review UI; update DB fields but keep state transitions server-owned [VERIFIED: src/components/student/MissionFlowShell.tsx; VERIFIED: src/server/student-access/audio-upload.ts].
5. **Repeat integration:** Evaluate repeat transcript before setting `repeat_accepted`; support accepted, retry, and teacher-review outcomes [VERIFIED: src/server/student-access/audio-upload.ts; VERIFIED: 06-UI-SPEC.md].
6. **Teacher-review handoff:** Annotate the existing evidence page with stored AI fields and review reasons only; leave bucket dashboard/manual override to Phase 7 [VERIFIED: src/app/teacher/evidence/[attemptId]/page.tsx; VERIFIED: 06-CONTEXT.md].
7. **Verification pass:** Run focused Vitest suites, Playwright source/UI checks, typecheck, and env-gated live checks only when Supabase/OpenAI env is intentionally loaded [VERIFIED: package.json; VERIFIED: tests/e2e/student-audio.spec.ts].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reusable hosted prompt objects | Prompt builders kept in application code with typed arguments and tests | OpenAI docs state prompt object deprecation begins 2026-06-03 and shutdown is scheduled 2026-11-30 | Phase 6 prompts should live in `src/server/ai/**`, not remote prompt objects [CITED: https://developers.openai.com/api/docs/guides/text]. |
| JSON mode/prose parsing | Structured Outputs with strict JSON Schema | Current OpenAI structured outputs guide | Phase 6 should reject failed schema and route to teacher review [CITED: https://developers.openai.com/api/docs/guides/structured-outputs]. |
| Top-level union outputs | Root object with required `outcome` enum | Current OpenAI structured outputs guide | Avoid top-level Zod discriminated unions for model output schemas [CITED: https://developers.openai.com/api/docs/guides/structured-outputs]. |
| Direct model requests through older chat surface | Responses API for direct text generation, especially reasoning models | Current OpenAI text guide | Use installed `client.responses.parse/create` surface for mission/evaluation text work [CITED: https://developers.openai.com/api/docs/guides/text; VERIFIED: node_modules/openai/resources/responses/responses.d.ts]. |

**Deprecated/outdated:**
- Reusable prompt objects for new work should not be used; OpenAI docs recommend code-managed prompt builders for new text-generation work [CITED: https://developers.openai.com/api/docs/guides/text].
- Zod 4-only APIs should not be planned unless the phase explicitly upgrades `zod`; this repo currently has Zod 3.25.76 installed [VERIFIED: package-lock.json].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Initial confidence thresholds should be conservative and tuned with pilot fixtures rather than locked from research alone [ASSUMED]. | Common Pitfalls / Open Questions | Thresholds may route too many or too few turns to teacher review. |
| A2 | Existing `attempt_turns.evaluation` JSON plus `attempts.needs_review_reason` is enough for Phase 7 handoff unless planner identifies a query need for indexed columns [ASSUMED]. | Architecture Patterns | Phase 7 may need a small migration for faster bucket filtering. |
| A3 | The mission generator can satisfy v1 quality with the current mission fields and does not need extra curriculum metadata [ASSUMED]. | Recommended Plan Decomposition | Teacher-generated drafts may be generic if target pattern/topic/level are insufficient. |

## Open Questions (RESOLVED)

1. **What exact confidence threshold should route to teacher review?**
   - Decision: Use categorical confidence in `ai-eval-v1`: only `confidence: "high"` with a valid schema and non-review outcome can auto-continue. `confidence: "medium"`, `confidence: "low"`, ambiguous outcomes, malformed output, provider failure, and failed schema route to teacher review [VERIFIED: 06-CONTEXT.md].
   - Execution note: Fixture tests may tune prompt wording, but they must not relax the rule that uncertain model output avoids automatic pass/fail.

2. **Should Phase 6 add indexed columns for review reason/confidence?**
   - Decision: Do not add indexed review/confidence columns in Phase 6. Store structured evaluation details in `attempt_turns.evaluation`, mirror existing scalar fields such as `target_attempted`, `improved_sentence`, and `repeat_accepted`, and use existing `attempts.needs_review_reason` plus `teacher_review` statuses for Phase 7 handoff [VERIFIED: supabase/migrations/202606250001_foundation_schema.sql].
   - Execution note: Add a migration only if implementation proves an existing Phase 6 write target is missing; do not pre-build Phase 7 dashboard query optimization.

3. **Which OpenAI model should be the default for generation/evaluation?**
   - Decision: Use env-configured model names in server adapters: `OPENAI_MISSION_MODEL` for mission draft generation and `OPENAI_EVALUATION_MODEL` for turn evaluation. Do not hardcode model names in UI, tests, or student-visible copy. If a live server call has no configured model, return a narrow configuration error instead of silently choosing an unreviewed model [VERIFIED: src/server/audio/transcription.ts pattern].
   - Execution note: Automated tests must inject fake clients and explicit test model strings; final live model choice remains a manual pilot configuration check because model names, quality, and pricing are version-sensitive [VERIFIED: AGENTS.md].

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next/Vitest tooling | yes | v20.12.0 | none needed [VERIFIED: node --version]. |
| npm/npx | scripts and package checks | yes | 10.5.0 | none needed [VERIFIED: npm --version]. |
| Supabase CLI | schema push if migrations are added | command path exists but `supabase --version` did not return a version in sandbox | unknown | Planner should include manual checkpoint before any migration push [VERIFIED: command -v supabase; VERIFIED: supabase --version probe]. |
| `OPENAI_API_KEY` | live AI calls | present in `.env.local`, not loaded into process env | not applicable | Automated tests must use fake clients; live manual run needs env loading [VERIFIED: .env.local redacted scan; VERIFIED: process.env probe]. |
| Supabase env vars | live DB/e2e checks | present in `.env.local`, not loaded into process env | not applicable | Existing tests env-gate live checks [VERIFIED: .env.local redacted scan; VERIFIED: tests/e2e/student-mission.spec.ts]. |

**Missing dependencies with no fallback:** none for automated planning/verification; live AI/Supabase checks need env loading [VERIFIED: process.env probe].

**Missing dependencies with fallback:** Supabase CLI version check failed; fallback is a manual schema-push checkpoint if Phase 6 adds migrations [VERIFIED: supabase probe].

## Validation Architecture

Nyquist validation is enabled in `.planning/config.json` [VERIFIED: .planning/config.json].

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 installed; Playwright 1.61.1 installed [VERIFIED: package-lock.json]. |
| Config file | `vitest.config.ts`, `playwright.config.ts` [VERIFIED: codebase grep]. |
| Quick run command | `npx vitest run tests/domain/mission-generation.test.ts tests/domain/turn-evaluation.test.ts tests/server/ai-mission-generator.test.ts tests/server/turn-evaluator.test.ts` [ASSUMED]. |
| Full suite command | `npm run typecheck && npx vitest run && npx playwright test` [VERIFIED: package.json; VERIFIED: playwright.config.ts]. |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MISS-02 | Generate draft from teacher source fields | server/unit + component | `npx vitest run tests/server/ai-mission-generator.test.ts` | no - Wave 0 [VERIFIED: .planning/REQUIREMENTS.md]. |
| MISS-03 | Preview/edit generated mission before assignment | component/e2e | `npx playwright test tests/e2e/teacher-ai-mission-draft.spec.ts` | no - Wave 0 [VERIFIED: 06-UI-SPEC.md]. |
| MISS-05 | Reject invalid generated mission schema | unit/server | `npx vitest run tests/domain/mission-generation.test.ts tests/server/ai-mission-generator.test.ts` | no - Wave 0 [VERIFIED: .planning/REQUIREMENTS.md]. |
| AI-01 | Meaning understandable result stored | unit/server | `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts` | no - Wave 0 [VERIFIED: .planning/REQUIREMENTS.md]. |
| AI-02 | Target pattern attempt result stored | unit/server | `npx vitest run tests/domain/turn-evaluation.test.ts` | no - Wave 0 [VERIFIED: .planning/REQUIREMENTS.md]. |
| AI-03 | Improved sentence only when needed | unit/component/e2e | `npx vitest run tests/domain/turn-evaluation.test.ts && npx playwright test tests/e2e/student-ai-evaluation.spec.ts` | no - Wave 0 [VERIFIED: 06-CONTEXT.md]. |
| AI-04 | Repeat closeness controls `repeat_accepted` | unit/server | `npx vitest run tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts` | no - Wave 0 [VERIFIED: .planning/REQUIREMENTS.md]. |
| AI-05 | Low-confidence/schema/ambiguous routes to teacher review | unit/server/e2e | `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/student-mission-flow.test.ts` | no - Wave 0 [VERIFIED: 06-CONTEXT.md]. |

### Sampling Rate

- **Per task commit:** Run the focused Vitest file for the edited domain/server/UI path [VERIFIED: .planning/config.json].
- **Per wave merge:** Run `npx vitest run` [VERIFIED: .planning/config.json].
- **Phase gate:** Run `npm run typecheck`, `npx vitest run`, and relevant Playwright specs before `$gsd-verify-work` [VERIFIED: package.json; VERIFIED: playwright.config.ts].

### Wave 0 Gaps

- [ ] `tests/domain/mission-generation.test.ts` - covers MISS-02/MISS-05 schema mapping and invalid draft rejection [VERIFIED: .planning/REQUIREMENTS.md].
- [ ] `tests/domain/turn-evaluation.test.ts` - covers correct, needs correction, non-English, low-confidence, ambiguous, failed-schema, repeat accepted, repeat retry [VERIFIED: 06-CONTEXT.md].
- [ ] `tests/server/ai-mission-generator.test.ts` - fake OpenAI client, no paid calls, request shape, missing API key [VERIFIED: tests/server/transcription.test.ts pattern].
- [ ] `tests/server/turn-evaluator.test.ts` - fake OpenAI client and schema failure mapping [VERIFIED: tests/server/transcription.test.ts pattern].
- [ ] `tests/server/student-mission-flow.test.ts` - completion rules after conditional skip-repeat and teacher-review routing [VERIFIED: src/domain/flow/completion.ts].
- [ ] `tests/e2e/teacher-ai-mission-draft.spec.ts` - draft panel states and no raw JSON/model internals [VERIFIED: 06-UI-SPEC.md].
- [ ] `tests/e2e/student-ai-evaluation.spec.ts` - source/DOM checks or env-gated UI branches for correct/correction/non-English/review outcomes [VERIFIED: 06-UI-SPEC.md].

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not disable it [VERIFIED: .planning/config.json].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Teacher auth remains Supabase Auth; student access remains unlock-cookie gated, not AI-driven [VERIFIED: AGENTS.md; VERIFIED: src/app/join/actions.ts]. |
| V3 Session Management | yes | Student server actions must keep using `readStudentUnlock()` and short-lived HttpOnly cookie flow [VERIFIED: src/app/student/missions/[assignmentStudentId]/actions.ts]. |
| V4 Access Control | yes | Service-role paths must verify teacher/student ownership before DB or Storage actions [VERIFIED: src/server/student-access/audio-upload.ts; VERIFIED: src/server/teacher/audio-evidence.ts]. |
| V5 Input Validation | yes | Zod schemas for mission drafts, evaluator outputs, action inputs, and form payloads [VERIFIED: src/domain/mission/schemas.ts; VERIFIED: src/app/teacher/missions/actions.ts]. |
| V6 Cryptography | yes | Do not alter PIN hashing; no new cryptography needed for Phase 6 [VERIFIED: .planning/STATE.md; VERIFIED: src/domain/classroom/pin.ts]. |
| V8 Data Protection | yes | Child audio remains private, transcript-first, and signed-url-only for playback [VERIFIED: AGENTS.md; VERIFIED: .planning/phases/05-voice-capture-and-evidence-storage/05-UAT.md]. |

### Known Threat Patterns for Next.js/Supabase/OpenAI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-side API key exposure | Information Disclosure | OpenAI clients only in `src/server/**`; no browser imports; use fake clients in tests [VERIFIED: src/server/audio/transcription.ts; VERIFIED: tests/domain/ai-boundary.test.ts]. |
| Cross-student turn mutation | Elevation of Privilege | Verify `assignment_students.id` and `student_id` before any attempt/turn/audio/evaluation write [VERIFIED: src/server/student-access/audio-upload.ts; VERIFIED: src/server/student-access/mission-flow.ts]. |
| Prompt injection via transcript | Tampering | Treat transcript as data inside typed prompt args, keep output schema narrow, and do not expose tools or workflow-state authority to the model [CITED: https://developers.openai.com/api/docs/guides/text; VERIFIED: 06-CONTEXT.md]. |
| Unsafe or off-topic child-facing AI copy | Information Disclosure / Safety | Do not add chat; render only bounded evaluation-state copy from UI-SPEC and static messages [VERIFIED: 06-UI-SPEC.md; VERIFIED: tests/domain/ai-boundary.test.ts]. |
| Ambiguous AI outcome pretending certainty | Tampering | Route low-confidence/ambiguous/schema-failed outcomes to teacher review [VERIFIED: 06-CONTEXT.md; VERIFIED: src/domain/foundation/status.ts]. |
| Provider abuse traceability gap | Repudiation | Use OpenAI `safety_identifier` or equivalent hashed stable user identifier when live calls are enabled, without sending personal information [CITED: https://developers.openai.com/api/docs/guides/safety-checks]. |

## Sources

### Primary (HIGH confidence)

- `src/server/audio/transcription.ts` - server-only OpenAI adapter and fake-client seam [VERIFIED: codebase grep].
- `tests/server/transcription.test.ts` - paid-call-free fake-client pattern [VERIFIED: codebase grep].
- `src/domain/mission/schemas.ts` - mission form and snapshot schemas [VERIFIED: codebase grep].
- `src/domain/flow/evaluation.ts` - placeholder-v1 swap point [VERIFIED: codebase grep].
- `src/server/student-access/audio-upload.ts` - transcript writes and placeholder evaluation integration [VERIFIED: codebase grep].
- `src/domain/foundation/status.ts` - status transition legality and audit actor types [VERIFIED: codebase grep].
- `supabase/migrations/202606250001_foundation_schema.sql` - attempt/turn/review columns and statuses [VERIFIED: codebase grep].
- `package-lock.json` and `node_modules/openai/helpers/zod.d.ts` - installed versions and Zod helper support [VERIFIED: local package files].

### Secondary (MEDIUM confidence)

- OpenAI Structured Outputs guide - strict schema, `zodTextFormat`, required fields, root object rule [CITED: https://developers.openai.com/api/docs/guides/structured-outputs].
- OpenAI Text Generation guide - Responses API, code-managed prompt builders, typed args/schemas, fixtures/tests/evals before prompt changes [CITED: https://developers.openai.com/api/docs/guides/text].
- OpenAI Production Best Practices - API key safety, usage monitoring, rate/spend planning [CITED: https://developers.openai.com/api/docs/guides/production-best-practices].
- OpenAI Safety Checks - stable hashed safety identifiers for individual users [CITED: https://developers.openai.com/api/docs/guides/safety-checks].

### Tertiary (LOW confidence)

- Threshold and model-default recommendations are implementation assumptions pending fixture/pilot validation [ASSUMED].

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for installed package versions and local APIs; MEDIUM for registry freshness because several packages were flagged SUS due recent publish dates [VERIFIED: package-lock.json; VERIFIED: package-legitimacy seam].
- Architecture: HIGH for codebase integration seams and locked phase decisions [VERIFIED: 06-CONTEXT.md; VERIFIED: codebase grep].
- Pitfalls: HIGH for schema/status/test isolation pitfalls; MEDIUM for threshold/model quality because no Phase 6 fixture corpus exists yet [VERIFIED: tests/server/transcription.test.ts; ASSUMED].

**Research date:** 2026-06-27 [VERIFIED: current_date]
**Valid until:** 2026-07-04 for OpenAI model/API assumptions; 2026-07-27 for codebase integration patterns unless the repo changes [ASSUMED].
