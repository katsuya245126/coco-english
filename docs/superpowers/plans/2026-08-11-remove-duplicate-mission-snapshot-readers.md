# Remove Duplicate Mission Snapshot Readers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Issue #27 by proving that every stored mission snapshot reader uses the approved shared meaning and that the complete migration passes focused and broad verification.

**Architecture:** Make no application change unless an audit or required check proves one is needed. Treat the shared interpreter as the only application/server read boundary, preserve strict schema parsing in the assignment creator, and preserve the approved database completion read.

**Tech Stack:** TypeScript, Zod, Next.js, Supabase SQL, Vitest, ESLint, and the existing production build.

## Global Constraints

- Do not change production code, tests, schemas, migrations, or dependencies unless a failing audit or check proves a root-cause fix is required and the owner approves a revised plan.
- Application and server stored-snapshot reads must use `interpretMissionSnapshot` or an approved result derived from it.
- `buildMissionSnapshot` must keep `missionSnapshotSchema.parse` at the strict assignment boundary.
- The database completion operation must remain unchanged.
- Preserve preset and conversation behavior, historical defaults, ownership checks, RLS, private audio storage, signed playback, and immutable stored snapshots.
- Add no structural source test, new abstraction, schema migration, dependency, deployment, push, publication, or production mutation.
- Update local `TASK.md` at approval and verification milestones; it is ignored and must not be staged.

## File Structure

- Create or modify no application or test file in the passing path.
- Read `src/domain/mission/mission-snapshot.ts` as the shared interpreter boundary.
- Read `src/server/mission/assign-service.ts` as the approved strict creation boundary.
- Read stored-snapshot consumer matches under `src/app/` and `src/server/` during the audit.
- Read `supabase/migrations/202607100001_complete_student_attempt_rpc.sql` and `supabase/migrations/202607230002_deferred_teacher_review_completion.sql` as the approved database completion history.
- Modify only local ignored `TASK.md` to record evidence.

---

### Task 0: Confirm Plan Approval and Capture the Verification Base

**Files:**

- Modify: `TASK.md` (local and ignored; do not stage)

- [ ] **Step 1: Confirm approval of this exact tracked plan revision**

Record the owner's approval and this plan's commit hash in `TASK.md`. Stop if approval is absent or names an older revision.

- [ ] **Step 2: Capture a clean verification base**

Run:

```bash
git rev-parse HEAD
git --no-optional-locks status --short --branch
```

Expected: the branch is `codex/deepen-mission-snapshot-interpretation`, and the tracked working tree is clean. Record the exact commit as the Issue #27 verification and review base in `TASK.md`.

---

### Task 1: Audit Every Stored Mission Snapshot Boundary

**Files:**

- Read: `src/domain/mission/mission-snapshot.ts`
- Read: `src/server/mission/assign-service.ts`
- Read: stored-snapshot matches under `src/app/` and `src/server/`
- Read: `supabase/migrations/202607100001_complete_student_attempt_rpc.sql`
- Read: `supabase/migrations/202607230002_deferred_teacher_review_completion.sql`
- Modify: `TASK.md` (local and ignored; do not stage)

- [ ] **Step 1: Inventory schema parsing and stored-snapshot reads**

Run:

```bash
rg -n "missionSnapshotSchema\.(parse|safeParse)|interpretMissionSnapshot|parseSnapshot|mission_snapshot" src --glob '!**/*.test.*'
```

Expected classification:

- `src/domain/mission/mission-snapshot.ts` uses `missionSnapshotSchema.safeParse` inside the shared interpreter.
- `src/server/mission/assign-service.ts` uses `missionSnapshotSchema.parse` only while creating a new assignment snapshot.
- Application and server consumers in the output import and call `interpretMissionSnapshot` before using stored mission content.
- `src/lib/db/types.ts` contains generated database types only.
- No `parseSnapshot` helper or second compatibility parser appears.

- [ ] **Step 2: Audit raw database completion reads**

Run:

```bash
rg -n "mission_snapshot\s*->|mission_snapshot.*requiredTurns|requiredTurns.*mission_snapshot" supabase/migrations
```

Expected: only the historical completion RPC and its later replacement read `requiredTurns`; both are explicitly approved and remain unchanged.

- [ ] **Step 3: Check for an Issue #27 implementation diff**

Run `git --no-optional-locks status --short --branch`.

Expected: no application or test change. If any unexpected reader, parser, unsafe cast, or raw application field read appears, stop and write a root-cause revision for owner approval before editing code.

- [ ] **Step 4: Record the audit evidence**

Record each approved reader category and the absence of unapproved readers in local `TASK.md`. Do not stage the file.

---

### Task 2: Run Focused and Broad Verification

**Files:**

- Test only; no file modifications expected.
- Modify: `TASK.md` (local and ignored; do not stage)

- [ ] **Step 1: Run the focused interpreter and consumer tests**

Run:

```bash
npm test -- --run src/domain/mission/mission-snapshot.test.ts src/server/student-access/mission-flow.test.ts src/server/student-access/audio-upload.test.ts src/server/teacher/audio-evidence.test.ts tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts tests/server/student-mission-page.test.ts tests/server/audio-upload.test.ts tests/server/student-helper-budget-routes.test.ts tests/server/translation-source.test.ts tests/server/assignment-list.test.ts tests/server/student-history.test.ts tests/server/assignment-student-evidence.test.ts tests/server/audio-evidence.test.ts
```

Expected: PASS with no focused failure. Record the test-file and test counts reported by Vitest.

- [ ] **Step 2: Run the full test suite**

Run `npm test -- --run`.

Expected: PASS. Record passed tests and any explicitly environment-gated skips.

- [ ] **Step 3: Run static verification**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: typecheck passes. If unfiltered lint reports only ignored generated artifacts under `.ua/`, `.worktrees/`, or `supabase/.temp/`, record that output and run:

```bash
npx eslint . --ignore-pattern '.ua/**' --ignore-pattern '.worktrees/**' --ignore-pattern 'supabase/.temp/**'
```

Expected: source lint exits successfully; record any pre-existing warning separately.

- [ ] **Step 4: Run the production build**

Run `npm run build`.

Expected: PASS, including the post-build ffmpeg trace check.

- [ ] **Step 5: Record exact verification evidence**

Record every command, exit result, count, skip, warning, and environment-only exclusion in local `TASK.md`. Never report an unrun command as passing.

---

### Task 3: Review the Final Issue #27 State

**Files:**

- Read: Git diff and status only.
- Modify: `TASK.md` (local and ignored; do not stage)

- [ ] **Step 1: Confirm the final diff is documentation-only**

Run:

```bash
git --no-optional-locks diff --check HEAD
git --no-optional-locks diff --name-status HEAD
git --no-optional-locks status --short --branch
```

Expected: no uncommitted diff after the plan commit and a clean tracked working tree. The recorded Issue #27 review base and subsequent Git history show no application refactor, test change, migration, or dependency change.

- [ ] **Step 2: Review acceptance-criteria evidence**

Map each of Issue #27's ten acceptance criteria to the Task 1 audit, Task 2 command output, or Task 3 diff evidence. Record the mapping in local `TASK.md`.

- [ ] **Step 3: Stop at the external-action gate**

Report Issue #27 ready for closure. Obtain exact owner authorization before closing the GitHub issue. Do not push, merge, deploy, publish, or mutate production.
