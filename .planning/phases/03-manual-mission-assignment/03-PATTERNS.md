# Phase 03: Manual Mission Assignment - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/202606250005_mission_assign_rpc.sql` | migration | batch | `supabase/migrations/202606250002_teacher_auth_rls.sql` | role-match |
| `src/domain/mission/schemas.ts` | model | transform | `src/domain/classroom/schemas.ts` | exact |
| `src/server/mission/mission-service.ts` | service | CRUD | `src/server/classroom/class-service.ts` | exact |
| `src/server/mission/assign-service.ts` | service | request-response | `src/server/classroom/class-service.ts` | role-match |
| `src/app/teacher/missions/actions.ts` | controller | request-response | `src/app/teacher/classes/actions.ts` | exact |
| `src/app/teacher/missions/page.tsx` | route | request-response | `src/app/teacher/page.tsx` | exact |
| `src/app/teacher/missions/new/page.tsx` | route | request-response | `src/app/teacher/page.tsx` | role-match |
| `src/app/teacher/missions/[id]/page.tsx` | route | request-response | `src/app/teacher/page.tsx` | role-match |
| `src/components/teacher/MissionList.tsx` | component | CRUD | `src/components/teacher/ClassList.tsx` | exact |
| `src/components/teacher/MissionForm.tsx` | component | CRUD | `src/components/teacher/ClassForm.tsx` | role-match |
| `src/components/teacher/TurnEditor.tsx` | component | CRUD | `src/components/teacher/ClassForm.tsx` | role-match |
| `src/components/teacher/AssignDialog.tsx` | component | request-response | `src/components/teacher/ShareClassDialog.tsx` | exact |
| `src/lib/db/types.ts` | model | transform | (self — extend existing) | exact |
| `src/app/teacher/page.tsx` | route | request-response | (self — add nav row) | exact |

## Pattern Assignments

### `src/app/teacher/missions/actions.ts` (controller, request-response)

**Analog:** `src/app/teacher/classes/actions.ts`

**Imports pattern** (lines 1-14):
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  createClassSchema,
  updateClassSchema,
} from "@/domain/classroom/schemas";
import {
  archiveClass,
  createClass,
  resetJoinCode,
  updateClass,
} from "@/server/classroom/class-service";
```

**Result type pattern** (lines 16-23):
```typescript
const GENERIC_FAILURE =
  "We could not complete that action. Check the details and try again.";

export type ClassActionResult =
  | { ok: true; joinCode?: string }
  | { ok: false; error: string };
```

**Core action pattern** (lines 27-50):
```typescript
export async function createClassAction(
  formData: FormData,
): Promise<ClassActionResult> {
  const profile = await requireTeacherProfile();

  const parsed = createClassSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }

  try {
    await createClass({ teacherId: profile.id, name: parsed.data.name });
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath("/teacher");
  return { ok: true };
}
```

**Note for mission actions:** The mission form sends turns as a JSON-serialized array in a single FormData field (not flat `turn_0_prompt` etc). The action parses it with `JSON.parse(formData.get("turns"))` before Zod validation. Alternatively, accept a plain object payload instead of FormData for the mission create/edit actions since the form already needs to serialize complex nested data.

---

### `src/domain/mission/schemas.ts` (model, transform)

**Analog:** `src/domain/classroom/schemas.ts`

**Imports + schema pattern** (lines 1-2, 48-69):
```typescript
import { z } from "zod";

// Class creation: name only (CLASS-01). Join code is generated server-side and
// is never client-supplied (it is a system-owned class locator).
export const createClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a class name.")
    .max(80, "Class name is too long."),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
