# Phase 2: Teacher Classroom Access - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 24 new/modified files
**Analogs found:** 24 / 24 (all have at least a role-match from existing codebase)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/supabase/browser.ts` | config | request-response | `src/lib/supabase/server.ts` | role-match |
| `src/lib/supabase/server-auth.ts` | config | request-response | `src/lib/supabase/server.ts` | exact |
| `src/lib/supabase/middleware.ts` | middleware | request-response | `src/lib/supabase/server.ts` | role-match |
| `src/app/auth/signup/page.tsx` | component | request-response | `src/app/page.tsx` | role-match |
| `src/app/auth/login/page.tsx` | component | request-response | `src/app/page.tsx` | role-match |
| `src/app/auth/callback/route.ts` | route | request-response | `src/app/api/foundation/route.ts` | role-match |
| `src/app/teacher/page.tsx` | component | CRUD | `src/app/page.tsx` | role-match |
| `src/app/teacher/classes/[id]/page.tsx` | component | CRUD | `src/app/page.tsx` | role-match |
| `src/app/join/page.tsx` | component | request-response | `src/app/page.tsx` | role-match |
| `src/app/join/[joinCode]/page.tsx` | component | request-response | `src/app/page.tsx` | role-match |
| `src/app/student/home/page.tsx` | component | request-response | `src/app/page.tsx` | role-match |
| `src/components/auth/SignupForm.tsx` | component | request-response | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/components/auth/LoginForm.tsx` | component | request-response | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/components/teacher/ClassList.tsx` | component | CRUD | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/components/teacher/ClassForm.tsx` | component | CRUD | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/components/teacher/RosterEditor.tsx` | component | CRUD | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/components/student/JoinForm.tsx` | component | request-response | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/components/student/PinForm.tsx` | component | request-response | `src/components/foundation/FoundationSmokePanel.tsx` | role-match |
| `src/domain/classroom/schemas.ts` | model | transform | `src/domain/foundation/schemas.ts` | exact |
| `src/domain/classroom/pin.ts` | utility | transform | `src/domain/foundation/status.ts` | role-match |
| `src/domain/classroom/roster-parser.ts` | utility | transform | `src/domain/foundation/status.ts` | role-match |
| `src/domain/classroom/join-code.ts` | utility | transform | `src/domain/foundation/status.ts` | role-match |
| `src/server/auth/teacher-profile.ts` | service | CRUD | `src/server/foundation/createFoundationSmokeRecord.ts` | exact |
| `src/server/classroom/class-service.ts` | service | CRUD | `src/server/foundation/createFoundationSmokeRecord.ts` | exact |
| `src/server/classroom/roster-service.ts` | service | CRUD | `src/server/foundation/createFoundationSmokeRecord.ts` | exact |
| `src/server/student-access/unlock.ts` | service | request-response | `src/server/foundation/createFoundationSmokeRecord.ts` | role-match |
| `supabase/migrations/202606250002_teacher_auth_rls.sql` | migration | CRUD | `supabase/migrations/202606250001_foundation_schema.sql` | exact |
| `src/lib/db/types.ts` | model | transform | (self - modify) | exact |
| `middleware.ts` | middleware | request-response | no analog | none |
| `tests/domain/roster-parser.test.ts` | test | transform | `tests/domain/foundation-status.test.ts` | exact |
| `tests/domain/student-pin.test.ts` | test | transform | `tests/domain/foundation-status.test.ts` | exact |
| `tests/schema/classroom-access-schema.test.ts` | test | CRUD | `tests/schema/foundation-schema.test.ts` | exact |

## Pattern Assignments

### `src/domain/classroom/schemas.ts` (model, transform)

**Analog:** `src/domain/foundation/schemas.ts` (lines 1-12)

**Imports pattern:**
```typescript
import { z } from "zod";
```

**Core pattern — Zod schema + inferred type export:**
```typescript
export const foundationSmokeResponseSchema = z.object({
  className: z.string(),
  assignmentTitle: z.string(),
  assignmentStudentStatus: z.literal("assigned"),
  dataMode: z.literal("demo"),
});

export type FoundationSmokeResponse = z.infer<
  typeof foundationSmokeResponseSchema
>;
```

**Apply:** Define `createClassSchema`, `updateClassSchema`, `bulkRosterSchema`, `studentUnlockSchema`, `pinSchema` with the same Zod-first pattern and `z.infer` type exports.

---

### `src/domain/classroom/pin.ts`, `roster-parser.ts`, `join-code.ts` (utility, transform)

**Analog:** `src/domain/foundation/status.ts` (lines 1-104)

**Core pattern — pure functions with typed inputs, no Supabase dependency:**
```typescript
export const ASSIGNMENT_STUDENT_STATUSES = [
  "assigned",
  "started",
  "completed",
  "missed",
  "needs_retry",
  "teacher_review",
] as const;

export type AssignmentStudentStatus =
  (typeof ASSIGNMENT_STUDENT_STATUSES)[number];

