# Phase 04: Guided Student Attempt Loop - Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 16 new/modified files
**Analogs found:** 14 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/student/missions/[assignmentStudentId]/page.tsx` | route (SSR) | request-response | `src/app/student/home/page.tsx` | exact |
| `src/app/student/missions/[assignmentStudentId]/actions.ts` | server-action | CRUD | `src/app/join/actions.ts` | exact |
| `src/server/student-access/mission-flow.ts` | service | CRUD | `src/server/student-access/unlock.ts` | role-match |
| `src/domain/character/profile.ts` | domain-module | transform | `src/domain/mission/schemas.ts` | role-match |
| `src/components/student/MissionFlowShell.tsx` | component (client) | event-driven | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/StepBuddyQuestion.tsx` | component (client) | event-driven | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/StepImprovedRepeat.tsx` | component (client) | event-driven | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/StepTurnTransition.tsx` | component (client) | event-driven | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/StepMissionComplete.tsx` | component (client) | event-driven | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/HintRevealer.tsx` | component (client) | event-driven | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/TurnProgressBar.tsx` | component (client) | transform | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/AssignmentListItem.tsx` | component (client) | transform | `src/components/student/StudentHomeShell.tsx` | role-match |
| `src/components/student/StudentHomeShell.tsx` | component (client, modify) | request-response | self (existing) | exact |
| `src/components/student/styles.ts` | config (modify) | N/A | self (existing) | exact |
| `src/lib/db/types.ts` | config (modify) | N/A | self (existing) | exact |
| `src/app/student/home/page.tsx` | route (SSR, modify) | request-response | self (existing) | exact |

### Test Files

| New Test File | Role | Closest Analog | Match Quality |
|---------------|------|----------------|---------------|
| `tests/server/mission-flow.test.ts` | test (unit) | `tests/domain/foundation-status.test.ts` | role-match |
| `tests/domain/character-profile.test.ts` | test (unit) | `tests/domain/foundation-status.test.ts` | exact |
| `tests/domain/ai-boundary.test.ts` | test (unit) | `tests/domain/foundation-status.test.ts` | role-match |
| `tests/e2e/student-mission.spec.ts` | test (e2e) | `tests/e2e/student-join.spec.ts` | exact |

## Pattern Assignments

### `src/app/student/missions/[assignmentStudentId]/page.tsx` (route, SSR)

**Analog:** `src/app/student/home/page.tsx`

**Full pattern** (lines 1-29) -- replicate this structure exactly: import `readStudentUnlock`, redirect if null, render with `pageStyle`/`panelStyle`, pass data to client shell:
```typescript
import { redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { StudentHomeShell } from "@/components/student/StudentHomeShell";
import { pageStyle, panelStyle } from "@/components/student/styles";

export default async function StudentHomePage() {
  const unlock = await readStudentUnlock();

  if (!unlock) {
    redirect("/join");
  }

  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        <StudentHomeShell
          className={unlock.className}
          displayName={unlock.displayName}
        />
      </div>
    </main>
  );
}
```

**Delta for mission page:** After the unlock gate, load `assignment_students` row (verify `student_id = unlock.studentId`), load `assignments.mission_snapshot`, parse through `missionSnapshotSchema`, load existing attempt for resume (D-04). Pass parsed snapshot + attempt data + character profile to `<MissionFlowShell>`. Add a guard: if assignment status is `completed` or past `due_at`, redirect back to `/student/home`.

---

### `src/app/student/missions/[assignmentStudentId]/actions.ts` (server-action, CRUD)

**Analog:** `src/app/join/actions.ts`

**Unlock-cookie gate pattern** (lines 87-110) -- every action starts with this:
```typescript
"use server";

import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function readStudentUnlock(): Promise<StudentUnlockCookie | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(UNLOCK_COOKIE)?.value;
  if (!raw) return null;
  // ... parse and validate
}
```

**Action shape pattern** (lines 52-83) -- Zod-validate input, gate on unlock cookie, use service-role client, return `{ ok: true, ... } | { ok: false, error: string }`:
```typescript
export async function unlockStudentAction(input: {
  joinCode: string;
  typedName: string;
  pin: string;
}): Promise<UnlockActionResult> {
  const parsed = studentUnlockSchema.safeParse(input);
  if (!parsed.success) {
    return GENERIC_MISMATCH;
  }

  const result = await unlockStudent(parsed.data);

  if (result.ok) {
    // ... success handling
  }

  return result;
}
```

**Delta:** Each mission action (startAttempt, submitAnswer, submitRepeat, revealHint, completeMission) follows this shape but: (1) verifies `assignment_students.student_id = unlock.studentId` ownership, (2) delegates to `src/server/student-access/mission-flow.ts` for DB writes, (3) returns typed result discriminated unions.