```

**Key conventions:**
- Each schema has a companion `type` export via `z.infer<>`
- Validation messages are user-facing copy (imperative, sentence-cased, period-terminated)
- `.trim()` on all string fields
- Comments document the business rule each schema enforces

---

### `src/server/mission/mission-service.ts` (service, CRUD)

**Analog:** `src/server/classroom/class-service.ts`

**Imports + client pattern** (lines 1-2):
```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { generateJoinCode } from "@/domain/classroom/join-code";
```

**Return type pattern** (lines 14-19):
```typescript
export type TeacherClass = {
  id: string;
  name: string;
  joinCode: string | null;
  rosterCount: number;
};
```

**Insert pattern** (lines 31-63):
```typescript
export async function createClass(input: {
  teacherId: string;
  name: string;
}): Promise<TeacherClass> {
  const supabase = await createSupabaseServerClient();

  // ... insert with .select().single()
  const inserted = await supabase
    .from("classes")
    .insert({
      teacher_id: input.teacherId,
      name: input.name,
      join_code: joinCode,
      data_mode: "real",
    })
    .select("id, name, join_code")
    .single();

  if (!inserted.error) {
    return { /* mapped result */ };
  }
  // On error: throw new Error(`Unable to create class: ${inserted.error.message}`);
}
```

**Error handling convention:** Check `.error` on every Supabase response, throw `new Error("Unable to <verb>: ${error.message}")`. Never swallow errors silently.

**List query pattern** (lines 136-182):
```typescript
export async function listClassesForTeacher(input: {
  teacherId: string;
}): Promise<TeacherClass[]> {
  const supabase = await createSupabaseServerClient();

  const classes = await supabase
    .from("classes")
    .select("id, name, join_code")
    .eq("teacher_id", input.teacherId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (classes.error) {
    throw new Error(`Unable to list classes: ${classes.error.message}`);
  }
  // ... map and return
}
```

---

### `src/server/mission/assign-service.ts` (service, request-response)

**Analog:** `src/server/classroom/class-service.ts` (same client/error patterns) + RPC call is new

The assign service reads live mission+turns, builds the snapshot, validates with `missionSnapshotSchema`, then calls `supabase.rpc("assign_mission_to_class", { ... })`. Follow the same `createSupabaseServerClient()` + error-throw pattern. The RPC function name and params are defined in the migration.

---

### `supabase/migrations/202606250005_mission_assign_rpc.sql` (migration, batch)

**Analog:** `supabase/migrations/202606250002_teacher_auth_rls.sql` (SECURITY DEFINER pattern)

**SECURITY DEFINER function pattern** (lines 16-26):
```sql
create or replace function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.teacher_profiles p
  where p.auth_user_id = (select auth.uid())
$$;
```

**Ownership check pattern** (lines 29-42):
```sql
create or replace function public.is_class_owner(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;
```

**GRANT pattern** from `202606250003_grant_authenticated_privileges.sql` (lines 22-23):
```sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.classes to authenticated;
```

**Critical:** The new RPC function MUST include `GRANT EXECUTE ON FUNCTION public.assign_mission_to_class TO authenticated;` in the same migration. Without it, the RPC call will fail with `permission denied for function` (SQLSTATE 42501).

---

### `src/components/teacher/MissionList.tsx` (component, CRUD)

**Analog:** `src/components/teacher/ClassList.tsx`

**Component structure** (lines 1-9, 26-27):
```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import type { TeacherClass } from "@/server/classroom/class-service";
import { archiveClassAction } from "@/app/teacher/classes/actions";
import { ClassForm } from "@/components/teacher/ClassForm";
import { ShareClassDialog } from "@/components/teacher/ShareClassDialog";

export function ClassList({ classes }: ClassListProps) {
```

**Dialog state union pattern** (lines 14-19):
```typescript
type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; classId: string; name: string }
  | { kind: "share"; classId: string; name: string; joinCode: string | null }
  | { kind: "archive"; classId: string; name: string };
```

**Empty state pattern** (lines 73-89):
```typescript
<section
  aria-label="Class list"
  style={{
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: 48,
    textAlign: "center",
  }}
>
  <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
    No classes yet
  </h2>
  <p style={{ fontSize: 16, lineHeight: 1.5, color: "#4B5563", margin: "8px 0 0" }}>
    Create your first class to add students and share a join code.
  </p>
</section>
```

**Row pattern** (lines 100-113):
```typescript
<div
  key={classItem.id}
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 16,
    minHeight: 64,
    borderTop: index === 0 ? "none" : "1px solid #E5E7EB",
    flexWrap: "wrap",
  }}
