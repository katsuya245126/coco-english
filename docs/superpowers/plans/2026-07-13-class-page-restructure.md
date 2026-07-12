# Class Page Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the class review-policy feature, fix the teacher-workspace FOUC, split the class page into separate Needs review / Assignments / Students pages under a shared tabbed layout, fix the Class Settings back link, and add per-assignment progress (counts + bar) to assignment cards.

**Architecture:** Next.js 15 App Router. The class workspace becomes a `(workspace)` route group under `src/app/teacher/classes/[id]/` so a nested layout provides the class header + tab bar to the three tab pages **without** wrapping the existing `manage/` and `review/[assignmentId]/` routes. Per-request data dedup between layout and pages uses `React.cache()`. Styles move from a client styled-jsx component to a real CSS file imported by the teacher layout.

**Tech Stack:** Next.js 15 (App Router, server components), Supabase JS, Vitest (unit + source-contract tests), Playwright source-contract spec.

**Spec:** `docs/superpowers/specs/2026-07-13-class-page-restructure-design.md`

## Global Constraints

- Branch: create `feature/class-page-restructure` from `main` before Task 1; all commits land there.
- No new npm dependencies.
- No DB migration. `classes.review_policy` column stays in the DB but the app never reads or writes it again.
- All teacher pages keep `export const dynamic = "force-dynamic";`.
- Test conventions: this repo uses "source contract" tests (`readFileSync` + string assertions) for UI, tiny hand-rolled mock clients for server functions, plain unit tests for domain logic. Follow them; do not add testing libraries.
- Unit test runner: `npx vitest run <file>` (`npm test` is watch mode — never use it).
- Gates that must stay green after every task: `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` (zero errors; one pre-existing warning in `scripts/check-student-feedback-states.mjs` is allowed).
- Copy rules: tab labels are exactly `Needs review`, `Assignments`, `Students`, `Class settings`. Breakdown labels are exactly `awaiting review`, `needs retry`, `in progress`, `not started`, `missed`. Back link text is exactly `← Back to class`.

---

### Task 1: Remove review policy end-to-end