---

### `src/server/student-access/mission-flow.ts` (service, CRUD)

**Analog:** `src/server/student-access/unlock.ts`

**Service-role client + typed result pattern** (lines 1-3, 22-31, 56-103):
```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type StudentUnlockResult =
  | { ok: true; classId: string; studentId: string; className: string; displayName: string; }
  | { ok: false; error: "generic_mismatch" };

export async function unlockStudent(input: { ... }): Promise<StudentUnlockResult> {
  try {
    const supabase = createSupabaseServiceClient();
    // ... sequential queries with early-return on error
    // ... every failure returns the SAME generic error shape
  } catch {
    return GENERIC_MISMATCH;
  }
}
```

**Delta:** Mission-flow service exports functions like `startOrResumeAttempt`, `recordAnswer`, `recordRepeat`, `recordHintReveal`, `completeAttempt`. Each uses service-role client. Status transitions must use `assertTransitionRequest` from `src/domain/foundation/status.ts` (lines 55-81) and write `assignment_status_events`. Use conditional UPDATE for idempotency: `UPDATE ... WHERE status = 'assigned' RETURNING *`.

**Status transition pattern** from `src/domain/foundation/status.ts` (lines 48-81):
```typescript
import {
  assertTransitionRequest,
  canTransitionAssignmentStatus,
  type TransitionRequest,
} from "@/domain/foundation/status";

// Before any status write:
assertTransitionRequest({
  previousStatus,
  nextStatus,
  actorType: "student_session",
  reasonCode: "mission_started",
  occurredAt: new Date().toISOString(),
});
```

---

### `src/domain/character/profile.ts` (domain-module, transform)

**Analog:** `src/domain/mission/schemas.ts`

**Pure domain module pattern** (lines 1-3) -- no server/DB imports, exports typed contracts + constants:
```typescript
import { z } from "zod";

export const DEFAULT_CHARACTER_ID = "default-buddy";
```

**Delta:** This module does NOT use Zod (no validation needed for static templates). It exports: `CharacterProfile` type, `getCharacterProfile(characterId: string)` function, and the `DEFAULT_BUDDY` profile with static template strings. Keep the same file convention: named exports, no default export, pure TypeScript with no side effects.

---

### `src/components/student/MissionFlowShell.tsx` + Step Components (client, event-driven)

**Analog:** `src/components/student/StudentHomeShell.tsx`

**Client component pattern** (lines 1-11) -- `"use client"` directive, named import of style tokens, typed props:
```typescript
"use client";

import { useRouter } from "next/navigation";
import { clearStudentUnlockAction } from "@/app/join/actions";
import {
  bodyStyle,
  displayTitleStyle,
  headingStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";

type StudentHomeShellProps = {
  className: string;
  displayName: string;
};
```

**Inline style pattern** (lines 48-60) -- all styling via `React.CSSProperties` objects, either from `styles.ts` tokens or inline objects:
```typescript
<section
  aria-live="polite"
  style={{
    background: "#F7F8FA",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: 24,
    marginBottom: 16,
  }}
>
```

**Delta for MissionFlowShell:** Uses `useState<FlowState>` for step state machine instead of `useRouter`. Calls server actions (from `actions.ts`) via async handlers. Each step component receives props from the shell (snapshot turn data, character profile lines, callbacks). No `useRouter` navigation between steps -- only client state. `useRouter` only for final navigation back to `/student/home` on completion.

---

### `src/components/student/styles.ts` (config, modify)

**Analog:** self (existing file)

**Style token pattern** (full file) -- `CSSProperties` exports with descriptive names, 8-point grid values, 44px min touch targets:
```typescript
import type { CSSProperties } from "react";

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "12px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};
```

