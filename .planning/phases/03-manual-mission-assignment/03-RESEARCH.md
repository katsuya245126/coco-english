# Phase 03: Manual Mission Assignment - Research

**Researched:** 2026-06-26
**Domain:** Teacher mission authoring, snapshot assignment, and per-student homework creation (Next.js App Router + Supabase + Zod)
**Confidence:** HIGH

## Summary

Phase 3 builds the teacher-facing mission builder form, the assign-to-class flow, and the snapshot/per-student-record creation on top of the existing foundation schema. The schema tables (`missions`, `mission_turn_templates`, `assignments`, `assignment_students`, `assignment_status_events`) already exist with RLS policies and GRANT privileges in place. This phase adds the UI layer, server actions, Zod validation, and the atomic assign transaction.

The codebase already establishes strong patterns: server actions call `requireTeacherProfile()` for auth gating, use `createSupabaseServerClient()` (RLS-bound, cookie-aware) for all teacher writes, validate input with Zod schemas from `src/domain/`, and return `{ ok: true } | { ok: false; error: string }` result types. All UI uses inline `React.CSSProperties` objects (no Tailwind, no CSS files, no shadcn). Phase 3 follows these patterns exactly.

The three technical challenges are: (1) the multi-turn authoring form with dynamic turn rows that must stay synchronized with `required_turns`, (2) the full denormalized `mission_snapshot` jsonb write validated by a reusable Zod schema, and (3) the atomic assign transaction that creates one `assignments` row plus N `assignment_students` rows plus N `assignment_status_events` rows in a single database operation.

**Primary recommendation:** Use React controlled state (not React Hook Form `useFieldArray`) for the turn authoring sub-form given the codebase's established inline-styles pattern, a Postgres `SECURITY DEFINER` function called via `supabase.rpc()` for the atomic assign transaction, and a shared Zod schema module at `src/domain/mission/schemas.ts` for both form validation and snapshot validation (reusable by Phase 6).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Turn content authored as ordered `mission_turn_templates` rows. Each turn: `prompt`, `target_example`, 3-tier `hint_ladder`. No separate questions table.
- **D-02:** `required_turns` MUST equal authored turn count. Enforce server-side and surface in form.
- **D-03:** Mission `level` is a constrained enum/select, not free text.
- **D-04:** Due date is NOT a mission field. Set at assign time on `assignments.due_at`, OPTIONAL (nullable).
- **D-05:** `assignments.mission_snapshot` written exactly once at assign-click; full denormalized mission including all turns.
- **D-06:** Student/attempt flow reads ONLY the snapshot, never live mission rows.
- **D-07:** Snapshot shape validated by a Zod schema; defined as a reusable module for Phase 6.
- **D-08:** Assign creates `assignment_students` for every ACTIVE (non-archived) student. No back-fill on un-archive.
- **D-09:** Assign idempotent per student via existing `unique (assignment_id, student_id)` constraint.
- **D-10:** Re-assigning same mission to same class creates a NEW `assignments` row.
- **D-11:** Multiple concurrent active assignments per class allowed.
- **D-12:** `assignments.data_mode` copied from class at assign time.
- **D-13:** All writes server-owned and RLS-bound to the authoring teacher.
- **D-14:** Mission remains editable after assignment; snapshot protects in-flight homework.
- **D-15:** Edit-after-assign shows non-blocking warning notice.
- **D-16:** Mission stores `character_id` (default `'default-buddy'`); no character picker in Phase 3.

### Claude's Discretion
- Route/page structure for mission builder and assign flow.
- Server action vs route handler for create/edit/assign.
- Turn authoring UI pattern (repeating inline sub-form, modal, or step-wise).
- Exact `level` label set and `hint_ladder` jsonb shape.
- Minor schema additions strictly needed for authoring.