>
```

**Style constant pattern** (lines 254-306):
```typescript
const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
  minHeight: 44,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  width: "100%",
  maxWidth: 400,
};
```

---

### `src/components/teacher/MissionForm.tsx` (component, CRUD)

**Analog:** `src/components/teacher/ClassForm.tsx`

**Form dialog pattern** (lines 20-109):
```typescript
export function ClassForm({ classId, initialName, onClose }: ClassFormProps) {
  const isEditing = typeof classId === "string";
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    // ... call server action, check result
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="..." style={overlayStyle}>
      <div style={panelStyle}>
        <form action={handleSubmit}>
          <label htmlFor="..." style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
            ...
          </label>
          <input
            id="..."
            name="..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            aria-describedby={error ? "...-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p id="...-error" role="alert" style={{ fontSize: 14, color: "#B42318" }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
            <button type="submit" disabled={submitting} style={primaryButtonStyle}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Input style** (lines 139-147):
```typescript
const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  fontSize: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  boxSizing: "border-box",
};
```

**Note:** MissionForm is a full-page form (not a modal dialog), unlike ClassForm. But the input/label/error/button patterns and style constants are identical. The MissionForm is a `"use client"` component embedded in a server-rendered page.

---

### `src/components/teacher/AssignDialog.tsx` (component, request-response)

**Analog:** `src/components/teacher/ClassForm.tsx` (modal dialog) + `src/components/teacher/ClassList.tsx` (overlay/panel styles)

Same overlay, panel, close-on-Escape, aria-modal pattern. The dialog body adds a `<select>` for class, a student count display, and an optional date input.

---

### `src/app/teacher/missions/page.tsx` (route, SSR)

**Analog:** `src/app/teacher/page.tsx`

**SSR page pattern** (lines 1-67):
```typescript
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listClassesForTeacher } from "@/server/classroom/class-service";
import { ClassList } from "@/components/teacher/ClassList";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const profile = await requireTeacherProfile();
  const classes = await listClassesForTeacher({ teacherId: profile.id });

  return (
    <div style={{ minHeight: "100dvh", background: "#F7F8FA", fontFamily: "Inter, ..." }}>
      <header style={{ height: 56, /* ... */ }}>
        {/* top bar */}
      </header>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <ClassList classes={classes} />
      </main>
    </div>
  );
}
```

**Key:** `export const dynamic = "force-dynamic"` is required on all authenticated pages.

---

### `src/app/teacher/page.tsx` (modification: add nav row)

Add a navigation row between the `<header>` and `<main>` with two links: "Classes" (href `/teacher`) and "Missions" (href `/teacher/missions`). Use the same inline style conventions. The missions page should replicate this nav row.

---

### `src/lib/db/types.ts` (modification: extend existing)

Add the `assign_mission_to_class` RPC function signature to `Database.public.Functions` so the typed Supabase client recognizes `supabase.rpc("assign_mission_to_class", ...)`. Also ensure `missions.Row` includes all columns (`target_pattern`, `topic`, `level`, `required_turns` are in `Insert` but missing from `Row`).

---

## Shared Patterns

### Authentication
**Source:** `src/server/auth/teacher-profile.ts` (called via `requireTeacherProfile()`)
**Apply to:** All server actions, all SSR page components

Every server action starts with `const profile = await requireTeacherProfile();` and uses `profile.id` as the teacher identity. Every SSR page does the same for data fetching.

### Error Handling
**Source:** `src/app/teacher/classes/actions.ts` lines 16-18
**Apply to:** All server actions
```typescript
const GENERIC_FAILURE =
  "We could not complete that action. Check the details and try again.";
```
- Zod validation errors: return the first issue message
- Service/RLS errors: catch and return `GENERIC_FAILURE` (never leak DB details)
- Result type: `{ ok: true; ... } | { ok: false; error: string }`

### Inline Styles
**Source:** `src/components/teacher/ClassList.tsx` lines 254-306
**Apply to:** All new components
- All styles as `React.CSSProperties` constants at bottom of file
- Colors: primary `#2563EB`, destructive `#B42318`, text `#111827`, secondary text `#4B5563`, border `#D1D5DB`, soft border `#E5E7EB`, background `#F7F8FA`, surface `#FFFFFF`
- No Tailwind, no CSS files, no shadcn

### Supabase Client
**Source:** `src/lib/supabase/server-auth.ts`
**Apply to:** All service files
```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
```
Always use the RLS-bound user client, never the service-role client, for teacher-initiated writes.

### Revalidation
**Source:** `src/app/teacher/classes/actions.ts` line 48
**Apply to:** All mutation server actions
```typescript
revalidatePath("/teacher");
```
Call `revalidatePath` after every successful mutation to bust Next.js cache.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/teacher/TurnEditor.tsx` | component | CRUD | No dynamic repeating sub-form exists yet. Use controlled `useState<TurnDraft[]>` with add/remove/update helpers. Follow ClassForm's input/label/error style patterns for each field. |

The turn editor is the only genuinely new UI pattern. All other files have strong analogs in the Phase 2 codebase.

## Metadata

**Analog search scope:** `src/app/teacher/`, `src/server/`, `src/domain/`, `src/components/teacher/`, `src/lib/`, `supabase/migrations/`
**Files scanned:** 12
**Pattern extraction date:** 2026-06-26