**Delta:** Add new tokens for Phase 4 step cards, progress bar, hint cards, status badges. Follow the same naming convention (`xyzStyle`), same 8-point grid, same color palette (#2563EB accent, #111827 text, #4B5563 secondary, #F7F8FA background, #E5E7EB borders).

---

### `src/components/student/StudentHomeShell.tsx` (modify)

**Delta from current:** Replace the static "No homework yet" section with a conditional: if assignments array is empty show the existing no-homework copy; otherwise render `<AssignmentListItem>` for each assignment with status badge (Start/Continue/Done/Closed). The `CLOSED_PLACEHOLDER` copy (line 16, currently `hidden`) becomes visible on closed/expired items. Props expand to include assignments array.

---

### `src/app/student/home/page.tsx` (modify)

**Delta from current:** After the unlock gate, query `assignment_students` joined with `assignments` for `unlock.studentId` via service-role client. Compute per-item display status (check `due_at` for closed/expired at read time, D-14). Pass assignments array to `<StudentHomeShell>`.

---

### Test Files

**Analog for unit tests:** `tests/domain/foundation-status.test.ts`

**Unit test pattern** (lines 1-8):
```typescript
import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STUDENT_STATUSES,
  assertTransitionRequest,
  canTransitionAssignmentStatus,
} from "@/domain/foundation/status";

describe("foundation assignment status rules", () => {
  it("defines exactly the ASGN-04 assignment student statuses", () => {
    // ...
  });

  it.each([...] as const)("allows legal transition %s -> %s", (prev, next) => {
    // ...
  });
});
```

**Analog for e2e tests:** `tests/e2e/student-join.spec.ts`

**E2E test pattern** (lines 1-13):
```typescript
import { expect, test } from "@playwright/test";

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test("manual /join page renders code entry with no visible roster selector", async ({
  page,
}) => {
  await page.goto("/join");
  await expect(
    page.getByRole("button", { name: "Continue" }),
  ).toBeVisible();
});
```

**Delta for mission tests:** `tests/domain/character-profile.test.ts` tests `getCharacterProfile` returns valid profile for `'default-buddy'` and falls back for unknown ids. `tests/domain/ai-boundary.test.ts` uses `fs.readFileSync` + grep to verify no AI/LLM imports in `src/` student flow files. `tests/server/mission-flow.test.ts` tests the service functions (will need Supabase env or mocks). `tests/e2e/student-mission.spec.ts` follows the env-aware pattern with `hasSupabaseEnv` guard.

---

## Shared Patterns

### Service-Role + Unlock Cookie Gate
**Source:** `src/app/join/actions.ts` lines 87-110 (`readStudentUnlock`)
**Apply to:** Mission page SSR (`page.tsx`), all 5 server actions in `actions.ts`
```typescript
const unlock = await readStudentUnlock();
if (!unlock) {
  // SSR page: redirect("/join")
  // Server action: return { ok: false, error: "session_expired" }
}
```

### Ownership Verification
**Source:** `src/server/student-access/unlock.ts` lines 56-89 (query + verify pattern)
**Apply to:** Every server action in `actions.ts` -- after unlock gate, verify `assignment_students.student_id = unlock.studentId`
```typescript
const supabase = createSupabaseServiceClient();
const aStudent = await supabase
  .from("assignment_students")
  .select("id, student_id, status, assignment_id, latest_attempt_id")
  .eq("id", input.assignmentStudentId)
  .eq("student_id", unlock.studentId)
  .single();

if (aStudent.error || !aStudent.data) {
  return { ok: false, error: "not_found" };
}
```

### Audited Status Transition
**Source:** `src/domain/foundation/status.ts` lines 55-81 (`assertTransitionRequest`)
**Apply to:** `startOrResumeAttempt` (assigned->started), `completeAttempt` (started->completed)
```typescript
assertTransitionRequest({
  previousStatus: aStudent.data.status,
  nextStatus: "started",
  actorType: "student_session",
  reasonCode: "mission_started",
  occurredAt: new Date().toISOString(),
});
// Then: INSERT assignment_status_events row, UPDATE assignment_students.status
```

### Inline Style Tokens
**Source:** `src/components/student/styles.ts` (full file)
**Apply to:** All new `src/components/student/*.tsx` files
- Import named style tokens; extend with new tokens in `styles.ts`
- 44px min touch targets, 8-point grid, `#2563EB` accent
- No Tailwind, no CSS modules, no component library

### Snapshot Parsing
**Source:** `src/domain/mission/schemas.ts` lines 78-94 (`missionSnapshotSchema`)
**Apply to:** Mission page SSR load
```typescript
import { missionSnapshotSchema } from "@/domain/mission/schemas";

const snapshot = missionSnapshotSchema.parse(assignment.mission_snapshot);
// snapshot.turns, snapshot.requiredTurns, snapshot.characterId are now typed
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/student/MissionFlowShell.tsx` (step state machine logic) | component | event-driven | No existing client-side state machine in the codebase. The shell structure copies `StudentHomeShell.tsx` but the `useState` step-machine + server-action callback pattern is greenfield. Follow React 19 conventions: `useState` for `FlowState`, async event handlers calling server actions, no `useReducer` (overkill for a linear 4-step flow). |
| `tests/domain/ai-boundary.test.ts` (structural grep test) | test | N/A | No existing structural/grep-based test. Convention: use `fs` + `path` to read source files and assert no AI/LLM imports exist in student flow code. Follow vitest `describe`/`it` pattern from `foundation-status.test.ts`. |

## Metadata

**Analog search scope:** `src/app/`, `src/components/`, `src/server/`, `src/domain/`, `src/lib/`, `tests/`
**Files scanned:** 20+ source files, 19 test files
**Pattern extraction date:** 2026-06-27