The `flagged_only` mode silently hides unflagged submissions. Remove the policy from domain logic, server operations, server actions, and UI in one pass (they are import-coupled; partial removal doesn't compile).

**Files:**
- Modify: `tests/domain/assignment-operations.test.ts:9-28`
- Modify: `src/domain/teacher/assignment-operations.ts:1-16`
- Modify: `src/server/teacher/assignment-operations.ts` (imports, `mapRow`, `loadOwnedAttempts`, `listNeedsReviewForTeacher`, `listActivityForTeacher`; delete `updateClassReviewPolicy`)
- Modify: `tests/server/teacher-assignment-operations.test.ts`
- Modify: `src/app/teacher/assignment-actions.ts` (drop policy action + imports)
- Delete: `src/components/teacher/ClassReviewPolicyControl.tsx`
- Modify: `src/components/teacher/ClassReviewWorkspace.tsx` (drop control + policy copy + prop)
- Modify: `src/app/teacher/classes/[id]/page.tsx` (drop `review_policy` from select + prop)
- Modify: `tests/server/teacher-workspace-ui.test.ts:117-131`
- Modify: `tests/e2e/teacher-assignment-operations.spec.ts:7-16`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isSubmissionPendingReview(input: { isLatestAttempt: boolean; reviewedAt: string | null; status: "completed" | "teacher_review" | "started" | "assigned" | "missed" | "needs_retry"; attemptStatus: string }): boolean` — no `reviewPolicy`, no `needsReviewReason`. `ClassReviewPolicy` type and `updateClassReviewPolicy`/`updateClassReviewPolicyAction` no longer exist. `TeacherReviewRow` unchanged in this task.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git checkout -b feature/class-page-restructure
```

- [ ] **Step 2: Rewrite the domain test to drop policy inputs**

Replace the whole `describe("isSubmissionPendingReview", ...)` block (lines 9–28) of `tests/domain/assignment-operations.test.ts` with:

```ts
describe("isSubmissionPendingReview", () => {
  it("requires the latest attempt and an unreviewed receipt", () => {
    expect(isSubmissionPendingReview({ isLatestAttempt: false, reviewedAt: null, status: "completed", attemptStatus: "completed" })).toBe(false);
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: "2026-01-01", status: "completed", attemptStatus: "completed" })).toBe(false);
  });

  it("includes every completed or in-review submission", () => {
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, status: "completed", attemptStatus: "completed" })).toBe(true);
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, status: "teacher_review", attemptStatus: "teacher_review" })).toBe(true);
  });

  it("excludes in-progress attempts", () => {
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, status: "started", attemptStatus: "in_progress" })).toBe(false);
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, status: "completed", attemptStatus: "in_progress" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the domain test to verify it fails**

Run: `npx vitest run tests/domain/assignment-operations.test.ts`
Expected: FAIL — TypeScript object-literal errors (extra/missing properties vs `ReviewEligibilityInput`).

- [ ] **Step 4: Simplify the domain module**

In `src/domain/teacher/assignment-operations.ts` replace lines 1–16 with:

```ts
export type ReviewEligibilityInput = {
  isLatestAttempt: boolean;
  reviewedAt: string | null;
  status: "completed" | "teacher_review" | "started" | "assigned" | "missed" | "needs_retry";
  attemptStatus: string;
};

export function isSubmissionPendingReview(input: ReviewEligibilityInput): boolean {
  if (!input.isLatestAttempt || input.reviewedAt !== null) return false;
  return ["completed", "teacher_review"].includes(input.status) && ["completed", "teacher_review"].includes(input.attemptStatus);
}
```

(The `ClassReviewPolicy` type and the `needsReviewReason`/`reviewPolicy` fields are deleted. `export type ClassReviewPolicy` must not remain anywhere in the file.)

- [ ] **Step 5: Run the domain test to verify it passes**

Run: `npx vitest run tests/domain/assignment-operations.test.ts`
Expected: PASS.

- [ ] **Step 6: Update server operations**

In `src/server/teacher/assignment-operations.ts`:

1. In the imports from `@/domain/teacher/assignment-operations`, remove `type ClassReviewPolicy`.
2. In `mapRow` (line 40): change the return type to `TeacherReviewRow & { status: AssignmentStudentStatus; attemptStatus: string; reviewedAt: string | null; isLatestAttempt: boolean }` and delete the `reviewPolicy: klass.review_policy as ClassReviewPolicy,` line from the returned object.
3. In `loadOwnedAttempts` (line 63): in the select string change `classes!inner(id, name, teacher_id, review_policy)` to `classes!inner(id, name, teacher_id)`.
4. In `listNeedsReviewForTeacher` (line 78): change the strip-destructure to `({ status: _s, attemptStatus: _a, reviewedAt: _r, isLatestAttempt: _l, ...row }) => row`.
5. In `listActivityForTeacher` (line 83): change the strip-destructure to `({ isLatestAttempt: _l, attemptStatus: _a, ...row }) => row`.
6. Delete the whole `updateClassReviewPolicy` function (lines 173–176).

- [ ] **Step 7: Update the server test**

In `tests/server/teacher-assignment-operations.test.ts`:

1. In `ownedRow`, change `classes: { name: "A", review_policy: "every_submission" }` to `classes: { name: "A" }`.
2. Replace the `"uses durable flagged origin in flagged-only classes"` test (lines 23–26) with:

```ts
  it("includes ordinary completions without any policy gate", async () => {
    const row = ownedRow({ needs_review_reason: null });
    expect(await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([row]))).toHaveLength(1);
  });
```

- [ ] **Step 8: Remove the server action and the control**

1. In `src/app/teacher/assignment-actions.ts`: delete `updateClassReviewPolicy,` from the import list, delete the `import type { ClassReviewPolicy } ...` line, and delete the whole `updateClassReviewPolicyAction` function (line 19).
2. `git rm src/components/teacher/ClassReviewPolicyControl.tsx`

- [ ] **Step 9: Strip policy from the workspace component and page**

1. In `src/components/teacher/ClassReviewWorkspace.tsx`:
   - Delete `import { ClassReviewPolicyControl } from "@/components/teacher/ClassReviewPolicyControl";`
   - Delete `import type { ClassReviewPolicy } from "@/domain/teacher/assignment-operations";`
   - In the props type, remove `reviewPolicy: ClassReviewPolicy;` and remove `reviewPolicy` from the destructured parameters.
   - Change the subtitle `<p>` to `<p>{students.length} active student{students.length === 1 ? "" : "s"}</p>` (drop the ` · {reviewPolicy === ...}` clause).
   - Delete the `<ClassReviewPolicyControl classId={classId} value={reviewPolicy}/>` element.
2. In `src/app/teacher/classes/[id]/page.tsx`:
   - Change the class select to `.select("id, name, join_code")`.
   - Remove the `reviewPolicy={ownedClass.review_policy}` prop from `<ClassReviewWorkspace ...>`.

- [ ] **Step 10: Update the two source-contract tests**

1. In `tests/server/teacher-workspace-ui.test.ts`, replace the `"renders the approved class review workspace without a nested legacy shell"` test (lines 117–131) with:

```ts
  it("renders the approved class review workspace without a nested legacy shell", () => {
    const page = source("src/app/teacher/classes/[id]/page.tsx");
    const workspace = source("src/components/teacher/ClassReviewWorkspace.tsx");
    expect(page).toContain("<ClassReviewWorkspace");
    expect(page).not.toContain('minHeight: "100dvh"');
    expect(page).not.toContain("<header");
    for (const label of ["Assignment Review", "Needs review", "Assignments", "Students", "Class settings"]) expect(workspace).toContain(label);
    expect(workspace).not.toContain("All activity");
    expect(workspace).not.toContain("ClassReviewPolicyControl");
    expect(workspace).toContain("class-review-header");
    expect(workspace).toContain("class-workspace-tabs");
    expect(workspace).toContain("class-assignment-card");
    expect(workspace).toContain("class-student-card");
  });
