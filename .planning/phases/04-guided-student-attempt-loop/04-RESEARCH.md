# Phase 04: Guided Student Attempt Loop - Research

**Researched:** 2026-06-27
**Domain:** Next.js App Router server actions, deterministic state machine, mobile-first student flow
**Confidence:** HIGH

## Summary

Phase 4 delivers the student-facing guided speaking mission flow: assignment list on the home shell, per-turn step-card progression (buddy question, typed answer, improved sentence, required repeat), progressive hints, and deterministic completion with server-owned status transitions. The buddy (Coco) is fully scripted from the mission snapshot with no LLM/chat endpoint (AI-06 structural enforcement). Phase 4 uses typed-text answers and accept-any-non-empty placeholder evaluation as clean swap points for Phase 5 (voice) and Phase 6 (real AI eval).

The codebase is a Next.js 15 App Router + TypeScript + Supabase project using inline `React.CSSProperties` objects (no Tailwind, no CSS modules, no component library). Students have no Supabase Auth session; all student data operations go through server actions using the service-role client (`createSupabaseServiceClient`), gated by the short-lived unlock cookie (`readStudentUnlock`). The Phase 1 foundation schema already scaffolds all needed tables (`attempts`, `attempt_turns`, `assignment_students`, `assignment_status_events`) and enums. Phase 4 extends these tables with data writes -- it does not need new tables or schema redesign.

**Primary recommendation:** Build the flow as a single dynamic route `/student/missions/[assignmentStudentId]` with client-side step state (React `useState` for `{turnIndex, step}`) inside one page. All mutations (start-attempt, submit-answer, submit-repeat, reveal-hint, complete-mission) are Next.js server actions using the service-role client, mirroring the established Phase 2 student-access pattern. The character profile is a pure TypeScript module exporting static templates keyed by `characterId`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Typed text input for answers; persists to `attempt_turns.original_transcript` / `repeat_transcript` (same fields Phase 5 voice fills).
- **D-02:** Deterministic placeholder evaluation: accept-any non-empty answer. Record in `attempt_turns.evaluation` jsonb. Never block a child on stand-in logic.
- **D-03:** Per-turn loop: buddy question -> typed answer -> show improved target-form sentence -> required typed repeat -> next turn. One `attempt_turns` row per turn, ordered by `turn_order`.
- **D-04:** Resume the same in-progress attempt where the student left off. One attempt per assignment until it completes.
- **D-05:** Repeat is mandatory but any non-empty repeat is accepted in Phase 4. `repeat_accepted = true`.
- **D-06:** Server-owned, audited status transitions: `assigned -> started` on first answered turn; `started -> completed` when all required turns (original + repeat) satisfied. Each transition writes `assignment_status_events` with `actor_type='student_session'`.
- **D-07:** 3-tier hint ladder reveals strictly in order (tier1 -> tier2 -> tier3), sourced from snapshot `hintLadder`.
- **D-08:** Hints are record-only, no penalty. Updates `attempt_turns.hint_level_used` and `assignment_students.highest_hint_level`.
- **D-09:** Coco is fully scripted from snapshot. No free-text generation, no chat endpoint. AI-06 enforced structurally.
- **D-10:** Tone lives in reviewed static copy in the character profile templates.
- **D-11:** Character profile is a separate module from mission/flow logic, keyed by `characterId`.
- **D-12:** One focused screen/card per step with single primary action, active input above keyboard, "turn X of N" progress indicator.
- **D-13:** Student home shell lists assignments with per-item state badges (Start/Continue/Done/Closed). Multiple concurrent active assignments reachable.
- **D-14:** Closed/expired is read-time display only based on `due_at`; Phase 4 does NOT mutate status to `missed`.

### Claude's Discretion
- Exact student route structure (e.g. `/student/missions/[assignmentStudentId]`)
- Whether per-turn step flow is client-state within one route or distinct sub-routes
- Precise server-action surface shapes
- Exact shape of `attempt_turns.evaluation` placeholder jsonb
- Character-profile module/template format
- Minor schema additions strictly needed for the flow
- Visual/styling specifics (driven by 04-UI-SPEC.md)

