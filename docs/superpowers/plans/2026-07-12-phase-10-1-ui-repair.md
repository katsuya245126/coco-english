# Phase 10.1 UI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the Phase 10.1 teacher/student UI to match its approved prototypes and clear the owner's legacy Needs Review backlog.

**Architecture:** Keep server-owned workflow and list services unchanged. Isolate visual structures in focused teacher/student components with scoped global styles, and use the existing review service for the one-time backlog operation.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, styled-jsx, Vitest, browser verification.

## Global Constraints

- Use the exact approved prototype hierarchy and 10/5 item page sizes already chosen.
- Preserve teacher/student ownership boundaries and current status semantics.
- No reusable credentials or temporary account access values may be committed.
- Implementation occurs in an isolated `codex/phase-10-1-ui-repair` worktree and merges to `main` after verification.

---

### Task 1: Stabilize class-name reveal

**Files:**
- Modify: `src/components/teacher/TeacherClassNavLink.tsx`
- Modify: `tests/server/teacher-workspace-ui.test.ts`

- [ ] Write a failing regression requiring a stable window ref, text `scrollWidth`, window `clientWidth`, and observation of the window rather than the animated track.
- [ ] Run focused test and confirm RED.
- [ ] Implement the minimal stable measurement and confirm GREEN.

### Task 2: Port class review prototype

**Files:**
- Create: `src/components/teacher/ClassReviewWorkspace.tsx`
- Modify: `src/app/teacher/classes/[id]/page.tsx`
- Modify: `src/components/teacher/ClassReviewPolicyControl.tsx`
- Modify: `src/components/teacher/TeacherWorkspaceStyles.tsx`
- Modify: `tests/e2e/teacher-assignment-operations.spec.ts`

- [ ] Write failing source assertions for no nested shell, prototype title/meta/tabs, styled policy control, queue-first content, assignment/student cards, and responsive behavior.
- [ ] Confirm RED.
- [ ] Move presentation into the focused workspace component while leaving server queries and links owned by the route.
- [ ] Add only the prototype-aligned shared styles needed by the new class workspace.
- [ ] Confirm focused teacher tests and typecheck pass.

### Task 3: Port student Current/Past prototype

**Files:**
- Modify: `src/app/student/home/page.tsx`
- Modify: `src/components/student/StudentHomeShell.tsx`
- Modify: `src/components/student/AssignmentListItem.tsx`
- Create: `src/components/student/StudentHomeStyles.tsx`
- Modify: `tests/server/student-history-ui.test.ts`

- [ ] Write failing source assertions for greeting/avatar, approved tab labels, prototype mission cards, progress, five-item pagination, Past recap links, and responsive 430px/375px rules.
- [ ] Confirm RED.
- [ ] Replace generic inline UI with semantic class names and prototype structure while preserving existing item states/actions.
- [ ] Add dedicated scoped styles and confirm focused tests/typecheck pass.

### Task 4: Mark the owner's existing queue reviewed

**Files:**
- No committed production files.

- [ ] Load `.env.local` without printing secrets and use the service client to identify the unique `John Teacher` profile.
- [ ] Read the current owned Needs Review queue and record its count/attempt IDs locally.
- [ ] Call existing `markSubmissionReviewed` once per current queue attempt; stop on any ownership/DB error.
- [ ] Re-read the queue and require a zero count before reporting success.

### Task 5: Verify, merge, and capture screenshots

- [ ] Run focused tests, full `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Confirm lint/build failures, if any, remain limited to the documented explicit-`any` gap.
- [ ] Merge to `main`, re-run focused tests/typecheck, and clean up the worktree/branch.
- [ ] Use an authenticated local browser session to capture desktop teacher home/class review plus 375px student Current/Past screenshots.
- [ ] Save screenshots under `.planning/screenshots/phase-10.1-ui-repair/` and report their absolute paths.