### Deferred Ideas (OUT OF SCOPE)
- AI/draft mission generation (Phase 6, MISS-02/03/05).
- Character picker UI (Phase 4/v2).
- Auto-miss job for overdue homework (Phase 7, ASGN-05).
- Mission reuse/duplication (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MISS-01 | Teacher can manually create a mission with target pattern, topic, level, required turns, due date, questions, expected target-form examples, and hints | Mission builder form pattern, Zod validation schemas, server action create/edit, turn authoring sub-form |
| MISS-04 | Mission stores a `characterId` even though v1 has one default buddy character | Schema already has `character_id not null default 'default-buddy'`; server action sets it; snapshot includes it |
| ASGN-01 | Teacher can assign a mission to a class | Assign dialog, class selector, atomic assign RPC function |
| ASGN-02 | Assigned mission is snapshotted so later mission edits do not change existing homework | Reusable snapshot Zod schema, denormalized snapshot write at assign-click |
| ASGN-03 | System creates per-student assignment records when homework is assigned | Atomic RPC inserts `assignment_students` rows for all active students plus initial status events |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mission CRUD | API / Backend (Server Actions) | Browser (form state) | Server-owned writes via RLS-bound Supabase client; browser manages form input state only |
| Turn template authoring | Browser (form state) | API / Backend (validation + persistence) | Dynamic form rows managed client-side; server validates turn count = required_turns on save |
| Mission snapshot creation | API / Backend (Server Action) | Database (RPC function) | Snapshot assembled server-side from live mission + turns, validated by Zod, written atomically |
| Assignment creation | Database (RPC function) | API / Backend (Server Action caller) | Atomic multi-table insert must run inside a Postgres transaction; server action invokes RPC |
| Per-student homework records | Database (RPC function) | -- | Bulk insert of `assignment_students` + status events within the same transaction |
| Edit-after-assign warning | Browser (UI) | API / Backend (count query) | Server fetches active assignment count; browser renders the warning notice |
| Navigation (Classes + Missions) | Browser (UI) | -- | Client-rendered tab/link navigation in the existing app shell |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 15.x (installed) | Server actions, routing, SSR pages | Already established in Phases 1-2 [VERIFIED: codebase package.json] |
| React | 19.x (installed) | UI components with controlled state | Already established [VERIFIED: codebase package.json] |
| TypeScript | 5.7.x (installed) | Type safety across schemas and server actions | Already established [VERIFIED: codebase package.json] |
| Zod | 3.25.x (installed) | Form validation and snapshot schema | Already established; used in all domain schemas [VERIFIED: codebase node_modules] |
| @supabase/ssr | 0.12.x (installed) | Cookie-aware server client for RLS-bound writes | Already established in `src/lib/supabase/server-auth.ts` [VERIFIED: codebase] |
| @supabase/supabase-js | 2.45.x (installed) | Service-role client for RPC calls | Already established in `src/lib/supabase/server.ts` [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-hook-form | 7.80.x (installed) | Form state management | Only if the mission builder grows complex enough to warrant it; Phase 2 ClassForm uses controlled state directly, which is simpler [VERIFIED: codebase package.json] |
| @hookform/resolvers | 5.4.x (installed) | Zod resolver for react-hook-form | Only if react-hook-form is used for the mission form [VERIFIED: codebase package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Controlled state for turns | React Hook Form `useFieldArray` | `useFieldArray` adds automatic key management and optimized re-renders, but the codebase has no precedent for it; all Phase 2 forms use `useState` + server actions with `FormData`. Controlled state is simpler and consistent. |
| Multiple Supabase client calls | Postgres RPC function | Multiple sequential inserts are NOT atomic and risk partial writes. RPC wraps all inserts in a single Postgres transaction. Use RPC. |
| Client-side snapshot assembly | Server-side assembly | Never trust the client to assemble the snapshot; server reads live mission + turns from DB and serializes. |

**Installation:**
```bash
# No new packages needed. All dependencies are already installed.
```

## Package Legitimacy Audit

No new packages are introduced in this phase. All dependencies (`next`, `react`, `zod`, `@supabase/ssr`, `@supabase/supabase-js`, `react-hook-form`, `@hookform/resolvers`) are already installed and verified from Phases 1-2.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Teacher Browser                 Next.js Server                    Supabase Postgres
     |                               |                                   |
     |-- Create/Edit Mission ------->|                                   |
     |   (form submission)           |-- requireTeacherProfile() ------->|
     |                               |-- Zod validate input              |
     |                               |-- INSERT missions --------------->|
     |                               |-- UPSERT mission_turn_templates ->|
     |                               |<-- mission id --------------------|
     |<-- redirect to /missions/[id] |                                   |
     |                               |                                   |
     |-- Assign to Class ----------->|                                   |
     |   (class_id, due_at)          |-- requireTeacherProfile() ------->|
     |                               |-- Read mission + turns ---------->|
     |                               |-- Zod validate snapshot shape     |
     |                               |-- supabase.rpc('assign_mission')  |
     |                               |   (mission_snapshot, class_id,    |
     |                               |    due_at, data_mode)             |
     |                               |                    +------------->|
     |                               |                    | BEGIN         |
     |                               |                    | INSERT assignments
     |                               |                    | INSERT assignment_students (N rows)
     |                               |                    | INSERT assignment_status_events (N rows)
     |                               |                    | COMMIT        |
     |                               |<-- assignment_id ------------------|
     |<-- success toast              |                                   |
```

### Recommended Project Structure

```
src/
├── domain/
│   └── mission/
│       └── schemas.ts           # Zod schemas: createMission, updateMission,
│                                # missionSnapshot (reusable for Phase 6),
│                                # assignMission, hintLadder, level enum
├── server/
│   └── mission/
│       ├── mission-service.ts   # createMission, updateMission, getMission,
│       │                        # listMissions, getMissionWithTurns
│       └── assign-service.ts    # assignMissionToClass (builds snapshot, calls RPC)
├── app/
│   └── teacher/
│       ├── missions/
│       │   ├── actions.ts       # Server actions: createMissionAction,
│       │   │                    # updateMissionAction, assignMissionAction
│       │   ├── page.tsx         # Mission list (SSR)
│       │   ├── new/
│       │   │   └── page.tsx     # Mission builder (create)
│       │   └── [id]/
│       │       ├── page.tsx     # Mission builder (edit)
│       │       └── actions.ts   # Per-mission server actions if needed
│       └── page.tsx             # Dashboard (updated with navigation)
├── components/
│   └── teacher/
│       ├── MissionForm.tsx      # Mission builder form component
│       ├── TurnEditor.tsx       # Turn sub-form (repeating rows)
│       ├── MissionList.tsx      # Mission list with actions
│       └── AssignDialog.tsx     # Assign-to-class modal dialog
└── lib/
    └── db/
        └── types.ts             # Extended with full mission/assignment types
```

### Pattern 1: Server Action with Zod Validation (Established)
**What:** All mutation server actions follow the same pattern: `requireTeacherProfile()` -> Zod parse -> service function -> `revalidatePath` -> return result.
**When to use:** Every create/update/assign action.
**Example:**
```typescript
// Source: established pattern from src/app/teacher/classes/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createMissionSchema } from "@/domain/mission/schemas";
import { createMission } from "@/server/mission/mission-service";

export type MissionActionResult =
  | { ok: true; missionId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createMissionAction(
  formData: FormData,
): Promise<MissionActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = createMissionSchema.safeParse({
    title: formData.get("title"),
    targetPattern: formData.get("targetPattern"),
    topic: formData.get("topic"),
    level: formData.get("level"),
    turns: JSON.parse(formData.get("turns") as string ?? "[]"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }
  // ... service call, revalidatePath, return
}
```

### Pattern 2: Atomic Assign via Postgres RPC
**What:** A `SECURITY DEFINER` Postgres function that inserts the `assignments` row, then bulk-inserts `assignment_students` and `assignment_status_events` rows in one transaction.
**When to use:** The assign-to-class action.
**Example:**
```sql
-- Source: pattern derived from existing RLS helpers in migration 0002
-- and Supabase RPC transaction behavior [CITED: supabase.com/docs/reference/javascript/rpc]
CREATE OR REPLACE FUNCTION public.assign_mission_to_class(
  p_class_id uuid,
  p_mission_id uuid,
  p_title text,
  p_mission_snapshot jsonb,
  p_data_mode public.data_mode,
  p_due_at timestamptz DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_student RECORD;
BEGIN
  -- Verify teacher owns the class
  IF NOT EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = p_class_id AND c.teacher_id = p_teacher_id
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Insert assignment row
  INSERT INTO assignments (class_id, mission_id, title, mission_snapshot, data_mode, due_at)
  VALUES (p_class_id, p_mission_id, p_title, p_mission_snapshot, p_data_mode, p_due_at)
  RETURNING id INTO v_assignment_id;

  -- Insert one assignment_students + status event per active student
  FOR v_student IN
    SELECT id FROM students
    WHERE class_id = p_class_id AND archived_at IS NULL
  LOOP
    INSERT INTO assignment_students (assignment_id, student_id)
    VALUES (v_assignment_id, v_student.id)
    ON CONFLICT (assignment_id, student_id) DO NOTHING;  -- D-09 idempotency

    INSERT INTO assignment_status_events
      (assignment_student_id, previous_status, next_status, actor_type, reason_code)
    SELECT
      asg.id, NULL, 'assigned', 'system', 'assignment_created'
    FROM assignment_students asg
    WHERE asg.assignment_id = v_assignment_id
      AND asg.student_id = v_student.id;
  END LOOP;

  RETURN v_assignment_id;
END;
$$;
```

### Pattern 3: Reusable Snapshot Zod Schema
**What:** A single Zod schema that defines the complete mission snapshot shape, used at assign-time validation and reused by Phase 6 for AI-generated mission validation.
**When to use:** Before writing `mission_snapshot` jsonb; before Phase 6 accepts generated missions.
**Example:**
```typescript
// Source: codebase pattern from src/domain/foundation/schemas.ts + D-07 decision
import { z } from "zod";

export const missionLevelEnum = z.enum([
  "beginner",
  "elementary",
  "intermediate",
]);

export const hintLadderSchema = z.object({
  tier1_pattern: z.string().min(1),   // e.g. "I like ___ing"
  tier2_word_bank: z.string().min(1), // e.g. "play, soccer, like"
  tier3_full_example: z.string().min(1), // e.g. "I like playing soccer."
});

export const snapshotTurnSchema = z.object({
  turn_order: z.number().int().positive(),
  prompt: z.string().min(1),
  target_example: z.string().min(1),
  hint_ladder: hintLadderSchema,
});

export const missionSnapshotSchema = z.object({
  mission_id: z.string().uuid(),
  title: z.string().min(1),
  target_pattern: z.string().min(1),
  topic: z.string().min(1),
  level: missionLevelEnum,
  required_turns: z.number().int().positive(),
  character_id: z.string().min(1),
  turns: z.array(snapshotTurnSchema).min(1),
}).refine(
  (data) => data.turns.length === data.required_turns,
  { message: "Turn count must equal required_turns" }
);

export type MissionSnapshot = z.infer<typeof missionSnapshotSchema>;
```

### Pattern 4: Controlled Turn Sub-Form (Consistent with Phase 2)
**What:** Turns managed as a `useState` array of turn objects in the MissionForm component; add/remove operations update the array directly.
**When to use:** The turn authoring section of the mission builder.
**Example:**
```typescript
// Source: pattern consistent with Phase 2 ClassForm controlled state approach
type TurnDraft = {
  key: string; // crypto.randomUUID() for React key stability
  prompt: string;
  targetExample: string;
  hintTier1: string;
  hintTier2: string;
  hintTier3: string;
};

const [turns, setTurns] = useState<TurnDraft[]>([emptyTurn()]);

function addTurn() {
  setTurns((prev) => [...prev, emptyTurn()]);
}

function removeTurn(index: number) {
  setTurns((prev) => prev.filter((_, i) => i !== index));
}

function updateTurn(index: number, field: keyof TurnDraft, value: string) {
  setTurns((prev) =>
    prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
  );
}
```

### Anti-Patterns to Avoid
- **Client-assembled snapshot:** Never let the browser build and send the snapshot jsonb. The server must read the live mission + turns from the database and assemble the snapshot, so the client cannot forge snapshot content.
- **Non-atomic assign:** Never use separate Supabase client `.insert()` calls for the assignment and assignment_students rows. A network error between them leaves orphan assignments with no students. Use a Postgres RPC function.
- **Index-keyed dynamic lists:** Never use array index as React key for turn rows. Use a stable unique ID (crypto.randomUUID) so removals do not cause input value drift.
- **Flat FormData for turns:** Do not try to encode N turns as flat `turn_0_prompt`, `turn_1_prompt` etc. in FormData. Serialize the turns array as JSON in a single FormData field and parse server-side.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-table insert | Multiple sequential `.insert()` calls | Postgres RPC function via `supabase.rpc()` | Supabase JS client has no transaction support; RPC wraps the function in a Postgres transaction automatically [CITED: supabase.com/docs/reference/javascript/rpc] |
| Snapshot validation | Inline shape checks | Zod schema (`missionSnapshotSchema`) | Reusable across Phase 3 assign + Phase 6 AI generation; catches shape drift at the boundary |
| Form validation | Manual if/else chains | Zod `.safeParse()` on FormData | Consistent with all existing server actions; gives structured error messages |
| Auth gating | Manual cookie/session checks | `requireTeacherProfile()` | Already exists, handles redirect to login/profile |
| RLS ownership enforcement | Application-level teacher_id checks | Existing RLS policies + `current_teacher_id()` | Already configured on all mission/assignment tables |

**Key insight:** The hardest problem in this phase is atomicity of the assign operation. Supabase's JS client does not support transactions, so the only reliable path is a Postgres function called via RPC. Everything else (CRUD, validation, auth) follows established Phase 2 patterns.

## Common Pitfalls

### Pitfall 1: GRANT Gotcha on New Database Objects
**What goes wrong:** A new Postgres function (the assign RPC) or any new table/view created by this phase's migration will have no grants for `authenticated` or `service_role` because "Automatically expose new tables" is DISABLED.
**Why it happens:** The project intentionally disabled auto-expose for security, but this means every new database object needs explicit grants.
**How to avoid:** Every migration that creates a function, table, or view must include `GRANT EXECUTE ON FUNCTION ... TO authenticated` (for RPC functions) and `GRANT ... TO service_role` if the service-role client needs access. Use migration 0003/0004 as the template.
**Warning signs:** `permission denied for function assign_mission_to_class` (SQLSTATE 42501) when calling `supabase.rpc()`.

### Pitfall 2: jsonb Round-Trip Serialization Issues
**What goes wrong:** The snapshot jsonb looks correct when written but loses type fidelity on read. Numbers become strings, dates become ISO strings without timezone, or nested objects get flattened.
**Why it happens:** Postgres jsonb preserves JSON semantics (not TypeScript semantics). The Supabase client returns jsonb as plain JavaScript objects, but TypeScript types are lost.
**How to avoid:** Parse the snapshot through the Zod schema on both write AND read paths. This catches serialization drift early. Use `z.coerce.number()` if needed for number fields that might round-trip as strings.
**Warning signs:** Phase 4 reads a snapshot turn and gets `"1"` instead of `1` for `turn_order`.

### Pitfall 3: Turn Count / Required Turns Mismatch
**What goes wrong:** The mission is saved with `required_turns = 3` but only 2 `mission_turn_templates` rows, or the snapshot has a different count than the live rows.
**Why it happens:** The form allows adding/removing turns without updating `required_turns`, or the server action saves turns separately from the mission row.
**How to avoid:** (1) The server action derives `required_turns` from the actual turn array length -- never accept it as a separate client-supplied value. (2) The Zod schema has a `.refine()` that verifies `turns.length === required_turns`. (3) The mission save and turn save happen in the same server action call (not separate API calls).
**Warning signs:** Validation passes but the DB has inconsistent counts.

### Pitfall 4: RLS Policy Interaction with RPC Functions
**What goes wrong:** The assign RPC function runs as `SECURITY DEFINER` (needed for atomic insert), which means it runs with the function owner's privileges, not the calling user's. If the function owner is `postgres`, it bypasses RLS entirely.
**Why it happens:** Necessary trade-off to get transaction atomicity with multi-table inserts.
**How to avoid:** The RPC function must explicitly verify teacher ownership (check `classes.teacher_id = p_teacher_id`) inside the function body before any inserts. Pass `p_teacher_id` from the server action after `requireTeacherProfile()`. The function is security-critical code that must enforce the same ownership rules as RLS would.
**Warning signs:** Any teacher can assign missions to any class.

### Pitfall 5: Stale Mission List After Create/Edit/Assign
**What goes wrong:** After creating a mission or assigning it, the mission list or builder page shows stale data because Next.js has cached the server-rendered page.
**Why it happens:** Next.js App Router caches server component output. Without `revalidatePath`, navigating back to the list shows old data.
**How to avoid:** Every server action that mutates mission or assignment data must call `revalidatePath("/teacher/missions")` (and `/teacher/missions/[id]` for edits). The existing `createClassAction` pattern shows this.
**Warning signs:** User creates a mission, navigates to list, does not see it.

### Pitfall 6: Empty Turn Array on Create
**What goes wrong:** Teacher clicks "Save mission" before adding any turns. The form submits with an empty turns array, which either errors cryptically or creates a mission with 0 turns and `required_turns = 0`.
**Why it happens:** The form starts with no turns (or one empty turn template) and the save button is always enabled per UI-SPEC.
**How to avoid:** Zod validation enforces `turns.min(1)` and the schema refine checks `turns.length === required_turns`. The server action returns a validation error: "Add at least one turn." The form surfaces this error.
**Warning signs:** Missions exist in the DB with `required_turns = 0`.

## Code Examples

### Mission Create Server Action (Full Pattern)
```typescript
// Source: derived from src/app/teacher/classes/actions.ts pattern
"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createMissionInputSchema } from "@/domain/mission/schemas";
import { createMission } from "@/server/mission/mission-service";

const GENERIC_FAILURE =
  "We could not save the mission. Check the highlighted fields and try again.";

export type MissionActionResult =
  | { ok: true; missionId?: string }
  | { ok: false; error: string };

export async function createMissionAction(
  payload: unknown,
): Promise<MissionActionResult> {
  const profile = await requireTeacherProfile();

  const parsed = createMissionInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }

  try {
    const mission = await createMission({
      teacherId: profile.id,
      ...parsed.data,
    });
    revalidatePath("/teacher/missions");
    return { ok: true, missionId: mission.id };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}
```

### Mission Service (RLS-Bound Writes)
```typescript
// Source: derived from src/server/classroom/class-service.ts pattern
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";

export async function createMission(input: {
  teacherId: string;
  title: string;
  targetPattern: string;
  topic: string;
  level: string;
  turns: Array<{
    prompt: string;
    targetExample: string;
    hintLadder: { tier1_pattern: string; tier2_word_bank: string; tier3_full_example: string };
  }>;
}) {
  const supabase = await createSupabaseServerClient();

  // Insert mission row (required_turns derived from turns.length)
  const { data: mission, error: missionError } = await supabase
    .from("missions")
    .insert({
      teacher_id: input.teacherId,
      title: input.title,
      target_pattern: input.targetPattern,
      topic: input.topic,
      level: input.level,
      required_turns: input.turns.length,
      character_id: "default-buddy",
    })
    .select("id")
    .single();

  if (missionError) throw new Error(`Unable to create mission: ${missionError.message}`);

  // Insert turn templates
  const turnRows = input.turns.map((turn, index) => ({
    mission_id: mission.id,
    turn_order: index + 1,
    prompt: turn.prompt,
    target_example: turn.targetExample,
    hint_ladder: turn.hintLadder,
  }));

  const { error: turnError } = await supabase
    .from("mission_turn_templates")
    .insert(turnRows);

  if (turnError) throw new Error(`Unable to create turns: ${turnError.message}`);

  return mission;
}
```

### Assign Service (Snapshot + RPC)
```typescript
// Source: derived from codebase patterns + Supabase RPC docs
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { missionSnapshotSchema } from "@/domain/mission/schemas";

export async function assignMissionToClass(input: {
  teacherId: string;
  missionId: string;
  classId: string;
  dueAt: string | null;
}) {
  const supabase = await createSupabaseServerClient();

  // 1. Read live mission + turns
  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("id", input.missionId)
    .single();

  const { data: turns } = await supabase
    .from("mission_turn_templates")
    .select("*")
    .eq("mission_id", input.missionId)
    .order("turn_order", { ascending: true });

  // 2. Read class data_mode
  const { data: classRow } = await supabase
    .from("classes")
    .select("data_mode")
    .eq("id", input.classId)
    .single();

  // 3. Build and validate snapshot
  const snapshot = {
    mission_id: mission.id,
    title: mission.title,
    target_pattern: mission.target_pattern,
    topic: mission.topic,
    level: mission.level,
    required_turns: mission.required_turns,
    character_id: mission.character_id,
    turns: turns.map((t) => ({
      turn_order: t.turn_order,
      prompt: t.prompt,
      target_example: t.target_example,
      hint_ladder: t.hint_ladder,
    })),
  };

  const validated = missionSnapshotSchema.safeParse(snapshot);
  if (!validated.success) {
    throw new Error(`Invalid snapshot: ${validated.error.message}`);
  }

  // 4. Call atomic RPC
  const { data: assignmentId, error } = await supabase.rpc(
    "assign_mission_to_class",
    {
      p_class_id: input.classId,
      p_mission_id: input.missionId,
      p_title: mission.title,
      p_mission_snapshot: validated.data,
      p_data_mode: classRow.data_mode,
      p_due_at: input.dueAt,
      p_teacher_id: input.teacherId,
    }
  );

  if (error) throw new Error(`Unable to assign: ${error.message}`);
  return assignmentId;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase client-side transactions | Postgres RPC for atomicity | Always (Supabase JS never had transactions) | Must use RPC for multi-table atomic operations |
| `getSession()` for auth | `getClaims()` for server-side auth | Supabase SSR guidance | Project already uses getClaims() via requireTeacherProfile() |
| Tailwind for styling | Inline React.CSSProperties | Phase 2 established | No Tailwind in this project; continue inline styles |

**Deprecated/outdated:**
- `getSession()` for server-side auth checks: Supabase SSR guidance says cookies can be spoofed; use `getClaims()` instead. This project already follows the correct pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Level enum labels should be "beginner", "elementary", "intermediate" | Architecture Patterns (Pattern 3) | Low -- labels are at Claude's discretion per CONTEXT.md; easy to change before implementation |
| A2 | `hint_ladder` jsonb shape uses `tier1_pattern`, `tier2_word_bank`, `tier3_full_example` keys | Architecture Patterns (Pattern 3) | Low -- shape is at Claude's discretion; the 3-tier structure is locked but key names are flexible |
| A3 | Turn authoring works better with controlled state than useFieldArray in this codebase | Standard Stack / Patterns | Medium -- if the form grows very complex (drag-to-reorder, nested validation), useFieldArray might be worth the pattern break |
| A4 | The assign RPC function should use SECURITY DEFINER with explicit ownership checks | Architecture Patterns (Pattern 2) | Low -- this is the established pattern from migration 0002's ownership helpers |

## Open Questions

1. **Mission create vs. mission update turn handling**
   - What we know: Create inserts all turns fresh. Edit must handle added/removed/reordered turns.
   - What's unclear: Whether to delete-all-and-reinsert turns on edit (simpler) or diff and upsert (preserves turn template IDs that `attempt_turns.mission_turn_template_id` references).
   - Recommendation: Delete-and-reinsert is safe for Phase 3 because no attempts exist yet against turn templates (attempts are Phase 4). But the planner should note that once Phase 4 creates attempt_turns referencing template IDs (via `on delete set null`), this strategy remains safe but loses the FK linkage for edited missions. This is acceptable because D-06 says students use the snapshot, not live turns.

2. **Navigation pattern for Classes + Missions tabs**
   - What we know: UI-SPEC says "Two text links or tabs in the top bar" or "A simple navigation row below the top bar." No sidebar.
   - What's unclear: Whether to modify the existing dashboard page.tsx to show both, or make the dashboard a redirect to /teacher/classes.
   - Recommendation: Add a simple nav row below the existing top bar header with two links: "Classes" and "Missions". The `/teacher` page can default to showing Classes (existing behavior) with the nav row added.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (installed) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/domain/` |
| Full suite command | `npx vitest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MISS-01 | createMissionInputSchema validates all required fields + turns | unit | `npx vitest run tests/domain/mission-schemas.test.ts -t "create mission"` | Wave 0 |
| MISS-01 | createMission service inserts mission + turns via RLS client | integration | `npx vitest run tests/server/mission-service.test.ts` | Wave 0 |
| MISS-04 | Snapshot includes character_id = 'default-buddy' | unit | `npx vitest run tests/domain/mission-schemas.test.ts -t "snapshot character"` | Wave 0 |
| ASGN-01 | assignMissionToClass calls RPC and returns assignment_id | integration | `npx vitest run tests/server/assign-service.test.ts` | Wave 0 |
| ASGN-02 | missionSnapshotSchema validates full denormalized shape | unit | `npx vitest run tests/domain/mission-schemas.test.ts -t "snapshot"` | Wave 0 |
| ASGN-03 | RPC creates N assignment_students for N active students | integration | `npx vitest run tests/server/assign-service.test.ts -t "per-student"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/domain/mission-schemas.test.ts`
- **Per wave merge:** `npx vitest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/domain/mission-schemas.test.ts` -- covers MISS-01, MISS-04, ASGN-02
- [ ] `tests/server/mission-service.test.ts` -- covers MISS-01 integration
- [ ] `tests/server/assign-service.test.ts` -- covers ASGN-01, ASGN-03 integration

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireTeacherProfile()` via Supabase Auth `getClaims()` |
| V3 Session Management | yes | Supabase SSR cookie-based sessions via `@supabase/ssr` |
| V4 Access Control | yes | RLS policies on all tables + SECURITY DEFINER helpers for ownership checks |
| V5 Input Validation | yes | Zod schemas on all server action inputs + snapshot validation |
| V6 Cryptography | no | No new crypto in this phase |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Teacher A assigns to Teacher B's class | Elevation of Privilege | RLS `is_class_owner()` + explicit ownership check in RPC function |
| Client forges snapshot with modified turn content | Tampering | Server reads live mission+turns from DB; never trusts client-supplied snapshot |
| Malicious turn content (XSS in prompt/hints) | Tampering | React auto-escapes rendered strings; Zod trims/validates string fields |
| IDOR: guess mission UUID to read/edit another teacher's mission | Information Disclosure | RLS `teacher_id = current_teacher_id()` policy on missions table |
| Missing GRANT on RPC function | Denial of Service | Migration must include `GRANT EXECUTE ON FUNCTION` to `authenticated` |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `supabase/migrations/202606250001_foundation_schema.sql` -- existing table definitions
- Codebase inspection: `supabase/migrations/202606250002_teacher_auth_rls.sql` -- RLS policies and SECURITY DEFINER pattern
- Codebase inspection: `supabase/migrations/202606250003_grant_authenticated_privileges.sql` -- GRANT pattern
- Codebase inspection: `src/app/teacher/classes/actions.ts` -- server action pattern
- Codebase inspection: `src/server/classroom/class-service.ts` -- service layer pattern
- Codebase inspection: `src/domain/classroom/schemas.ts` -- Zod schema pattern
- Codebase inspection: `src/lib/supabase/server-auth.ts` -- RLS-bound client pattern
- Codebase inspection: `src/components/teacher/ClassList.tsx` -- inline styles + dialog pattern

### Secondary (MEDIUM confidence)
- [Supabase RPC docs](https://supabase.com/docs/reference/javascript/rpc) -- transaction behavior of RPC calls
- [React Hook Form useFieldArray docs](https://react-hook-form.com/docs/usefieldarray) -- API reference for dynamic forms
- [Supabase community discussion on transactions](https://github.com/orgs/supabase/discussions/526) -- confirms no client-side transaction support

### Tertiary (LOW confidence)
- WebSearch results on Supabase atomic patterns -- used to confirm RPC is the standard approach

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all patterns established in Phases 1-2
- Architecture: HIGH -- schema exists, patterns exist, only the assign RPC is genuinely new
- Pitfalls: HIGH -- GRANT gotcha and RPC ownership enforcement are verified from codebase migrations

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stable -- no fast-moving external dependencies)