```

2. In `tests/e2e/teacher-assignment-operations.spec.ts`, replace the first test (lines 7–16) with:

```ts
test("class workspace exposes the focused queue without a review-policy control", () => {
  const page = source("src/app/teacher/classes/[id]/page.tsx");
  const workspace = source("src/components/teacher/ClassReviewWorkspace.tsx");
  expect(page).toContain("ClassReviewWorkspace");
  expect(workspace).toContain("TeacherReviewTable");
  for (const label of ["Needs review", "Assignments", "Students", "Class settings"]) expect(workspace).toContain(label);
  expect(workspace).not.toContain("ClassReviewPolicyControl");
});
```

- [ ] **Step 11: Run gates**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all pass (the pre-existing `scripts/check-student-feedback-states.mjs` warning is OK). If `grep -rn "ClassReviewPolicy\|review_policy" src/` returns anything, you missed a spot (CSS classes named `review-policy-control` in `TeacherWorkspaceStyles.tsx` are cleaned up in Task 3 — those are the only allowed hits).

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat: remove class review-policy; queue always reviews every submission"
```

---

### Task 2: Expose classId on TeacherReviewRow

The class page currently filters review rows with a fragile `className` string match. Add the class id so Task 4 can filter by id.

**Files:**
- Modify: `tests/server/teacher-assignment-operations.test.ts`
- Modify: `src/server/teacher/assignment-operations.ts:13-17` (type) and `mapRow`

**Interfaces:**
- Consumes: Task 1's cleaned `mapRow`.
- Produces: `TeacherReviewRow` gains `classId: string` (populated from the joined class row). Task 4 filters with `row.classId === classId`.

- [ ] **Step 1: Write the failing test**

Add inside `describe("teacher assignment reads", ...)` in `tests/server/teacher-assignment-operations.test.ts`, and add `id: "c-1", ` to the fixture's class object so it reads `classes: { id: "c-1", name: "A" }`:

```ts
  it("exposes the owning class id for class-scoped filtering", async () => {
    const rows = await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([ownedRow()]));
    expect(rows[0].classId).toBe("c-1");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/teacher-assignment-operations.test.ts`
Expected: FAIL — `classId` is `undefined` / not on the type.

- [ ] **Step 3: Implement**

In `src/server/teacher/assignment-operations.ts`:

1. Add `classId: string;` to the `TeacherReviewRow` type (after `className: string;`).
2. In `mapRow`'s returned object add `classId: String(klass.id),` next to `className`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/teacher-assignment-operations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): expose classId on teacher review rows"
```

---

### Task 3: Fix FOUC — move workspace CSS into a real stylesheet

`TeacherWorkspaceStyles.tsx` is a `"use client"` styled-jsx component, so its CSS applies only after hydration; refreshes flash unstyled HTML. Move the CSS verbatim into a `.css` file imported by the server layout.

**Files:**
- Create: `src/app/teacher/teacher-workspace.css`
- Modify: `src/app/teacher/layout.tsx`
- Delete: `src/components/teacher/TeacherWorkspaceStyles.tsx`
- Modify: `tests/server/teacher-workspace-ui.test.ts:46-55` and `:57-79`

**Interfaces:**
- Consumes: nothing.
- Produces: `src/app/teacher/teacher-workspace.css` — Tasks 4 and 7 append selectors to this file. All existing `.teacher-shell ...` class names keep working unchanged.

- [ ] **Step 1: Update the source-contract tests first (they define done)**

In `tests/server/teacher-workspace-ui.test.ts`:

1. Replace the `"applies prototype shell styles globally so Next links stay styled"` test (lines 46–55) with:

```ts
  it("ships shell styles as a real stylesheet in the layout (no styled-jsx FOUC)", () => {
    const layout = source("src/app/teacher/layout.tsx");
    const styles = source("src/app/teacher/teacher-workspace.css");
    expect(layout).toContain('import "./teacher-workspace.css"');
    expect(layout).not.toContain("TeacherWorkspaceStyles");
    expect(styles).toContain("grid-template-columns: 210px minmax(0, 1fr)");
    expect(styles).toContain(".teacher-shell .nav.active");
    expect(styles).toContain(".teacher-shell .count");
    expect(styles).toContain("@media (max-width: 800px)");
    expect(styles).not.toContain("review-policy-control");
  });
