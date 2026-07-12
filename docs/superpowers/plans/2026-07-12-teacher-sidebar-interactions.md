# Teacher Sidebar Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prototype-consistent hover/focus feedback, blue class-count badges, and hover/focus reveal for truncated class names.

**Architecture:** Introduce one focused client component for class navigation links so overflow measurement is isolated from the workspace shell. Keep all visual behavior in the existing global teacher-workspace style component and preserve the current navigation/data contracts.

**Tech Stack:** Next.js, React, TypeScript, styled-jsx, Vitest.

## Global Constraints

- Class counts use the exact solid blue pill treatment as Needs Review.
- Long class names stay on one line with an ellipsis at rest.
- Only overflowing names animate on hover/focus.
- Reduced-motion users receive no scrolling animation.
- Changes remain scoped to `.teacher-shell`.

---

### Task 1: Class-link overflow behavior

**Files:**
- Create: `src/components/teacher/TeacherClassNavLink.tsx`
- Modify: `src/components/teacher/TeacherWorkspaceShell.tsx`
- Modify: `tests/server/teacher-workspace-ui.test.ts`

**Interfaces:**
- Produces: `TeacherClassNavLink({ id, name, rosterCount })`.
- Consumes: `/teacher/classes/{id}` route and existing teacher class DTO fields.

- [ ] Write failing source tests asserting a dedicated class-name track, `title={name}`, overflow measurement, overflow marker, and `.count` badge.
- [ ] Run `npm test -- --run tests/server/teacher-workspace-ui.test.ts`; confirm RED.
- [ ] Implement the minimal measured class link using refs and `ResizeObserver`, setting a CSS travel custom property only when `scrollWidth > clientWidth`.
- [ ] Replace the inline class-link map in `TeacherWorkspaceShell` with `TeacherClassNavLink`.
- [ ] Rerun the focused test; confirm GREEN.

### Task 2: Hover, focus, marquee, and reduced motion

**Files:**
- Modify: `src/components/teacher/TeacherWorkspaceStyles.tsx`
- Modify: `tests/server/teacher-workspace-ui.test.ts`

**Interfaces:**
- Consumes: `.class-nav-link`, `.class-name-window`, `.class-name-track`, and `[data-overflow="true"]` from Task 1.
- Produces: scoped hover/focus transitions and `teacher-class-name-reveal` animation.

- [ ] Write failing assertions for hover/focus-visible rules, the named reveal animation, ellipsis-at-rest, and `prefers-reduced-motion: reduce`.
- [ ] Run the focused test; confirm RED.
- [ ] Add minimal scoped CSS: transition clickable elements, reuse count badge styling, clip/truncate the name window, and animate only marked overflow tracks on hover/focus.
- [ ] Run focused tests and typecheck; confirm GREEN.
- [ ] Commit implementation with `git commit -m "fix: improve teacher sidebar interactions"`.

### Task 3: Integration verification

**Files:**
- No production files unless a task-caused regression is found.

- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Confirm any lint/build failure is limited to the already documented Phase 10.1 explicit-`any` gap.
- [ ] Merge the verified branch to `main`, rerun focused tests/typecheck, and remove the temporary worktree/branch.