export function canTransitionAssignmentStatus(
  previousStatus: AssignmentStudentStatus,
  nextStatus: AssignmentStudentStatus,
): boolean {
  return LEGAL_TRANSITIONS[previousStatus].has(nextStatus);
}
```

**Error handling — throw with descriptive messages:**
```typescript
export function assertTransitionRequest(request: TransitionRequest): void {
  if (
    !canTransitionAssignmentStatus(request.previousStatus, request.nextStatus)
  ) {
    throw new Error(
      `Illegal assignment status transition: ${request.previousStatus} -> ${request.nextStatus}`,
    );
  }
}
```

**Apply:** PIN hash/verify, roster name normalization/parsing, and join-code generation should be pure domain functions that throw on invalid input.

---

### `src/server/classroom/class-service.ts`, `roster-service.ts`, `src/server/auth/teacher-profile.ts` (service, CRUD)

**Analog:** `src/server/foundation/createFoundationSmokeRecord.ts` (lines 1-158)

**Imports pattern:**
```typescript
import type { FoundationSmokeResponse } from "@/domain/foundation/schemas";
import { foundationSmokeResponseSchema } from "@/domain/foundation/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
```

**Core pattern — Supabase client + sequential queries + per-query error check:**
```typescript
export async function createFoundationSmokeRecord(): Promise<FoundationSmokeResponse> {
  const supabase = createSupabaseServiceClient();

  const teacher = await supabase
    .from("teacher_profiles")
    .upsert({
      id: teacherId,
      display_name: "Foundation Smoke Teacher",
    })
    .select("id")
    .single();

  if (teacher.error) {
    throw new Error(`Unable to upsert smoke teacher: ${teacher.error.message}`);
  }
  // ... continue with next query using teacher.data
```

**Error handling — check `.error` after every Supabase call, throw with context:**
```typescript
  if (classRow.error) {
    throw new Error(`Unable to create smoke class: ${classRow.error.message}`);
  }
```

**Validation — parse output through Zod schema before returning:**
```typescript
  return foundationSmokeResponseSchema.parse({
    className: classRow.data.name,
    assignmentTitle: assignment.data.title,
    assignmentStudentStatus: assignmentStudent.data.status,
    dataMode: assignment.data.data_mode,
  });
```

**Apply:** Phase 2 services should use the same pattern but with the user-aware Supabase client (not service-role) for teacher operations, so RLS applies. Service-role client stays for student PIN verification where no Supabase Auth session exists.

---

### `src/lib/supabase/browser.ts`, `server-auth.ts` (config, request-response)

**Analog:** `src/lib/supabase/server.ts` (lines 1-17)

**Imports pattern:**
```typescript
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
```

**Core pattern — factory function, env guard, typed return:**
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

**Apply:** `browser.ts` should export `createSupabaseBrowserClient()` using `createBrowserClient` from `@supabase/ssr` with anon key. `server-auth.ts` should export `createSupabaseServerClient()` using `createServerClient` from `@supabase/ssr` with cookie handlers. Both follow the same factory-function-with-env-guard pattern.

---

### `src/app/auth/callback/route.ts` (route, request-response)

**Analog:** `src/app/api/foundation/route.ts` (lines 1-29)

**Imports pattern:**
```typescript
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/env";
import { createFoundationSmokeRecord } from "@/server/foundation/createFoundationSmokeRecord";
```

**Core pattern — named HTTP method export, env check, service call, JSON response:**
```typescript
export async function POST() {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return NextResponse.json(
      { error: "Supabase env is not configured..." },
      { status: 503 },
    );
  }

  const payload = await createFoundationSmokeRecord();
  return NextResponse.json(payload);
}
```

**Apply:** Auth callback route should exchange code for session. Student unlock API routes should follow the same pattern with Zod input validation added.

---

### `src/components/auth/SignupForm.tsx`, `LoginForm.tsx`, `src/components/teacher/*`, `src/components/student/*` (component, request-response/CRUD)

**Analog:** `src/components/foundation/FoundationSmokePanel.tsx` (lines 1-109)

**Imports pattern:**
```typescript
"use client";

import { useEffect, useState } from "react";
import type { FoundationSmokeResponse } from "@/domain/foundation/schemas";
```

**Core pattern — discriminated union state, async handler, conditional rendering:**
```typescript
type SmokeState =
  | { status: "idle"; data?: undefined; error?: undefined }
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: FoundationSmokeResponse; error?: undefined }
  | { status: "setup"; data?: undefined; error: string }
  | { status: "error"; data?: undefined; error: string };
```

**Error handling — try/catch around fetch, instanceof Error check:**
```typescript
    } catch (error) {
      setSmokeState({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to create foundation smoke record",
      });
    }
```

**Apply:** Phase 2 components should use `react-hook-form` + `zodResolver` instead of raw `useState` for form state, but keep the discriminated union pattern for async operation states (loading/success/error). Use server actions instead of fetch where possible.

---

### `src/app/teacher/page.tsx`, `src/app/join/page.tsx`, etc. (page, CRUD/request-response)

**Analog:** `src/app/page.tsx` (lines 1-5)

**Core pattern — thin page that delegates to component:**
```typescript
import { FoundationSmokePanel } from "@/components/foundation/FoundationSmokePanel";

export default function Home() {
  return <FoundationSmokePanel />;
}
```

**Apply:** Teacher pages should be server components that call `requireTeacherProfile()` for auth, then render client components. Student pages are public server components that render client join/PIN forms.

---

### `src/lib/env.ts` (config, utility - modify)

**Analog:** self (lines 1-11)

**Core pattern — env accessor returning typed object with isConfigured flag:**
```typescript
export function getSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    isConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}
```

**Apply:** Add `pinPepper` field reading `PIN_HASH_PEPPER` env var. Keep the same accessor pattern.

---

### `tests/domain/roster-parser.test.ts`, `student-pin.test.ts` (test, transform)

**Analog:** `tests/domain/foundation-status.test.ts` (lines 1-94)

**Imports pattern:**
```typescript
import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STUDENT_STATUSES,
  assertTransitionRequest,
  canTransitionAssignmentStatus,
  shouldMarkMissed,
} from "@/domain/foundation/status";
```

**Core pattern — describe block, it.each for table-driven tests, clear assertion:**
```typescript
  it.each([
    ["assigned", "started"],
    ["assigned", "missed"],
    // ...
  ] as const)("allows legal transition %s -> %s", (previousStatus, nextStatus) => {
    expect(canTransitionAssignmentStatus(previousStatus, nextStatus)).toBe(true);
  });
```

**Apply:** Roster parser tests should use `it.each` for bulk paste cases (blank names, duplicates, whitespace). PIN tests should use `it.each` for valid/invalid PIN formats and hash/verify round-trips.

---

### `tests/schema/classroom-access-schema.test.ts` (test, CRUD)

**Analog:** `tests/schema/foundation-schema.test.ts` (lines 1-91)

**Core pattern — read migration SQL as string, assert structural properties:**
```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202606250001_foundation_schema.sql",
  "utf8",
).toLowerCase();

describe("foundation database migration", () => {
  it.each([
    "teacher_profiles",
    "classes",
    // ...
  ])("creates table %s", (tableName) => {
    expect(migration).toContain(`create table public.${tableName}`);
  });
```

**Apply:** Phase 2 schema test should read the new migration file and assert RLS policies exist for `classes`, `students`, `teacher_profiles`; assert `join_code` uniqueness constraint; assert `pin_hash` column presence; assert no plaintext PIN column.

---

### `supabase/migrations/202606250002_teacher_auth_rls.sql` (migration, CRUD)

**Analog:** `supabase/migrations/202606250001_foundation_schema.sql`

**Apply:** Follow the same migration style. Add RLS policies (`create policy`), helper functions for PIN verification, indexes on `join_code`, and any missing columns (`auth_user_id` on `teacher_profiles` if not already present). The foundation migration already uses `alter table ... enable row level security` on all tables.

---

## Shared Patterns

### Supabase Client Factory
**Source:** `src/lib/supabase/server.ts` lines 1-17
**Apply to:** All new Supabase client files (`browser.ts`, `server-auth.ts`, `middleware.ts`)
```typescript
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

export function createSupabaseServiceClient() {
  const env = getSupabaseEnv();
  if (!env.url || !env.serviceRoleKey) {
    throw new Error("Supabase service environment is not configured");
  }
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

### Zod Schema + Type Export
**Source:** `src/domain/foundation/schemas.ts` lines 1-12
**Apply to:** All domain schema files
```typescript
import { z } from "zod";

export const exampleSchema = z.object({ /* fields */ });
export type Example = z.infer<typeof exampleSchema>;
```

### Per-Query Error Check in Services
**Source:** `src/server/foundation/createFoundationSmokeRecord.ts` lines 19-21
**Apply to:** All server service files
```typescript
if (result.error) {
  throw new Error(`Unable to <action>: ${result.error.message}`);
}
```

### Pure Domain Functions
**Source:** `src/domain/foundation/status.ts` lines 1-104
**Apply to:** PIN helpers, roster parser, join-code generator
- Export const arrays and derive types with `typeof X[number]`
- Pure functions, no Supabase imports
- Throw descriptive errors on invalid input

### Test Structure
**Source:** `tests/domain/foundation-status.test.ts` lines 1-94
**Apply to:** All new test files
- `import { describe, expect, it } from "vitest";`
- `import` from `@/` path aliases
- `it.each` for table-driven test cases
- `as const` on test case arrays

### Migration Schema Tests
**Source:** `tests/schema/foundation-schema.test.ts` lines 1-91
**Apply to:** `tests/schema/classroom-access-schema.test.ts`
- Read migration SQL with `readFileSync`
- Assert structural properties with `.toContain()` and `.toMatch()`

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `middleware.ts` (root) | middleware | request-response | No Next.js middleware exists yet. Use `@supabase/ssr` docs pattern for token refresh proxy. RESEARCH.md Pattern 1 provides the reference. |

## Metadata

**Analog search scope:** `src/`, `supabase/`, `tests/`
**Files scanned:** 15 existing source/test files
**Pattern extraction date:** 2026-06-25