```

2. In the `"reveals overflowing class names and uses notification badges"` test (line 60), change `const styles = source("src/components/teacher/TeacherWorkspaceStyles.tsx");` to `const styles = source("src/app/teacher/teacher-workspace.css");`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: FAIL — `teacher-workspace.css` does not exist.

- [ ] **Step 3: Create the stylesheet**

Create `src/app/teacher/teacher-workspace.css` by copying **everything between the backticks** of the template literal in `src/components/teacher/TeacherWorkspaceStyles.tsx` (from `.teacher-shell { min-height: 100dvh; ...` through the closing brace of the `prefers-reduced-motion` block), then delete these three now-dead policy rules from the copy:

- the `.teacher-shell .review-policy-control { ... }` rule
- the `.teacher-shell .review-policy-control select { ... }` rule
- the `.teacher-shell .review-policy-control { min-width: 0; width: 100%; }` line inside `@media (max-width: 800px)`

Everything else is verbatim — do not reformat, rename, or "improve" any selector.

- [ ] **Step 4: Import in the layout and delete the component**

1. In `src/app/teacher/layout.tsx`: add `import "./teacher-workspace.css";` as the first import, delete the `TeacherWorkspaceStyles` import, and change the return to drop the fragment: `return <TeacherWorkspaceShell ...>{children}</TeacherWorkspaceShell>;`
2. `git rm src/components/teacher/TeacherWorkspaceStyles.tsx`

- [ ] **Step 5: Run gates**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix: ship teacher workspace CSS in initial HTML to kill refresh FOUC"
```

---

### Task 4: Split the class page into three pages under a (workspace) route group

A route group keeps the new tabbed layout off the existing `manage/` and `review/[assignmentId]/` routes (their URLs and standalone layouts must not change).

**Files:**
- Create: `src/app/teacher/classes/[id]/(workspace)/layout.tsx`
- Create: `src/components/teacher/ClassWorkspaceTabs.tsx`
- Create: `src/server/teacher/class-workspace-data.ts`
- Create: `src/app/teacher/classes/[id]/(workspace)/page.tsx` (move+rewrite of the old `[id]/page.tsx`)
- Create: `src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx`
- Create: `src/app/teacher/classes/[id]/(workspace)/students/page.tsx`
- Delete: `src/app/teacher/classes/[id]/page.tsx`
- Delete: `src/components/teacher/ClassReviewWorkspace.tsx`
- Modify: `tests/server/teacher-workspace-ui.test.ts` (the workspace test), `tests/e2e/teacher-assignment-operations.spec.ts` (first test)

**Interfaces:**
- Consumes: `TeacherReviewRow.classId` (Task 2); `TeacherReviewTable` props `{ rows, classes, scoped }` from `@/components/teacher/TeacherQueueViews`; `listRoster(classId)` from `@/server/classroom/roster-service` returning `{ id: string; displayName: string }[]`.
- Produces: `getOwnedClass(classId): Promise<{ id: string; name: string; join_code: string | null }>` (404s on missing/foreign class), `getClassRoster(classId)`, `getNeedsReviewRows(teacherId)` — all `React.cache()`-wrapped in `class-workspace-data.ts`. Routes `/teacher/classes/[id]`, `/teacher/classes/[id]/assignments`, `/teacher/classes/[id]/students`. Task 7 modifies `(workspace)/assignments/page.tsx`.

- [ ] **Step 1: Update the source-contract tests first**

1. In `tests/server/teacher-workspace-ui.test.ts`, replace the `"renders the approved class review workspace without a nested legacy shell"` test (as rewritten in Task 1) with:

```ts
  it("renders the class workspace as separate pages under a shared tabbed layout", () => {
    const layout = source("src/app/teacher/classes/[id]/(workspace)/layout.tsx");
    const tabs = source("src/components/teacher/ClassWorkspaceTabs.tsx");
    const review = source("src/app/teacher/classes/[id]/(workspace)/page.tsx");
    const assignments = source("src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx");
    const students = source("src/app/teacher/classes/[id]/(workspace)/students/page.tsx");
    expect(layout).toContain("class-review-header");
    expect(layout).toContain("<ClassWorkspaceTabs");
    expect(layout).not.toContain("review_policy");
    for (const label of ["Needs review", "Assignments", "Students", "Class settings"]) expect(tabs).toContain(label);
    expect(tabs).toContain("usePathname");
    expect(review).toContain("TeacherReviewTable");
    expect(review).toContain("row.classId === classId");
    expect(assignments).toContain("class-assignment-card");
    expect(students).toContain("class-student-card");
  });
```

2. In `tests/e2e/teacher-assignment-operations.spec.ts`, replace the first test (as rewritten in Task 1) with:

```ts
test("class workspace splits queue, assignments, and students into pages", () => {
  const review = source("src/app/teacher/classes/[id]/(workspace)/page.tsx");
  const tabs = source("src/components/teacher/ClassWorkspaceTabs.tsx");
  expect(review).toContain("TeacherReviewTable");
  for (const label of ["Needs review", "Assignments", "Students", "Class settings"]) expect(tabs).toContain(label);
  expect(tabs).not.toContain("ClassReviewPolicyControl");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: FAIL — new files do not exist.

- [ ] **Step 3: Create the cached data module**

Create `src/server/teacher/class-workspace-data.ts`:

```ts
import { cache } from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { listRoster } from "@/server/classroom/roster-service";
import { listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";

// React.cache() dedupes these per request so the (workspace) layout and its
// child page share one fetch instead of querying twice.

export const getOwnedClass = cache(async (classId: string) => {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("classes").select("id, name, join_code").eq("id", classId).maybeSingle();
  if (result.error) throw new Error(`Unable to load class: ${result.error.message}`);
  if (!result.data) notFound();
  return result.data;
});

export const getClassRoster = cache(async (classId: string) => listRoster(classId));

export const getNeedsReviewRows = cache(async (teacherId: string) => listNeedsReviewForTeacher({ teacherId }));
```

- [ ] **Step 4: Create the tabs component**

Create `src/components/teacher/ClassWorkspaceTabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ClassWorkspaceTabs({ classId, needsReviewCount }: { classId: string; needsReviewCount: number }) {
  const pathname = usePathname();
  const base = `/teacher/classes/${classId}`;
  const tabs: { href: string; label: string; count?: number }[] = [
    { href: base, label: "Needs review", count: needsReviewCount },
    { href: `${base}/assignments`, label: "Assignments" },
    { href: `${base}/students`, label: "Students" },
    { href: `${base}/manage`, label: "Class settings" },
  ];
  return <nav aria-label="Class workspace" className="class-workspace-tabs">
    {tabs.map((tab) => <Link className={pathname === tab.href ? "active" : undefined} href={tab.href} key={tab.href}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</Link>)}
  </nav>;
}
```

- [ ] **Step 5: Create the workspace layout**

Create `src/app/teacher/classes/[id]/(workspace)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { ClassWorkspaceTabs } from "@/components/teacher/ClassWorkspaceTabs";
import { getClassRoster, getNeedsReviewRows, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassWorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const [{ id: classId }, profile] = await Promise.all([params, requireTeacherProfile()]);
  const ownedClass = await getOwnedClass(classId);
  const [roster, reviewRows] = await Promise.all([getClassRoster(classId), getNeedsReviewRows(profile.id)]);
  const needsReviewCount = reviewRows.filter((row) => row.classId === classId).length;

  return <section className="class-review-workspace">
    <div className="class-review-header">
      <div>
        <p className="class-review-eyebrow">Class</p>
        <h1>{ownedClass.name}</h1>
        <p>{roster.length} active student{roster.length === 1 ? "" : "s"}</p>
        {ownedClass.join_code && <p className="class-review-joincode">Class code <code>{ownedClass.join_code}</code></p>}
      </div>
    </div>
    <ClassWorkspaceTabs classId={classId} needsReviewCount={needsReviewCount}/>
    {children}
  </section>;
}
```

- [ ] **Step 6: Create the three pages and delete the old ones**

1. Delete `src/app/teacher/classes/[id]/page.tsx` and `src/components/teacher/ClassReviewWorkspace.tsx` (`git rm` both).
2. Create `src/app/teacher/classes/[id]/(workspace)/page.tsx`:

```tsx
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";
import { getNeedsReviewRows, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassNeedsReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }, profile] = await Promise.all([params, requireTeacherProfile()]);
  const ownedClass = await getOwnedClass(classId);
  const rows = (await getNeedsReviewRows(profile.id)).filter((row) => row.classId === classId);
  return <div className="class-review-queue"><TeacherReviewTable classes={[ownedClass.name]} rows={rows} scoped/></div>;
}
```

3. Create `src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx`:

```tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default async function ClassAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }] = await Promise.all([params, requireTeacherProfile()]);
  await getOwnedClass(classId);
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("assignments").select("id, title, due_at, created_at").eq("class_id", classId).is("canceled_at", null).order("due_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (result.error) throw new Error(`Unable to load assignments: ${result.error.message}`);
  const assignments = result.data ?? [];

  return <section className="class-review-section">
    <div className="class-section-heading"><div><h2>Assignments</h2><p>Newest homework and due dates for this class.</p></div><span>{assignments.length}</span></div>
    {assignments.length === 0 ? <div className="class-empty"><strong>No assignments yet</strong><p>Assign a mission to this class to see student homework here.</p></div> : <div className="class-card-grid">{assignments.map((assignment) => <article className="class-assignment-card" key={assignment.id}><div><strong>{assignment.title}</strong><p>{formatDate(assignment.due_at)}</p></div><Link href={`/teacher/classes/${classId}/review/${assignment.id}`}>View results →</Link></article>)}</div>}
  </section>;
}
```

4. Create `src/app/teacher/classes/[id]/(workspace)/students/page.tsx`:

```tsx
import Link from "next/link";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getClassRoster, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassStudentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }] = await Promise.all([params, requireTeacherProfile()]);
  await getOwnedClass(classId);
  const roster = await getClassRoster(classId);

  return <section className="class-review-section">
    <div className="class-section-heading"><div><h2>Students</h2><p>Open a student profile to review their sound history.</p></div><span>{roster.length}</span></div>
    {roster.length === 0 ? <div className="class-empty"><p>No students in this class yet.</p></div> : <div className="class-card-grid students">{roster.map((student) => <Link className="class-student-card" href={`/teacher/students/${student.id}`} key={student.id}><span className="student-initial">{student.displayName.slice(0, 1).toUpperCase()}</span><strong>{student.displayName}</strong><span>View sounds →</span></Link>)}</div>}
  </section>;
}
```

- [ ] **Step 7: Run gates**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS. Also verify no dangling imports: `grep -rn "ClassReviewWorkspace" src/ tests/` must return nothing.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: split class workspace into needs-review, assignments, and students pages"
```