### Deferred Ideas (OUT OF SCOPE)
- Real voice capture / recording / upload (FLOW-03, AUDIO-* -> Phase 5)
- Real AI turn evaluation (AI-01..05, MISS-02/03/05 -> Phase 6)
- Teacher review dashboards / status buckets / attempt detail (REV-* -> Phase 7)
- Auto-miss on overdue (ASGN-05 -> Phase 7)
- Character picker / multi-character UI (v2)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLOW-01 | Student can see assigned homework and start a mission | Assignment list extension of StudentHomeShell (D-13), route structure, start-attempt server action |
| FLOW-02 | Buddy asks short classroom-safe questions tied to the assigned mission | Snapshot-driven scripted buddy (D-09), character profile module (D-11), question is snapshot turn `prompt` |
| FLOW-04 | System shows a better target-form sentence after the original answer | Step 2 card shows snapshot turn `targetExample` as `improved_sentence` (D-03) |
| FLOW-05 | Student must repeat the improved target-form sentence | Mandatory repeat step with accept-any-non-empty (D-05), submit-repeat server action |
| FLOW-06 | Mission completes after required turns and repeat attempts satisfied | Completion state machine (D-06), server-owned transition `started -> completed` |
| FLOW-07 | Student can reveal progressive hints | 3-tier hint ladder from snapshot `hintLadder` (D-07), reveal-hint server action, record-only (D-08) |
| AI-06 | System keeps AI responses bounded; blocks open-ended private chat | Structural enforcement: no chat endpoint, no LLM call, fully scripted buddy (D-09) |
| CHAR-01 | MVP uses one recurring supportive classmate buddy | Default buddy "Coco" via `DEFAULT_CHARACTER_ID = 'default-buddy'` |
| CHAR-02 | Buddy tone is friendly, simple, encouraging, classroom-safe | Static reviewed copy in character profile templates (D-10) |
| CHAR-03 | Buddy does not use romance, dating, harsh correction, complex jokes, off-topic chat | Enforced by static templates with no generation (D-09/D-10) |
| CHAR-04 | Character profile separated from mission logic | Separate `src/domain/character/` module keyed by `characterId` (D-11) |
| PILOT-01 | Mobile-responsive student flow for phone/tablet | One-screen-per-step layout (D-12), 420px max-width, 44px touch targets, UI-SPEC contract |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Assignment list (D-13) | Frontend Server (SSR) | Browser / Client | Server component reads assignments via service-role; client component renders list + badges |
| Mission flow navigation (D-12) | Browser / Client | -- | Client-side step state (`useState`) within one SSR-loaded route; no server round-trips between steps |
| Start attempt (D-06) | API / Backend (server action) | -- | Service-role client creates `attempts` row, transitions `assigned -> started`, writes audit event |
| Submit answer (D-01, D-02) | API / Backend (server action) | -- | Service-role client writes `attempt_turns.original_transcript`, placeholder `evaluation` |
| Submit repeat (D-05) | API / Backend (server action) | -- | Service-role client writes `repeat_transcript`, sets `repeat_accepted = true` |
| Reveal hint (D-07, D-08) | API / Backend (server action) | -- | Service-role client updates `attempt_turns.hint_level_used` + `assignment_students.highest_hint_level` |
| Complete mission (D-06) | API / Backend (server action) | -- | Service-role client sets `attempts.status = completed`, transitions `started -> completed`, stamps fields |
| Character profile (CHAR-04) | Domain logic (pure module) | -- | Static TypeScript module, no DB/server dependency; consumed by client components |
| Snapshot parsing | Domain logic (existing) | -- | Existing `missionSnapshotSchema` in `src/domain/mission/schemas.ts` |
| Status transition rules | Domain logic (existing) | -- | Existing `canTransitionAssignmentStatus` in `src/domain/foundation/status.ts` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.19 | App Router, server actions, SSR | Already in use; server actions are the project's established mutation pattern [VERIFIED: package.json] |
| React | 19.x | UI rendering with `useState` for step state | Already in use [VERIFIED: package.json] |
| Supabase JS | 2.45.x | Service-role client for student data operations | Already in use; `createSupabaseServiceClient` established in Phase 2 [VERIFIED: package.json] |
| Zod | 3.23.x | Schema validation (snapshot parsing, action input validation) | Already in use; `missionSnapshotSchema` is the contract [VERIFIED: package.json] |
| TypeScript | 5.7.x | Type safety | Already in use [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 2.1.x | Unit testing state machine, domain logic, server action shapes | Tests for completion logic, status transitions, character profile [VERIFIED: package.json] |
| Playwright | 1.49.x | E2E testing student flow | E2E test for full mission completion path [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side step state (useState) | Sub-routes per step (`/missions/[id]/answer`, `/missions/[id]/repeat`) | Sub-routes add server round-trips, complicate resume (D-04), and over-engineer a linear 4-step flow that runs entirely from client state once the snapshot is loaded |
| Inline CSSProperties | Tailwind / CSS Modules | Project convention is inline styles via `styles.ts`; changing now adds migration scope and breaks Phase 2/3 consistency |
| Service-role server actions | Supabase RLS policies for students | Students have no auth session (D-17); RLS requires `auth.uid()`. Service-role is the locked pattern. |

**Installation:**
```bash
# No new packages needed. Phase 4 uses only existing dependencies.
```

## Package Legitimacy Audit

No new packages are introduced in Phase 4. All libraries are existing project dependencies verified in `package.json`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Student Device (browser)
    |
    v
[/student/home] --- SSR page (readStudentUnlock cookie gate)
    |                    |
    |                    v
    |              [service-role client] ---> Supabase
    |                    |                    (assignment_students + assignments
    |                    v                     for this student_id)
    |              Assignment list data
    |              (status, due_at, snapshot)
    |
    v
[/student/missions/[assignmentStudentId]] --- SSR page (readStudentUnlock gate)
    |                    |
    |                    v
    |              Server loads: assignment_student row + assignment.mission_snapshot
    |              + existing attempt (for resume, D-04)
    |              Parses snapshot through missionSnapshotSchema
    |                    |
    |                    v
    |              <MissionFlowShell> (client component)
    |              - Client-side step state: {turnIndex, step, hintLevel}
    |              - Renders one step card at a time (D-12)
    |                    |
    |     +--------------+--------------+--------------+
    |     v              v              v              v
    | [start-        [submit-       [submit-       [reveal-
    |  attempt]       answer]        repeat]        hint]
    |     |              |              |              |
    |     v              v              v              v
    | Server Actions (all via service-role client)
    |     |              |              |              |
    |     v              v              v              v
    | Supabase writes:
    | - attempts (create/update status)
    | - attempt_turns (original_transcript, repeat_transcript, evaluation, hint_level)
    | - assignment_students (status, attempt_count, submitted_at, highest_hint_level)
    | - assignment_status_events (audit trail)
    |
    v
[Mission complete] --> navigate back to /student/home
```

### Recommended Project Structure
```
src/
├── app/
│   └── student/
│       ├── home/
│       │   └── page.tsx              # Extended: loads assignments, passes to shell
│       └── missions/
│           └── [assignmentStudentId]/
│               ├── page.tsx          # SSR: gate + load snapshot + attempt
│               └── actions.ts        # Server actions: start, submit, hint, complete
├── components/
│   └── student/
│       ├── StudentHomeShell.tsx       # Extended: assignment list with badges
│       ├── AssignmentListItem.tsx     # Single assignment card with status badge
│       ├── MissionFlowShell.tsx       # Client: step state machine + card rendering
│       ├── StepBuddyQuestion.tsx      # Step 1: buddy question + answer input + hints
│       ├── StepImprovedRepeat.tsx      # Step 2: improved sentence + repeat input
│       ├── StepTurnTransition.tsx      # Step 3: "Good job" + next turn button
│       ├── StepMissionComplete.tsx     # Step 4: completion screen
│       ├── HintRevealer.tsx           # Hint ladder progressive reveal
│       ├── TurnProgressBar.tsx        # "Turn X of N" + progress bar
│       └── styles.ts                  # Extended: new Phase 4 style tokens
├── domain/
│   ├── character/
│   │   └── profile.ts                # Character profile module (CHAR-04)
│   └── mission/
│       └── schemas.ts                # Existing: missionSnapshotSchema (unchanged)
├── server/
│   └── student-access/
│       ├── unlock.ts                  # Existing (unchanged)
│       ├── class-lookup.ts            # Existing (unchanged)
│       └── mission-flow.ts            # NEW: server-side flow logic (start, submit, complete)
└── lib/
    ├── supabase/
    │   └── server.ts                  # Existing: service-role client (unchanged)
    └── db/
        └── types.ts                   # Extended: attempt/turn types for service-role queries
```

### Pattern 1: Server Action with Service-Role Client (Student Access Pattern)
**What:** All student mutations use server actions that read the unlock cookie, verify the student identity, then use the service-role client to write to Supabase. This mirrors Phase 2's `unlockStudentAction` pattern.
**When to use:** Every student-facing write operation in Phase 4.
**Example:**
```typescript
// Source: src/app/join/actions.ts (established pattern)
"use server";
import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function submitAnswerAction(input: {
  assignmentStudentId: string;
  turnOrder: number;
  originalTranscript: string;
}): Promise<{ ok: true; turnData: TurnResult } | { ok: false; error: string }> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  // Verify this assignmentStudentId belongs to unlock.studentId
  const supabase = createSupabaseServiceClient();
  // ... ownership check, then write attempt_turns row
}
```

### Pattern 2: Client-Side Step State Machine
**What:** The mission flow uses a client-side state machine with `useState` to track the current `turnIndex` (1-based) and `step` ("question" | "repeat" | "transition" | "complete"). Server actions return the result; the client advances the step.
**When to use:** Within `MissionFlowShell` to manage the per-turn flow without server round-trips between UI steps.
**Example:**
```typescript
// Source: project convention (React useState, no external state lib)
type FlowStep = "question" | "repeat" | "transition" | "complete";
type FlowState = {
  turnIndex: number;  // 1-based, matches turn_order
  step: FlowStep;
  hintLevel: number;  // 0 = none, 1-3 = tiers revealed
  originalAnswer: string;  // carried from step 1 to display in step 2
};

const [flow, setFlow] = useState<FlowState>(initialFlowState);
// initialFlowState computed from server-loaded attempt data (resume support, D-04)
```

### Pattern 3: Character Profile Module (CHAR-04)
**What:** A pure TypeScript module that exports static template strings keyed by `characterId`. Consumed by client components to render buddy speech, encouragement, and transitions. No DB access, no server dependency.
**When to use:** Any place the buddy "speaks" -- question intros, encouragement after answers, transition messages, completion messages.
**Example:**
```typescript
// src/domain/character/profile.ts
export type CharacterProfile = {
  characterId: string;
  displayName: string;
  questionIntro: string;        // "Hi! Let's practice together."
  questionLabel: string;        // "Coco asks:"
  improvedSentenceIntro: string; // "Nice! Here is a better way to say it:"
  repeatInstruction: string;    // "Now try saying it this way:"
  turnTransition: string;       // "Good job! Ready for the next one."
  completionHeading: string;    // "Mission complete!"
  completionBody: (turnCount: number) => string;
  resumeNotice: string;         // "Welcome back! Picking up where you left off."
};

const DEFAULT_BUDDY: CharacterProfile = {
  characterId: "default-buddy",
  displayName: "Coco",
  questionIntro: "Hi! Let's practice together.",
  questionLabel: "Coco asks:",
  improvedSentenceIntro: "Nice! Here is a better way to say it:",
  repeatInstruction: "Now try saying it this way:",
  turnTransition: "Good job! Ready for the next one.",
  completionHeading: "Mission complete!",
  completionBody: (n) =>
    `Great work! You finished all ${n} turns. Your teacher will see your answers.`,
  resumeNotice: "Welcome back! Picking up where you left off.",
};

const PROFILES: Record<string, CharacterProfile> = {
  "default-buddy": DEFAULT_BUDDY,
};

export function getCharacterProfile(characterId: string): CharacterProfile {
  return PROFILES[characterId] ?? DEFAULT_BUDDY;
}
```

### Pattern 4: Placeholder Evaluation Shape (D-02 Swap Point)
**What:** The `attempt_turns.evaluation` jsonb field stores a structured object with a `version` discriminator so Phase 6 can detect and replace placeholder evaluations cleanly.
**When to use:** Every `attempt_turns` write in Phase 4.
**Example:**
```typescript
// Placeholder evaluation shape (Phase 4)
type PlaceholderEvaluation = {
  version: "placeholder-v1";
  meaningUnderstood: true;     // always true (accept-any-non-empty)
  targetPatternAttempted: true; // always true (no real check)
  evaluatedAt: string;          // ISO timestamp
};

// Phase 6 real evaluation shape (for context, NOT built now)
type RealEvaluation = {
  version: "ai-eval-v1";
  meaningUnderstood: boolean;
  targetPatternAttempted: boolean;
  confidence: number;
  improvedSentence: string;
  evaluatedAt: string;
  modelId: string;
};
```
**Swap mechanics:** Phase 6 checks `evaluation.version`. If `"placeholder-v1"`, the turn was Phase 4; if `"ai-eval-v1"`, it was Phase 6+. The flow logic (`step -> repeat -> next turn`) never reads `evaluation` to make decisions -- it only reads `original_transcript` (non-empty?) and `repeat_transcript` (non-empty?). This means Phase 6 can swap the evaluation writer without touching the flow/completion state machine.

### Anti-Patterns to Avoid
- **Adding an LLM/chat endpoint:** AI-06 is satisfied structurally (no generation code exists). Do not add a "buddy response" API route, even a simple one. The buddy's words come from the snapshot `prompt` and the character profile static templates. Adding any generation endpoint breaks the structural guarantee.
- **Reading `evaluation` in flow control logic:** The completion logic must key on "has non-empty `original_transcript`?" and "has non-empty `repeat_transcript`?", never on the evaluation result. This keeps the Phase 5/6 swap clean.
- **Using `useRouter` for step navigation:** Step transitions within a turn (question -> improved sentence -> repeat) should NOT be URL changes. They are visual state within one page. URL-based steps would cause server re-renders and break the single-card-at-a-time UX.
- **Spawning multiple attempts per assignment:** D-04 specifies one attempt per assignment. The start-attempt action must check for existing `in_progress` attempts and resume them, never create a second.
- **Client-side status transitions:** All status changes go through server actions. The client component never writes to `assignment_students.status` directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status transition validation | Custom if/else chain | Existing `canTransitionAssignmentStatus` + `assertTransitionRequest` in `src/domain/foundation/status.ts` | Already handles all legal transitions, actor validation, and audit requirements |
| Snapshot parsing | Manual JSON destructuring | Existing `missionSnapshotSchema.parse()` in `src/domain/mission/schemas.ts` | Zod parse validates structure, types, and hint ladder shape; catches drift |
| Cookie-gated student access | Custom cookie reading | Existing `readStudentUnlock()` in `src/app/join/actions.ts` | Already handles malformed/absent cookies, returns typed `StudentUnlockCookie` |
| Service-role Supabase client | New client creation pattern | Existing `createSupabaseServiceClient()` in `src/lib/supabase/server.ts` | Configured with `persistSession: false`, `autoRefreshToken: false`; server-only |
| Mobile touch target sizing | Manual height calculations | Existing style tokens in `src/components/student/styles.ts` (`inputStyle`, `primaryButtonStyle` both set `minHeight: 44`) | 44px touch targets already enforced across student components |

**Key insight:** Phase 4 is primarily a state machine and UI flow built on top of existing infrastructure. The foundation schema, Zod schemas, service-role client, unlock cookie gate, style tokens, and status transition rules all exist. The new code is: (1) server actions that wire these together for the mission flow, (2) client components for the step-card UI, and (3) the character profile module.

## Common Pitfalls

### Pitfall 1: Resume Creates Duplicate Attempts (D-04 violation)
**What goes wrong:** Student leaves mid-mission, returns, and the start-attempt action creates a new `attempts` row instead of finding the existing `in_progress` one. This produces multiple attempts per assignment, corrupting `attempt_count`.
**Why it happens:** The start-attempt action doesn't check for existing in-progress attempts before INSERT.
**How to avoid:** Start-attempt must: (1) query for existing `attempts` where `assignment_student_id = X AND status = 'in_progress'`; (2) if found, return it with its `attempt_turns` (to compute resume position); (3) only INSERT a new attempt if none exists and current status is `assigned`.
**Warning signs:** `attempt_count > 1` on an assignment that hasn't completed; multiple `attempts` rows for one `assignment_student_id`.

### Pitfall 2: Non-Idempotent Submit Actions
**What goes wrong:** Network retry or double-tap submits the same answer/repeat twice, creating duplicate `attempt_turns` rows or double-advancing the turn counter.
**Why it happens:** Server action doesn't check if the turn already has data for that step.
**How to avoid:** Use `attempt_turns` unique constraint `(attempt_id, turn_order)` as the idempotency key. The submit-answer action should use `INSERT ... ON CONFLICT (attempt_id, turn_order) DO UPDATE SET original_transcript = EXCLUDED.original_transcript` or check existence first. Submit-repeat should update the existing row (never create a new one).
**Warning signs:** Duplicate `attempt_turns` rows, `unique constraint violation` errors.

### Pitfall 3: Status Transition Race Conditions
**What goes wrong:** Two concurrent requests both try `assigned -> started`, creating duplicate `assignment_status_events` or conflicting status.
**Why it happens:** No row-level locking on the `assignment_students` row during the transition.
**How to avoid:** Use `SELECT ... FOR UPDATE` on the `assignment_students` row before checking current status and transitioning. Or use a conditional UPDATE: `UPDATE assignment_students SET status = 'started' WHERE id = X AND status = 'assigned' RETURNING *` -- if 0 rows returned, someone else already transitioned it (which is fine for idempotency).
**Warning signs:** Duplicate `assignment_status_events` entries for the same transition, intermittent "illegal transition" errors.

### Pitfall 4: Missing GRANT on New Objects
**What goes wrong:** If the phase adds any new table, column, function, or view, the service-role client gets `permission denied for table` (SQLSTATE 42501).
**Why it happens:** Project has "auto-expose new tables" DISABLED. New DB objects need explicit `GRANT ... TO service_role` and `GRANT ... TO authenticated`.
**How to avoid:** Phase 4 should NOT need new tables (all tables exist in the foundation schema). But if any migration adds a function or alters a table, include the GRANT statements. Copy the pattern from `202606250003` / `202606250004`.
**Warning signs:** `42501` errors in server actions.

### Pitfall 5: Snapshot `hintLadder` Shape Mismatch
**What goes wrong:** The client component tries to access `turn.hintLadder.tier1` but the snapshot's hint data has a different shape (e.g., the jsonb was stored as a flat string or nested differently).
**Why it happens:** The `hint_ladder` column is `jsonb` with a default of `'{}'::jsonb`. If a mission was saved with an incomplete hint ladder, the Zod schema parse at assign time would catch it -- but if someone bypasses the schema, the stored snapshot could have unexpected shapes.
**How to avoid:** Always parse the snapshot through `missionSnapshotSchema.parse()` at flow load time. The Zod schema requires all three tiers (`tier1`, `tier2`, `tier3`) as non-empty strings. If parse fails, show the generic error state.
**Warning signs:** Runtime `undefined` access on hint tier strings, Zod parse errors at flow load.

### Pitfall 6: Accidentally Breaking AI-06 Structural Guarantee
**What goes wrong:** A developer adds an API route or server action that accepts free-text input and generates buddy responses, thinking it's "just for better UX." This creates the chat endpoint that AI-06 explicitly prohibits.
**Why it happens:** Natural impulse to make the buddy "smarter" or more responsive.
**How to avoid:** Phase 4 plan and verification must explicitly state: "No API route, server action, or function exists that calls an LLM or generates free text. The buddy's words come from snapshot `prompt` fields and character profile static templates. This is the AI-06 structural enforcement." Verification should grep for any import of an AI/LLM client library.
**Warning signs:** Any file that imports `openai`, `@anthropic-ai/sdk`, or similar; any API route under `/api/chat` or `/api/buddy`.

### Pitfall 7: `highest_hint_level` Rollup Regression
**What goes wrong:** Revealing a tier-2 hint on turn 3 overwrites `assignment_students.highest_hint_level` with `2`, even though turn 1 had a tier-3 hint reveal (which set it to `3`).
**Why it happens:** The reveal-hint action does `UPDATE assignment_students SET highest_hint_level = $newLevel` instead of `SET highest_hint_level = GREATEST(highest_hint_level, $newLevel)`.
**How to avoid:** Always use `GREATEST` in the update: `UPDATE assignment_students SET highest_hint_level = GREATEST(highest_hint_level, $newLevel)`.
**Warning signs:** `highest_hint_level` decreasing over time for a single assignment.

## Code Examples

### Server Action: Start Attempt (with resume, D-04)
```typescript
// Source: established pattern from src/app/join/actions.ts + src/server/student-access/unlock.ts
"use server";

import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function startAttemptAction(input: {
  assignmentStudentId: string;
}): Promise<StartAttemptResult> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false, error: "session_expired" };

  const supabase = createSupabaseServiceClient();

  // 1. Verify ownership: this assignment_student belongs to unlock.studentId
  const aStudent = await supabase
    .from("assignment_students")
    .select("id, student_id, status, assignment_id, latest_attempt_id")
    .eq("id", input.assignmentStudentId)
    .eq("student_id", unlock.studentId)
    .single();

  if (aStudent.error || !aStudent.data) {
    return { ok: false, error: "not_found" };
  }

  // 2. Resume: check for existing in_progress attempt (D-04)
  if (aStudent.data.latest_attempt_id && aStudent.data.status === "started") {
    const existingAttempt = await supabase
      .from("attempts")
      .select("id, status")
      .eq("id", aStudent.data.latest_attempt_id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (existingAttempt.data) {
      // Load completed turns to find resume position
      const completedTurns = await supabase
        .from("attempt_turns")
        .select("turn_order, original_transcript, repeat_transcript")
        .eq("attempt_id", existingAttempt.data.id)
        .order("turn_order", { ascending: true });

      return {
        ok: true,
        attemptId: existingAttempt.data.id,
        isResume: true,
        completedTurns: completedTurns.data ?? [],
      };
    }
  }

  // 3. New attempt: only if status is 'assigned'
  if (aStudent.data.status !== "assigned") {
    return { ok: false, error: "invalid_status" };
  }

  // 4. Create attempt + transition assigned -> started + audit event
  const newAttempt = await supabase
    .from("attempts")
    .insert({
      assignment_student_id: input.assignmentStudentId,
      status: "in_progress",
    })
    .select("id")
    .single();

  // ... transition status, write audit event, update latest_attempt_id
}
```

### Assignment List Data Loading (SSR, service-role)
```typescript
// Source: established pattern from src/app/student/home/page.tsx
// The student home page loads assignment data via service-role (students have no auth)

