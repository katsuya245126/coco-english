# Logical Parent Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the teacher student-profile back control return to the owning class’s Students tab while preserving every existing logical-parent link.

**Architecture:** Extend the existing RLS-scoped student header result with `classId`, then build the parent route directly in the server-rendered profile page. Guard the route and label with the project’s existing source-contract test style; no client navigation state or new route is required.

**Tech Stack:** Next.js 15 App Router, React 19 server components, TypeScript 5.7, Supabase, Vitest 3.

## Global Constraints

- Back controls return to stable logical parents, not browser history.
- The student-profile destination is `/teacher/classes/{classId}/students`.
- The control label is `← Back to students`.
- Keep the profile as a server component using a normal Next.js `Link`.
- Do not add client-side state, `router.back()`, a `returnTo` parameter, a nested profile route, new dependencies, or unrelated navigation changes.
- Preserve all pre-existing worktree changes and commit only files changed for this fix.
- Keep `.planning/STATE.md` YAML and prose Current Position consistent in the implementation commit.

---

## File Map

- Modify `tests/server/teacher-workspace-ui.test.ts`: lock the roster entry route, student header parent identifier, profile destination, and truthful link label.
- Modify `src/server/teacher/student-profile.ts`: include the owning `class_id` in `StudentProfileHeader` through the existing authenticated query.
- Modify `src/app/teacher/students/[id]/page.tsx`: replace the stale global-inbox link with the class Students parent link.
- Modify `.planning/STATE.md`: record the verified navigation fix without changing phase completion or roadmap checkboxes.

### Task 1: Return the student profile to its class Students tab

**Files:**

- Modify: `tests/server/teacher-workspace-ui.test.ts` inside `teacher workspace source contract`
- Modify: `src/server/teacher/student-profile.ts:85-123`
- Modify: `src/app/teacher/students/[id]/page.tsx:46-51`
- Modify: `.planning/STATE.md` YAML header and matching Current Position/session-continuity prose

**Interfaces:**

- Consumes: `getStudentProfileHeader(studentId: string): Promise<StudentProfileHeader | null>` and the existing `students.class_id` foreign key.
- Produces: `StudentProfileHeader` with `classId: string`; the profile page uses `header.classId` to render `/teacher/classes/${header.classId}/students`.

- [ ] **Step 1: Write the failing navigation contract test**

Add this test inside the existing `describe("teacher workspace source contract", ...)` block in `tests/server/teacher-workspace-ui.test.ts`:

```ts
it("returns a student profile to the owning class Students tab", () => {
  const roster = source(
    "src/app/teacher/classes/[id]/(workspace)/students/page.tsx",
  );
  const profile = source("src/app/teacher/students/[id]/page.tsx");
  const profileData = source("src/server/teacher/student-profile.ts");

  expect(roster).toContain('href={`/teacher/students/${student.id}`}');
  expect(profileData).toContain("classId: string;");
  expect(profileData).toContain(
    '.select("id, class_id, display_name, classes!inner(name)")',
  );
  expect(profileData).toContain("class_id: string;");
  expect(profileData).toContain("classId: row.class_id,");
  expect(profile).toContain(
    'href={`/teacher/classes/${header.classId}/students`}',
  );
  expect(profile).toContain("← Back to students");
  expect(profile).not.toContain('href="/teacher"');
  expect(profile).not.toContain("← Classes");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- --run tests/server/teacher-workspace-ui.test.ts
```

Expected: FAIL in `returns a student profile to the owning class Students tab` because `student-profile.ts` does not yet contain `classId: string;`. Existing tests should remain green.

- [ ] **Step 3: Add the owning class identifier to the existing student header result**

Change the relevant portion of `src/server/teacher/student-profile.ts` to:

```ts
export type StudentProfileHeader = {
  studentId: string;
  classId: string;
  displayName: string;
  className: string;
};

export async function getStudentProfileHeader(
  studentId: string,
): Promise<StudentProfileHeader | null> {
  const supabase = await createSupabaseServerClient();

  const student = await supabase
    .from("students")
    .select("id, class_id, display_name, classes!inner(name)")
    .eq("id", studentId)
    .maybeSingle();

  if (student.error) {
    throw new Error(`Unable to load student: ${student.error.message}`);
  }
  if (!student.data) return null;

  const row = student.data as unknown as {
    id: string;
    class_id: string;
    display_name: string;
    classes: { name: string } | { name: string }[] | null;
  };
  const className = one(row.classes)?.name ?? "";

  return {
    studentId: row.id,
    classId: row.class_id,
    displayName: row.display_name,
    className,
  };
}
```

This extends the current RLS-scoped query; do not add a second database request or accept a class identifier from the URL.

- [ ] **Step 4: Point the profile back control at the class Students tab**

Replace only the existing `Link` destination and copy in `src/app/teacher/students/[id]/page.tsx`:

```tsx
<Link
  href={`/teacher/classes/${header.classId}/students`}
  style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
>
  ← Back to students
</Link>
```

- [ ] **Step 5: Run focused verification and confirm GREEN**

Run:

```bash
npm test -- --run tests/server/teacher-workspace-ui.test.ts tests/server/student-profile.test.ts
npm run typecheck
```

Expected: both Vitest files pass and TypeScript exits with code 0.

- [ ] **Step 6: Inspect the navigation diff and verify scope**

Run:

```bash
git diff --check
git diff -- tests/server/teacher-workspace-ui.test.ts src/server/teacher/student-profile.ts 'src/app/teacher/students/[id]/page.tsx'
```

Expected: no whitespace errors; the product diff contains one regression test, one added header field/query projection, and one corrected link. There are no edits to assignment evidence, class settings, student history, styling, or unrelated dirty files.

- [ ] **Step 7: Record truthful GSD state**

Read the current timestamp with `date -Iseconds`, then update both the `.planning/STATE.md` YAML and prose to say `Logical-parent back navigation implemented and verified`. Keep `current_phase: 10.1`, `status: planning`, the Phase 10.1 roadmap checkbox state, and the existing next action for Phase 10.1 gap planning unchanged. Set the session resume file back to `.planning/phases/10.1-assignment-operations-student-history/10.1-UI-SPEC.md` after the fix is complete.

Run:

```bash
git diff --check -- .planning/STATE.md
rg -n "stopped_at:|last_updated:|last_activity_desc:|Status:|Last activity:|Resume file:|Last session:|Stopped at:" .planning/STATE.md
```

Expected: the YAML and prose describe the same completed navigation fix, while phase and status remain `10.1` and `planning`.

- [ ] **Step 8: Commit only the fix and its GSD state**

Run:

```bash
git add -- tests/server/teacher-workspace-ui.test.ts src/server/teacher/student-profile.ts 'src/app/teacher/students/[id]/page.tsx' .planning/STATE.md
git diff --cached --check
git diff --cached --stat
git commit -m "fix: return student profile to class roster"
```

Expected: one commit containing exactly the three implementation/test files plus `.planning/STATE.md`; the user-owned verification report, `.codex/`, `.superpowers/`, and `scripts/cleanup-test-data.mjs` remain uncommitted.