---

### Task 5: Class Settings back link returns to the class

**Files:**
- Modify: `src/app/teacher/classes/[id]/manage/page.tsx:58-60`
- Modify: `tests/server/teacher-workspace-ui.test.ts` (add one test)

**Interfaces:**
- Consumes: route `/teacher/classes/[id]` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Add inside `describe("teacher workspace source contract", ...)` in `tests/server/teacher-workspace-ui.test.ts`:

```ts
  it("class settings links back to the class workspace, not the teacher home", () => {
    const manage = source("src/app/teacher/classes/[id]/manage/page.tsx");
    expect(manage).toContain("← Back to class");
    expect(manage).toContain("/teacher/classes/${classId}");
    expect(manage).not.toContain('href="/teacher"');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Implement**

In `src/app/teacher/classes/[id]/manage/page.tsx`, replace the header link:

```tsx
        <Link href={`/teacher/classes/${classId}`} style={{ fontSize: 14, color: "#2563EB", textDecoration: "none" }}>
          ← Back to class
        </Link>
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: PASS.

```bash
git add -A && git commit -m "fix: class settings back link returns to the class workspace"
```

---

### Task 6: Per-assignment progress aggregation (server)

**Files:**
- Modify: `src/server/teacher/assignment-operations.ts` (add type + function at the end, before `reopenSubmissionReview` is fine too — placement: after `listIncompleteForTeacher`)
- Modify: `tests/server/teacher-assignment-operations.test.ts` (new describe block)