const supabase = createSupabaseServiceClient();
const assignments = await supabase
  .from("assignment_students")
  .select(`
    id,
    status,
    assignment_id,
    assignments!inner (
      id,
      title,
      mission_snapshot,
      due_at
    )
  `)
  .eq("student_id", unlock.studentId)
  .order("created_at", { ascending: false });
```

### Completion Check Logic (D-06)
```typescript
// Pure function: checks if all required turns have both original + repeat
function isAttemptComplete(
  requiredTurns: number,
  turns: Array<{
    original_transcript: string | null;
    repeat_transcript: string | null;
    repeat_accepted: boolean | null;
  }>,
): boolean {
  if (turns.length < requiredTurns) return false;
  return turns.every(
    (t) =>
      t.original_transcript &&
      t.original_transcript.trim().length > 0 &&
      t.repeat_transcript &&
      t.repeat_transcript.trim().length > 0 &&
      t.repeat_accepted === true,
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pages/` router with `getServerSideProps` | App Router with server components + server actions | Next.js 13+ (stable 14/15) | Server actions replace API routes for mutations; project already uses this pattern |
| Custom API routes for mutations | `"use server"` server actions called directly from client components | Next.js 14+ | Reduces boilerplate; type-safe RPC from client to server |
| `useFormState` (old name) | `useActionState` (React 19) | React 19 | Project uses React 19; new hook name applies |

**Deprecated/outdated:**
- `getServerSideProps` / `getStaticProps`: replaced by server components in App Router (project already uses App Router)
- `pages/api/*` route handlers for mutations: replaced by server actions (project already uses server actions for all mutations)

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SELECT ... FOR UPDATE` works via `supabase-js` `.select().single()` with raw SQL or can be achieved via conditional UPDATE pattern | Pitfall 3 | Could need a small RPC for atomic status transitions; low risk since conditional UPDATE is the recommended fallback |
| A2 | Supabase JS client supports `.select()` with nested join syntax (`assignments!inner(...)`) for service-role queries | Code Examples | If not, would need separate queries; minor impact since the pattern is documented in Supabase docs |
| A3 | `useActionState` is the correct React 19 hook name (renamed from `useFormState`) | State of the Art | If project uses React 18, use `useFormState`; but package.json shows React 19 |

**All architectural patterns and file paths are grounded in codebase inspection, not training knowledge.**

## Open Questions

1. **Atomic status transition strategy**
   - What we know: The project uses `canTransitionAssignmentStatus` for validation and server actions for writes. Phase 3 used an RPC (`assign_mission_to_class`) for atomic multi-table writes.
   - What's unclear: Whether Phase 4's status transitions need an RPC or if sequential server-action writes with conditional UPDATE are sufficient.
   - Recommendation: Use conditional UPDATE (`UPDATE ... WHERE status = 'assigned' RETURNING *`) for the `assigned -> started` transition. For completion (`started -> completed`), do the completion check + status update + audit event in a single server action. If atomicity is a concern, wrap in a small RPC. The planner should decide based on complexity.

2. **Resume position computation**
   - What we know: D-04 requires resuming at the next unfinished turn. The `attempt_turns` table has `(attempt_id, turn_order)` unique constraint.
   - What's unclear: Whether to compute the resume position server-side (return `resumeTurnIndex` from the start action) or client-side (load all turns, find first without `repeat_transcript`).
   - Recommendation: Compute server-side in the start-attempt action and return the resume turn index. This avoids sending all turn data to the client just to find the resume point.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 20.12.0 | -- |
| npm | Package management | Yes | 10.5.0 | -- |
| Next.js | App Router + server actions | Yes | 15.5.19 | -- |
| Supabase | Database + service-role client | Yes | 2.45.x (JS client) | -- |
| Vitest | Unit testing | Yes | 2.1.x | -- |
| Playwright | E2E testing | Yes | 1.49.x | -- |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x (unit) + Playwright 1.49.x (e2e) |
| Config file | `vitest.config.ts` (exists), `playwright.config.ts` (exists) |
| Quick run command | `npx vitest run tests/domain/ tests/server/ --reporter=verbose` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLOW-01 | Student sees assignments and can start mission | unit + e2e | `npx vitest run tests/server/mission-flow.test.ts` | No -- Wave 0 |
| FLOW-02 | Buddy asks snapshot-driven questions | unit | `npx vitest run tests/domain/character-profile.test.ts` | No -- Wave 0 |
| FLOW-04 | System shows improved target-form sentence | e2e | `npx playwright test tests/e2e/student-mission.spec.ts` | No -- Wave 0 |
| FLOW-05 | Student must repeat improved sentence | unit + e2e | `npx vitest run tests/server/mission-flow.test.ts` | No -- Wave 0 |
| FLOW-06 | Mission completes after required turns + repeats | unit | `npx vitest run tests/server/mission-flow.test.ts` (completion logic) | No -- Wave 0 |
| FLOW-07 | Progressive hint reveal | unit | `npx vitest run tests/server/mission-flow.test.ts` (hint actions) | No -- Wave 0 |
| AI-06 | No chat endpoint, no LLM call | unit (structural) | `npx vitest run tests/domain/ai-boundary.test.ts` (grep for AI imports) | No -- Wave 0 |
| CHAR-01 | Default buddy character exists | unit | `npx vitest run tests/domain/character-profile.test.ts` | No -- Wave 0 |
| CHAR-02 | Buddy tone is friendly/safe | unit | `npx vitest run tests/domain/character-profile.test.ts` (template content) | No -- Wave 0 |
| CHAR-03 | No romance/harsh/off-topic content | unit | `npx vitest run tests/domain/character-profile.test.ts` | No -- Wave 0 |
| CHAR-04 | Character profile separated from mission logic | unit | `npx vitest run tests/domain/character-profile.test.ts` (module boundary) | No -- Wave 0 |
| PILOT-01 | Mobile-responsive student flow | e2e | `npx playwright test tests/e2e/student-mission.spec.ts --project=mobile` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/domain/ tests/server/ --reporter=verbose`
- **Per wave merge:** `npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/server/mission-flow.test.ts` -- covers FLOW-01, FLOW-05, FLOW-06, FLOW-07 (start, submit, hint, complete actions)
- [ ] `tests/domain/character-profile.test.ts` -- covers CHAR-01, CHAR-02, CHAR-03, CHAR-04, FLOW-02
- [ ] `tests/domain/ai-boundary.test.ts` -- covers AI-06 (structural verification: no AI/LLM imports in student flow)
- [ ] `tests/e2e/student-mission.spec.ts` -- covers FLOW-04, PILOT-01 (full flow e2e)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (students have no auth) | Service-role + unlock cookie gate (Phase 2) |
| V3 Session Management | Partial | Short-lived HttpOnly session cookie (`coco_student_unlock`); already implemented in Phase 2 |
| V4 Access Control | Yes | Server actions verify `unlock.studentId` matches `assignment_students.student_id` before every write |
| V5 Input Validation | Yes | Zod schema validation on all server action inputs; snapshot parsed through `missionSnapshotSchema` |
| V6 Cryptography | No | No new crypto in Phase 4; PIN hashing is Phase 2 |

### Known Threat Patterns for Student Flow

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Student A submits answers for Student B's assignment | Elevation of Privilege | Every server action verifies `assignment_students.student_id = unlock.studentId` |
| Replay/double-submit of answers | Tampering | Unique constraint `(attempt_id, turn_order)` + idempotent upsert pattern |
| Direct Supabase API access to student tables | Information Disclosure | RLS enabled on all tables; students have no auth session; service-role client is server-only |
| Injecting scripts via typed answer text | Cross-site Scripting | React auto-escapes text content in JSX; answers rendered as text nodes, never `dangerouslySetInnerHTML` |
| Enumeration of assignment IDs | Information Disclosure | UUIDs are non-sequential; ownership check prevents access to other students' data |
| Service-role key leak to browser | Information Disclosure | `createSupabaseServiceClient` imports from `@/lib/supabase/server.ts` which is server-only; never imported in `"use client"` modules |

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- all file paths, function signatures, schema definitions, and patterns verified by reading actual source files
- `src/domain/mission/schemas.ts` -- missionSnapshotSchema, hintLadderSchema, DEFAULT_CHARACTER_ID
- `src/components/student/StudentHomeShell.tsx` -- current shell structure, reserved copy
- `src/components/student/styles.ts` -- all existing style tokens
- `src/app/join/actions.ts` -- readStudentUnlock, StudentUnlockCookie, cookie pattern
- `src/server/student-access/unlock.ts` -- service-role student verification pattern
- `src/lib/supabase/server.ts` -- service-role client creation
- `src/domain/foundation/status.ts` -- status transition rules, canTransitionAssignmentStatus
- `supabase/migrations/202606250001_foundation_schema.sql` -- all table/column/enum definitions
- `supabase/migrations/202606250003_grant_authenticated_privileges.sql` -- GRANT pattern
- `supabase/migrations/202606250004_grant_service_role_privileges.sql` -- GRANT pattern
- `04-CONTEXT.md` -- all D-01 through D-14 locked decisions
- `04-UI-SPEC.md` -- complete visual/interaction/copy contract

### Secondary (MEDIUM confidence)
- `package.json` -- dependency versions verified
- Existing test files (vitest + playwright patterns confirmed)
- `.planning/REQUIREMENTS.md` -- requirement IDs and phase mappings

### Tertiary (LOW confidence)
- None. All recommendations are grounded in codebase inspection and locked CONTEXT.md decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, versions verified from package.json
- Architecture: HIGH -- patterns derived from existing codebase (Phase 2/3 server actions, unlock cookie gate, service-role client, style tokens)
- Pitfalls: HIGH -- pitfalls derived from codebase-specific patterns (GRANT gotcha, status transitions, unique constraints, snapshot schema)

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable -- no fast-moving external dependencies; all patterns are codebase-internal)
