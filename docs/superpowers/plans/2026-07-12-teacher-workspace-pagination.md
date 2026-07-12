# Teacher Workspace Styling and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the prototype teacher shell and limit Needs Review to 10 rows per server-rendered page with safe timestamps.

**Architecture:** Keep the current teacher service contract intact. Add a small pure pagination/query helper beside the teacher page so page calculation is independently testable, pass pagination metadata into the existing queue component, and change only the shell CSS scoping needed for Next.js links.

**Tech Stack:** Next.js App Router, React, TypeScript, styled-jsx, Vitest.

## Global Constraints

- Needs Review uses exactly 10 rows per page.
- Preserve active `class` and `filter` values in pagination links.
- Invalid timestamps display `Recently`, never a Unix-epoch date.
- Do not paginate Incomplete or All Activity.
- Match the approved 210px-sidebar prototype; do not redesign it.

---

### Task 1: Lock down pagination and timestamp behavior

**Files:**
- Modify: `tests/server/teacher-workspace-ui.test.ts`
- Modify: `src/app/teacher/page.tsx`
- Modify: `src/components/teacher/TeacherQueueViews.tsx`

**Interfaces:**
- Produces: `paginateTeacherReviewRows<T>(rows: T[], requestedPage: number, pageSize?: number)` returning `{ rows, page, totalPages }`.
- Produces: `TeacherReviewTable` props `page`, `totalPages`, and `query`.

- [ ] **Step 1: Write failing tests**

Add source/behavior assertions that 21 rows paginate as 10/10/1, invalid and out-of-range page values clamp to page 1/last page, pagination query construction retains `class` and `filter`, and timestamp formatting contains an invalid-date guard returning `Recently`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/server/teacher-workspace-ui.test.ts`

Expected: FAIL because pagination exports/markup and the invalid timestamp fallback do not exist.

- [ ] **Step 3: Implement minimal pagination**

In `src/app/teacher/page.tsx`, parse `page`, filter first, call `paginateTeacherReviewRows(rows, Number(query.page), 10)`, and pass the result plus active query values to `TeacherReviewTable`.

In `TeacherQueueViews.tsx`, add Previous/Next links and `Page {page} of {totalPages}` beneath the queue. Build each link with `URLSearchParams`, retaining only active class/filter values and the destination page. Guard `Date.parse(value)` with `Number.isFinite`; return `Recently` for invalid values.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/server/teacher-workspace-ui.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher/page.tsx src/components/teacher/TeacherQueueViews.tsx tests/server/teacher-workspace-ui.test.ts
git commit -m "fix: paginate teacher review queue"
```

### Task 2: Restore prototype shell styles

**Files:**
- Modify: `tests/server/teacher-workspace-ui.test.ts`
- Modify: `src/components/teacher/TeacherWorkspaceShell.tsx`

**Interfaces:**
- Consumes: existing shell class names (`teacher-shell`, `sidebar`, `nav`, `count`, `workspace`).
- Produces: global shell selectors that reach DOM emitted by Next.js `Link`.

- [ ] **Step 1: Write the failing style regression test**

Assert that the shell stylesheet is global, keeps `grid-template-columns:210px minmax(0,1fr)`, styles `.nav.active` and `.count`, and retains the mobile breakpoint/drawer.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/server/teacher-workspace-ui.test.ts`

Expected: FAIL because the shell currently uses scoped `<style jsx>`.

- [ ] **Step 3: Apply the minimal CSS-scope fix**

Change the shell style tag to `<style jsx global>` without changing the approved prototype values or component structure.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/server/teacher-workspace-ui.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/teacher/TeacherWorkspaceShell.tsx tests/server/teacher-workspace-ui.test.ts
git commit -m "fix: restore teacher workspace shell styles"
```

### Task 3: Integration verification and GSD truthfulness

**Files:**
- Modify if required: `.planning/STATE.md`
- Modify if required: `.planning/phases/10.1-assignment-operations-student-history/10.1-VERIFICATION.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 UI behavior.
- Produces: verified phase-gap status that accurately reflects lint/build results.

- [ ] **Step 1: Run focused and full static verification**

Run:

```bash
npm test -- --run tests/server/teacher-workspace-ui.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: focused tests and typecheck pass. If lint/build still fail only on the previously documented explicit-`any` gap, keep Phase 10.1 in `gaps_found` and record that evidence; do not claim phase completion.

- [ ] **Step 2: Inspect the rendered page**

With an authenticated local teacher session, verify the desktop sidebar matches the prototype, the first page contains no more than 10 rows, Next/Previous preserve filters, and no received date shows `1/1/1970`. If the session is unavailable, report this manual check as pending.

- [ ] **Step 3: Commit tracking evidence if changed**

```bash
git add .planning/STATE.md .planning/phases/10.1-assignment-operations-student-history/10.1-VERIFICATION.md
git commit -m "docs: record teacher workspace pagination verification"
```