**Interfaces:**
- Consumes: existing `Client` type and `RawRow` helpers in the same file.
- Produces:

```ts
export type AssignmentProgress = { completed: number; teacherReview: number; started: number; needsRetry: number; assigned: number; missed: number; total: number };
export async function listAssignmentProgressForClass(
  input: { teacherId: string; classId: string },
  client?: Client,
): Promise<Map<string, AssignmentProgress>>
```

Task 7 renders from this map (keyed by assignment id).

- [ ] **Step 1: Write the failing test**

Append to `tests/server/teacher-assignment-operations.test.ts` (also add `listAssignmentProgressForClass` to the import from `@/server/teacher/assignment-operations`):

```ts
function progressClient(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.is = () => Promise.resolve({ data: rows, error: null });
  return { from: () => chain } as unknown as NonNullable<Parameters<typeof listAssignmentProgressForClass>[1]>;
}

describe("listAssignmentProgressForClass", () => {
  it("aggregates per-assignment status buckets including dismissed rows at their truthful status", async () => {
    const progress = await listAssignmentProgressForClass({ teacherId: "teacher-1", classId: "c-1" }, progressClient([
      { assignment_id: "a-1", status: "completed" },
      { assignment_id: "a-1", status: "teacher_review" },
      { assignment_id: "a-1", status: "started" },
      { assignment_id: "a-1", status: "needs_retry" },
      { assignment_id: "a-1", status: "assigned" },
      { assignment_id: "a-1", status: "missed", dismissed_at: "2026-07-12T00:00:00Z" },
      { assignment_id: "a-2", status: "completed" },
    ]));
    expect(progress.get("a-1")).toEqual({ completed: 1, teacherReview: 1, started: 1, needsRetry: 1, assigned: 1, missed: 1, total: 6 });
    expect(progress.get("a-2")).toEqual({ completed: 1, teacherReview: 0, started: 0, needsRetry: 0, assigned: 0, missed: 0, total: 1 });
  });

  it("returns an empty map for a class with no assignment students", async () => {
    expect((await listAssignmentProgressForClass({ teacherId: "teacher-1", classId: "c-1" }, progressClient([]))).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/server/teacher-assignment-operations.test.ts`
Expected: FAIL — `listAssignmentProgressForClass` is not exported.

- [ ] **Step 3: Implement**

Add to `src/server/teacher/assignment-operations.ts` after `listIncompleteForTeacher`:

```ts
export type AssignmentProgress = { completed: number; teacherReview: number; started: number; needsRetry: number; assigned: number; missed: number; total: number };

export async function listAssignmentProgressForClass(input: { teacherId: string; classId: string }, client: Client = createSupabaseServiceClient()): Promise<Map<string, AssignmentProgress>> {
  const result = await client.from("assignment_students").select(`assignment_id, status, assignments!inner(class_id, canceled_at, classes!inner(teacher_id))`).eq("assignments.class_id", input.classId).eq("assignments.classes.teacher_id", input.teacherId).is("assignments.canceled_at", null);
  if (result.error) throw new Error(`Unable to load assignment progress: ${result.error.message}`);
  const progress = new Map<string, AssignmentProgress>();
  for (const raw of (result.data ?? []) as RawRow[]) {
    const assignmentId = String(raw.assignment_id);
    const entry = progress.get(assignmentId) ?? { completed: 0, teacherReview: 0, started: 0, needsRetry: 0, assigned: 0, missed: 0, total: 0 };
    entry.total += 1;
    const status = String(raw.status);
    if (status === "completed") entry.completed += 1;
    else if (status === "teacher_review") entry.teacherReview += 1;
    else if (status === "started") entry.started += 1;
    else if (status === "needs_retry") entry.needsRetry += 1;
    else if (status === "assigned") entry.assigned += 1;
    else if (status === "missed") entry.missed += 1;
    progress.set(assignmentId, entry);
  }
  return progress;
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `npx vitest run tests/server/teacher-assignment-operations.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A && git commit -m "feat(server): aggregate per-assignment student progress for a class"
```

---

### Task 7: Render progress (counts + bar) on assignment cards

**Files:**
- Modify: `src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx`
- Modify: `src/app/teacher/teacher-workspace.css` (append styles)
- Modify: `tests/server/teacher-workspace-ui.test.ts` (add one test)

**Interfaces:**
- Consumes: `listAssignmentProgressForClass` + `AssignmentProgress` (Task 6); `.class-assignment-card` markup (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Add inside `describe("teacher workspace source contract", ...)` in `tests/server/teacher-workspace-ui.test.ts`:

```ts
  it("assignment cards show completion counts, a progress bar, and a truthful breakdown", () => {
    const page = source("src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx");
    const styles = source("src/app/teacher/teacher-workspace.css");
    expect(page).toContain("listAssignmentProgressForClass");
    expect(page).toContain("of {progress.total} completed");
    expect(page).toContain("assignment-progress-bar");
    for (const label of ["awaiting review", "needs retry", "in progress", "not started", "missed", "No students assigned"]) expect(page).toContain(label);
    expect(styles).toContain(".teacher-shell .assignment-progress-bar");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Implement the page changes**

Rewrite `src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx` as:

```tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listAssignmentProgressForClass, type AssignmentProgress } from "@/server/teacher/assignment-operations";
import { getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function breakdown(progress: AssignmentProgress) {
  const parts = [
    progress.teacherReview > 0 ? `${progress.teacherReview} awaiting review` : null,
    progress.needsRetry > 0 ? `${progress.needsRetry} needs retry` : null,
    progress.started > 0 ? `${progress.started} in progress` : null,
    progress.assigned > 0 ? `${progress.assigned} not started` : null,
    progress.missed > 0 ? `${progress.missed} missed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function AssignmentProgressSummary({ progress }: { progress: AssignmentProgress | undefined }) {
  if (!progress || progress.total === 0) return <p className="assignment-progress-breakdown">No students assigned</p>;
  const detail = breakdown(progress);
  return <div className="assignment-progress">
    <span className="assignment-progress-label">{progress.completed} of {progress.total} completed</span>
    <span aria-hidden className="assignment-progress-bar"><span style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}/></span>
    {detail && <span className="assignment-progress-breakdown">{detail}</span>}
  </div>;
}

export default async function ClassAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }, profile] = await Promise.all([params, requireTeacherProfile()]);
  await getOwnedClass(classId);
  const supabase = await createSupabaseServerClient();
  const [result, progressByAssignment] = await Promise.all([
    supabase.from("assignments").select("id, title, due_at, created_at").eq("class_id", classId).is("canceled_at", null).order("due_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    listAssignmentProgressForClass({ teacherId: profile.id, classId }),
  ]);
  if (result.error) throw new Error(`Unable to load assignments: ${result.error.message}`);
  const assignments = result.data ?? [];

  return <section className="class-review-section">
    <div className="class-section-heading"><div><h2>Assignments</h2><p>Newest homework, due dates, and student progress for this class.</p></div><span>{assignments.length}</span></div>
    {assignments.length === 0 ? <div className="class-empty"><strong>No assignments yet</strong><p>Assign a mission to this class to see student homework here.</p></div> : <div className="class-card-grid">{assignments.map((assignment) => <article className="class-assignment-card" key={assignment.id}><div><strong>{assignment.title}</strong><p>{formatDate(assignment.due_at)}</p><AssignmentProgressSummary progress={progressByAssignment.get(assignment.id)}/></div><Link href={`/teacher/classes/${classId}/review/${assignment.id}`}>View results →</Link></article>)}</div>}
  </section>;
}
```

- [ ] **Step 4: Append the styles**

Append to `src/app/teacher/teacher-workspace.css` (before the `@media (max-width: 800px)` block):

```css
.teacher-shell .assignment-progress { margin-top: 8px; display: grid; gap: 4px; }
.teacher-shell .assignment-progress-label { color: #334155; font-size: 12px; font-weight: 600; }
.teacher-shell .assignment-progress-bar { display: block; height: 6px; width: 100%; max-width: 320px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
.teacher-shell .assignment-progress-bar > span { display: block; height: 100%; border-radius: 999px; background: #2563eb; }
.teacher-shell .assignment-progress-breakdown { margin: 0; color: #64748b; font-size: 11px; }
```

- [ ] **Step 5: Run gates, then commit**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS.

```bash
git add -A && git commit -m "feat(ui): show per-assignment completion counts and progress bar"
```

---

### Task 8: Full verification (automated + browser)

**Files:** none created; verification only.

**Interfaces:**
- Consumes: everything above.
- Produces: evidence for merge decision.

- [ ] **Step 1: Full automated gates**

Run: `npx vitest run && npx tsc --noEmit && npx eslint . && npx next build`
Expected: 61+ test files pass; tsc clean; lint 0 errors; build succeeds.

- [ ] **Step 2: Browser verification (dev server)**

Start the dev server via the browser preview tooling (never Bash) and, logged in as the teacher, verify:

1. **FOUC:** hard-refresh `/teacher` — page renders styled immediately (no flash of unstyled HTML). Check a second refresh on a class page.
2. **Class tabs:** click a class in the sidebar → lands on `/teacher/classes/[id]` showing only the Needs review queue with tabs `Needs review (n) / Assignments / Students / Class settings`; active tab is highlighted and moves as you visit `/assignments` and `/students`.
3. **No review policy:** no "Review setting" dropdown anywhere; class header shows "N active students · Class code X" only.
4. **Assignments page:** each card shows title, due date, "C of T completed", a progress bar, and a breakdown line listing only nonzero buckets (e.g. "1 not started · 1 missed"); an assignment with no students shows "No students assigned".
5. **Students page:** student cards render and link to `/teacher/students/[id]`.
6. **Back link:** `/teacher/classes/[id]/manage` shows `← Back to class` and it navigates to `/teacher/classes/[id]` (not `/teacher`).
7. **Untouched routes:** `/teacher/classes/[id]/review/[assignmentId]` and `/teacher/assignment-students/[id]` render exactly as before (standalone pages, no class tabs wrapping them).
8. Stop the dev server when done (memory rule: never leave agent-started servers running).

- [ ] **Step 3: Report**

Report gate output and browser findings to the user; ask whether to merge `feature/class-page-restructure` into `main` (do not merge without approval).
