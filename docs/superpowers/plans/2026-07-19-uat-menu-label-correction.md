# Reliable UAT Worktree Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent restored or inherited `TASK.md` files from mislabeling descriptive UAT worktrees while preserving useful task and commit fallbacks for generated checkouts.

**Architecture:** Classify each non-main worktree as descriptive or generated. Descriptive branches resolve directly from a cleaned branch name; generated and detached records compare their complete task source with main's task source before falling back to the latest commit and generated name. Keep filesystem and Git reads in the runtime, with pure classification, formatting, sorting, and disambiguation in the existing library.

**Tech Stack:** Node.js ESM, Git worktree porcelain output, Vitest, TypeScript checking, ESLint.

## Global Constraints

- The record whose branch is `main` always displays as `Main` and sorts first; when no `main` record exists, the launcher root remains the first fallback.
- A descriptive non-main branch uses its cleaned branch name without consulting task or commit metadata.
- Generated branches match only `worktree-agent-<hex>` or `claude/<slug>-<hex>`, where `<hex>` contains at least six hexadecimal characters; detached records use the same fallback path.
- A generated or detached record uses a readable task H1 only when its complete task source differs from main's complete task source; otherwise it uses the latest commit subject, then its cleaned generated name or directory.
- When main's task is missing or unreadable, do not trust a non-main task title.
- Branch cleanup removes `worktree-`, `codex/`, or `claude/`, converts hyphens and underscores to spaces, collapses whitespace, capitalizes the first character, and renders standalone `uat` as `UAT`.
- Preserve current duplicate-label disambiguation and checkout provenance.
- Exit remains last, returns 0, and invokes no preflight or launch dependency; invalid input remains exit code 1 and also invokes no preflight or launch dependency.
- Read only root `TASK.md`; never read environment-file contents or secrets.
- Do not add dependencies, rename or remove worktrees, change ngrok, change port 3200, or change application behavior.
- Preserve unrelated working-tree changes and do not push, merge, deploy, or publish.

---

### Task 1: Pure branch classification, cleanup, and sorting

**Files:**
- Modify: `scripts/uat-worktree-lib.mjs`
- Modify: `tests/scripts/uat-worktree-lib.test.ts`

**Interfaces:**
- Consumes: parsed records shaped as `{ path, head, branch, detached, locked }`.
- Produces: `compareWorktrees(left, right, repoRoot, hasMain): number`.
- Produces: `isGeneratedWorktree(record): boolean`.
- Preserves: `sortWorktrees(records, repoRoot): Array<WorktreeRecord>`.
- Changes: `cleanWorktreeName(value): string | null` also removes `codex/` and capitalizes standalone `uat` as `UAT`.
- Changes: `formatWorktreeLabel(record, metadata?): string` ignores metadata for descriptive branches and uses it only for generated or detached records.

- [ ] **Step 1: Replace the old task-first label tests with failing hybrid-policy tests**

Add `compareWorktrees` and `isGeneratedWorktree` to the existing namespace destructure in `tests/scripts/uat-worktree-lib.test.ts`:

```ts
const {
  UAT_PORT,
  buildDevInvocation,
  cleanCommitSubject,
  cleanWorktreeName,
  compareWorktrees,
  disambiguateWorktreeLabels,
  extractTaskTitle,
  formatWorktreeLabel,
  isGeneratedWorktree,
  parseSelection,
  parseWorktreePorcelain,
  sortWorktrees,
} = uatWorktreeLib;
```

Replace the test named `uses Main for the main branch and prefers task purpose over commit and branch metadata` with:

```ts
it("uses Main for main and a stable branch purpose for descriptive worktrees", () => {
  const [main, named] = parseWorktreePorcelain(porcelain);
  const descriptive = { ...named, branch: "codex/uat-menu-labels" };

  expect(formatWorktreeLabel(main)).toBe("Main");
  expect(
    formatWorktreeLabel(descriptive, {
      taskTitle: "Dynamic dialogue pagination and open follow-ups",
      commitSubject: "fix: ignored metadata",
    }),
  ).toBe("UAT menu labels");
});

it("recognizes only generated agent and Claude branch shapes", () => {
  const [, named, detached] = parseWorktreePorcelain(porcelain);

  expect(isGeneratedWorktree({ ...named, branch: "worktree-agent-a4fe43921413" })).toBe(true);
  expect(isGeneratedWorktree({ ...named, branch: "claude/clever-northcutt-200ab2" })).toBe(true);
  expect(isGeneratedWorktree(detached)).toBe(true);
  expect(isGeneratedWorktree({ ...named, branch: "codex/uat-menu-labels" })).toBe(false);
  expect(isGeneratedWorktree({ ...named, branch: "worktree-dynamic-dialogue-pagination" })).toBe(false);
});
```

Replace the existing test named `falls back through cleaned commit subject, cleaned branch, and detached directory` with:

```ts
it("uses task, commit, then generated name fallbacks only for generated records", () => {
  const [, named, detached] = parseWorktreePorcelain(porcelain);
  const generated = {
    ...named,
    path: "/projects/coco-english/.claude/worktrees/agent-a4fe43921413",
    branch: "worktree-agent-a4fe43921413",
  };

  expect(
    formatWorktreeLabel(generated, {
      taskTitle: "Worktree-aware UAT launcher",
      commitSubject: "fix: ignored commit",
    }),
  ).toBe("Worktree-aware UAT launcher");
  expect(formatWorktreeLabel(generated, { commitSubject: "perf: pin functions to Seoul" })).toBe(
    "Pin functions to Seoul",
  );
  expect(formatWorktreeLabel(generated)).toBe("Agent");
  expect(formatWorktreeLabel(detached)).toBe("External coco worktree");
});
```

Replace the existing cleanup test with:

```ts
it("cleans descriptive and generated names deterministically", () => {
  expect(cleanWorktreeName("codex/uat-menu-labels")).toBe("UAT menu labels");
  expect(cleanWorktreeName("worktree-dynamic_dialogue-pagination")).toBe(
    "Dynamic dialogue pagination",
  );
  expect(cleanWorktreeName("claude/clever-northcutt-200ab2")).toBe("Clever northcutt");
  expect(cleanWorktreeName("feature-v2")).toBe("Feature v2");
  expect(cleanWorktreeName("---")).toBeNull();
});
```

Add this comparator regression after the existing sort tests:

```ts
it("returns equality when the worktree comparator receives the same record", () => {
  const [main] = parseWorktreePorcelain(porcelain);
  expect(compareWorktrees(main, main, "/projects/coco-english", true)).toBe(0);
});
```

- [ ] **Step 2: Run the library tests and verify RED**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts
```

Expected: FAIL because `compareWorktrees` and `isGeneratedWorktree` are not exported, `codex/` and standalone `uat` cleanup are absent, and descriptive records still prefer task metadata.

- [ ] **Step 3: Implement a reflexive comparator**

Replace `sortWorktrees` in `scripts/uat-worktree-lib.mjs` with:

```js
export function compareWorktrees(left, right, repoRoot, hasMain) {
  const rank = (record) => {
    if (record.branch === "main") return 0;
    if (!hasMain && record.path === repoRoot) return 0;
    return 1;
  };
  const rankDifference = rank(left) - rank(right);
  if (rankDifference !== 0) return rankDifference;
  return left.path.localeCompare(right.path);
}

export function sortWorktrees(records, repoRoot) {
  const hasMain = records.some((record) => record.branch === "main");
  return [...records].sort((left, right) =>
    compareWorktrees(left, right, repoRoot, hasMain),
  );
}
```

- [ ] **Step 4: Implement generated classification and hybrid label formatting**

Replace `cleanWorktreeName` and `formatWorktreeLabel` in `scripts/uat-worktree-lib.mjs`, and add `isGeneratedWorktree` between them:

```js
export function cleanWorktreeName(value) {
  const cleaned = value
    .replace(/^claude\//u, "")
    .replace(/^codex\//u, "")
    .replace(/^worktree-/u, "")
    .replace(/-[0-9a-f]{6,}$/iu, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return null;
  const capitalized = `${cleaned[0].toUpperCase()}${cleaned.slice(1)}`;
  return capitalized.replace(/\buat\b/giu, "UAT");
}

export function isGeneratedWorktree(record) {
  if (record.detached || record.branch === null) return true;
  return (
    /^worktree-agent-[0-9a-f]{6,}$/iu.test(record.branch) ||
    /^claude\/[^/]+-[0-9a-f]{6,}$/iu.test(record.branch)
  );
}

export function formatWorktreeLabel(record, metadata = {}) {
  if (record.branch === "main") return "Main";
  if (!isGeneratedWorktree(record)) {
    return cleanWorktreeName(record.branch) ?? "Detached checkout";
  }
  const taskTitle = metadata.taskTitle?.trim();
  if (taskTitle) return taskTitle;
  const commitSubject = metadata.commitSubject?.trim();
  if (commitSubject) {
    const cleanedSubject = cleanCommitSubject(commitSubject);
    if (cleanedSubject) return cleanedSubject;
  }
  return cleanWorktreeName(record.branch ?? path.basename(record.path)) ?? "Detached checkout";
}
```

Do not change `extractTaskTitle`, `cleanCommitSubject`, `disambiguateWorktreeLabels`, selection parsing, or dev invocation.

- [ ] **Step 5: Run the library tests and verify GREEN**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts
```

Expected: PASS with every library test green.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/uat-worktree-lib.mjs tests/scripts/uat-worktree-lib.test.ts
git commit -m "fix(dev): prefer stable UAT branch labels"
```

---

### Task 2: Runtime task ownership and invalid-selection guard

**Files:**
- Modify: `scripts/uat-worktree.mjs`
- Modify: `tests/scripts/uat-worktree-runtime.test.ts`

**Interfaces:**
- Consumes: `extractTaskTitle`, `formatWorktreeLabel`, and `isGeneratedWorktree` from Task 1.
- Replaces: `readTaskTitle(checkoutPath, read?)` with `readTaskSource(checkoutPath, read?): string | null`.
- Replaces: `deps.worktreeMetadata(path)` with `deps.taskSource(path)` and `deps.commitSubject(path)` in `runUatLauncher(deps)`.
- Preserves: preflight, provenance, port 3200, lock inspection, dependency checks, environment existence checks, and launch invocation.

- [ ] **Step 1: Update the runtime-reader test to require complete task source**

Replace `readTaskTitle` with `readTaskSource` in the runtime import destructure:

```ts
const {
  checkPortAvailable,
  evaluatePreflight,
  findNextDevLockHolders,
  readCommitSubject,
  readTaskSource,
  runUatLauncher,
} = uatWorktreeRuntime;
```

Replace the test named `reads task purpose and commit subject with null fallbacks` with:

```ts
it("reads complete task source and commit subject with null fallbacks", () => {
  const taskSource = "# Purpose from task\n\n## Scope\nFull ownership evidence.\n";
  const read = vi.fn(() => taskSource);
  expect(readTaskSource("/tmp/feature", read)).toBe(taskSource);
  expect(read).toHaveBeenCalledWith("/tmp/feature/TASK.md", "utf8");
  expect(readTaskSource("/tmp/feature", () => { throw new Error("missing"); })).toBeNull();

  const run = vi.fn(() => "Latest commit purpose\n");
  expect(readCommitSubject("/tmp/feature", run)).toBe("Latest commit purpose");
  expect(run).toHaveBeenCalledWith(
    "git",
    ["-C", "/tmp/feature", "log", "-1", "--format=%s"],
    { encoding: "utf8" },
  );
  expect(readCommitSubject("/tmp/feature", () => { throw new Error("missing"); })).toBeNull();
});
```

- [ ] **Step 2: Add failing runtime regressions for inherited and distinct tasks**

Add this helper above `describe("runUatLauncher", ...)`:

```ts
const labelPorcelain = `worktree /projects/coco-english
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /tmp/uat-menu-labels
HEAD 2222222222222222222222222222222222222222
branch refs/heads/codex/uat-menu-labels

worktree /tmp/agent-a4fe43921413
HEAD 3333333333333333333333333333333333333333
branch refs/heads/worktree-agent-a4fe43921413
`;
```

Add these two tests inside `describe("runUatLauncher", ...)`:

```ts
it("labels a descriptive branch from the branch even when it inherits main's task", async () => {
  const output: string[] = [];
  const inheritedTask = "# Dynamic dialogue pagination and open follow-ups\n";
  await runUatLauncher({
    repoRoot: "/projects/coco-english",
    gitWorktreeOutput: labelPorcelain,
    taskSource: vi.fn(() => inheritedTask),
    commitSubject: vi.fn(() => "fix: ignored metadata"),
    prompt: async () => "4",
    write: (line: string) => output.push(line),
    portAvailable: vi.fn(async () => true),
    lockHolderPids: vi.fn(async () => []),
    checkoutExists: vi.fn(() => true),
    dependenciesInstalled: vi.fn(() => true),
    envFileExists: vi.fn(() => true),
    launch: vi.fn(async () => 0),
  });

  expect(output).toContain("2. UAT menu labels");
  expect(output.join("\n")).not.toContain(
    "Dynamic dialogue pagination and open follow-ups [uat-menu-labels]",
  );
});

it("uses only a distinct generated task before falling back to its commit", async () => {
  const mainTask = "# Main task\n";
  const taskSource = vi.fn((checkoutPath: string) => {
    if (checkoutPath === "/projects/coco-english") return mainTask;
    if (checkoutPath === "/tmp/agent-a4fe43921413") return mainTask;
    return null;
  });
  const commitSubject = vi.fn(() => "fix: generated checkout purpose");
  const inheritedOutput: string[] = [];

  await runUatLauncher({
    repoRoot: "/projects/coco-english",
    gitWorktreeOutput: labelPorcelain,
    taskSource,
    commitSubject,
    prompt: async () => "4",
    write: (line: string) => inheritedOutput.push(line),
    portAvailable: vi.fn(async () => true),
    lockHolderPids: vi.fn(async () => []),
    checkoutExists: vi.fn(() => true),
    dependenciesInstalled: vi.fn(() => true),
    envFileExists: vi.fn(() => true),
    launch: vi.fn(async () => 0),
  });

  expect(inheritedOutput).toContain("3. Generated checkout purpose");

  taskSource.mockImplementation((checkoutPath: string) =>
    checkoutPath === "/tmp/agent-a4fe43921413"
      ? "# Worktree-aware UAT launcher\n"
      : mainTask,
  );
  const distinctOutput: string[] = [];

  await runUatLauncher({
    repoRoot: "/projects/coco-english",
    gitWorktreeOutput: labelPorcelain,
    taskSource,
    commitSubject,
    prompt: async () => "4",
    write: (line: string) => distinctOutput.push(line),
    portAvailable: vi.fn(async () => true),
    lockHolderPids: vi.fn(async () => []),
    checkoutExists: vi.fn(() => true),
    dependenciesInstalled: vi.fn(() => true),
    envFileExists: vi.fn(() => true),
    launch: vi.fn(async () => 0),
  });

  expect(distinctOutput).toContain("3. Worktree-aware UAT launcher");

  taskSource.mockImplementation((checkoutPath: string) =>
    checkoutPath === "/tmp/agent-a4fe43921413"
      ? "# Worktree-aware UAT launcher\n"
      : null,
  );
  const missingMainOutput: string[] = [];

  await runUatLauncher({
    repoRoot: "/projects/coco-english",
    gitWorktreeOutput: labelPorcelain,
    taskSource,
    commitSubject,
    prompt: async () => "4",
    write: (line: string) => missingMainOutput.push(line),
    portAvailable: vi.fn(async () => true),
    lockHolderPids: vi.fn(async () => []),
    checkoutExists: vi.fn(() => true),
    dependenciesInstalled: vi.fn(() => true),
    envFileExists: vi.fn(() => true),
    launch: vi.fn(async () => 0),
  });

  expect(missingMainOutput).toContain("3. Generated checkout purpose");
});
```

The prompt selects `Exit` in both tests, so the assertions cover label resolution without invoking preflight or launch.

- [ ] **Step 3: Update existing launcher fixtures and strengthen invalid-selection assertions**

In every `runUatLauncher` fixture, replace `worktreeMetadata` with these dependencies:

```ts
taskSource: () => null,
commitSubject: () => null,
```

In the successful-selection test, change the expected descriptive label from `Readable feature purpose` to:

```ts
expect(menuOutput).toContain("2. Feature");
```

Replace the invalid-selection test with:

```ts
it("does not run preflight or launch after an invalid selection", async () => {
  const portAvailable = vi.fn(async () => true);
  const lockHolderPids = vi.fn(async () => []);
  const checkoutExists = vi.fn(() => true);
  const dependenciesInstalled = vi.fn(() => true);
  const envFileExists = vi.fn(() => true);
  const launch = vi.fn(async () => 0);
  const result = await runUatLauncher({
    repoRoot: "/projects/coco-english",
    gitWorktreeOutput: `worktree /projects/coco-english
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main
`,
    taskSource: () => null,
    commitSubject: () => null,
    prompt: async () => "9",
    write: () => undefined,
    portAvailable,
    lockHolderPids,
    checkoutExists,
    dependenciesInstalled,
    envFileExists,
    launch,
  });

  expect(result).toBe(1);
  expect(portAvailable).not.toHaveBeenCalled();
  expect(lockHolderPids).not.toHaveBeenCalled();
  expect(checkoutExists).not.toHaveBeenCalled();
  expect(dependenciesInstalled).not.toHaveBeenCalled();
  expect(envFileExists).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run the runtime tests and verify RED**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-runtime.test.ts
```

Expected: FAIL because `readTaskSource` does not exist, `runUatLauncher` still expects pre-resolved metadata, and descriptive labels still consult task metadata.

- [ ] **Step 5: Implement complete task reads and ownership-aware metadata resolution**

Add `extractTaskTitle` and `isGeneratedWorktree` to the library import in `scripts/uat-worktree.mjs`. Replace `readTaskTitle` with:

```js
export function readTaskSource(checkoutPath, read = readFileSync) {
  try {
    return read(path.join(checkoutPath, "TASK.md"), "utf8");
  } catch {
    return null;
  }
}
```

Replace the label-resolution prefix of `runUatLauncher`, from `const records` through creation of `labeledRecords`, with:

```js
  const records = sortWorktrees(
    parseWorktreePorcelain(deps.gitWorktreeOutput),
    deps.repoRoot,
  );
  const mainRecord = records.find((record) => record.branch === "main");
  const mainTaskSource = mainRecord ? deps.taskSource(mainRecord.path) : null;
  const labeledRecords = disambiguateWorktreeLabels(
    records.map((record) => {
      let metadata = {};
      if (isGeneratedWorktree(record)) {
        const taskSource = deps.taskSource(record.path);
        const taskTitle =
          mainTaskSource !== null &&
          taskSource !== null &&
          taskSource !== mainTaskSource
            ? extractTaskTitle(taskSource)
            : null;
        metadata = {
          taskTitle,
          commitSubject: taskTitle ? null : deps.commitSubject(record.path),
        };
      }
      return {
        record,
        label: formatWorktreeLabel(record, metadata),
      };
    }),
  );
```

In `main()`, replace `worktreeMetadata` with:

```js
      taskSource: (checkoutPath) => readTaskSource(checkoutPath),
      commitSubject: (checkoutPath) => readCommitSubject(checkoutPath),
```

Do not move selection validation below any preflight operation. Do not change `evaluatePreflight`, `checkPortAvailable`, `findNextDevLockHolders`, `buildDevInvocation`, or `launchDevServer`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts
```

Expected: PASS with all launcher tests green.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/uat-worktree.mjs tests/scripts/uat-worktree-runtime.test.ts
git commit -m "fix(dev): reject inherited UAT task labels"
```

---

### Task 3: Whole-feature verification and closeout

**Files:**
- Modify: `docs/superpowers/specs/2026-07-19-uat-menu-labels-design.md`
- Modify: `docs/tasks/archive/2026-07-19-uat-menu-labels.md`
- Restore: `TASK.md` from `main`

**Interfaces:**
- Consumes: completed behavior from Tasks 1 and 2.
- Produces: fresh automated and live evidence, an accurate completed archive, and a final root `TASK.md` matching `main`.

- [ ] **Step 1: Run focused and project verification**

Run each command separately:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts
npm test -- --run
npm run typecheck
npm run lint
```

Expected: focused and full tests pass, typecheck exits 0, and lint has zero errors. The pre-existing unused `label` warning in `scripts/check-student-feedback-states.mjs` may remain.

- [ ] **Step 2: Smoke-test the corrected menu and Exit through the real entrypoint**

Run:

```bash
expect -c 'spawn npm run uat; expect "2. UAT menu labels"; expect -re {([0-9]+)\. Exit}; set exit_number $expect_out(1,string); expect "Selection:"; send "$exit_number\r"; expect "Exited. No server was started."; expect eof; catch wait result; exit [lindex $result 3]'
```

Expected: the current descriptive worktree appears as `UAT menu labels`, the inherited dynamic-dialogue title does not label it, Exit is last, the confirmation prints, and the command exits 0.

- [ ] **Step 3: Smoke-test a real Main checkout selection and stop the server**

First confirm port 3200 is free:

```bash
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

Expected: no listener is printed.

Then run:

```bash
expect -c 'set timeout 60; spawn npm run uat; expect "Selection:"; send "1\r"; expect "Branch: main"; expect -re "Ready in|Ready"; set status [exec curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3200]; puts "HTTP_STATUS=$status"; send "\003"; expect eof'
```

Expected: `Branch: main` and `HTTP_STATUS=200` print, and Ctrl-C stops the server.

Run the listener check again:

```bash
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

Expected: no listener is printed. If a server started by this verification remains, stop that exact process before continuing.

- [ ] **Step 4: Record the fresh evidence and restore main's active task**

Change the design status to:

```markdown
**Status:** Implemented and verified
```

In `docs/tasks/archive/2026-07-19-uat-menu-labels.md`, change the status to `Complete`, rename `Originally delivered` to `Delivered`, and replace its label-resolution bullet with:

```markdown
- Descriptive worktrees use stable cleaned branch labels; generated and detached worktrees use a distinct task H1, latest commit subject, then cleaned generated name or directory.
```

Replace `## Current position` and its paragraph with:

```markdown
## Corrective verification results (2026-07-19)

- Focused launcher tests: passed.
- Full test suite: passed.
- Typecheck: passed.
- Lint: zero errors; the pre-existing unused `label` warning may remain.
- Interactive Exit: `UAT menu labels` rendered correctly, confirmation printed, exit code 0, and no server started.
- Interactive Main selection: returned HTTP 200 on port 3200 and stopped cleanly.
- Port 3200 was free after verification.

## Current position

Corrected, verified, and ready for integration.
```

Replace generic `passed` wording with the exact file, test, skip, error, and warning counts observed in Step 1. Record a smoke result only when its command actually succeeds.

Restore the root task from `main`:

```bash
git restore --source=main -- TASK.md
```

Verify the restored file is identical:

```bash
git diff --exit-code main -- TASK.md
```

Expected: exit code 0 and no diff.

- [ ] **Step 5: Review the complete correction diff**

Run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Expected: no whitespace errors; only the UAT launcher, its tests, approved design/plan, and task records differ; no development server is running.

- [ ] **Step 6: Commit closeout evidence**

```bash
git add TASK.md docs/superpowers/specs/2026-07-19-uat-menu-labels-design.md docs/tasks/archive/2026-07-19-uat-menu-labels.md
git commit -m "docs: verify reliable UAT menu labels"
```

- [ ] **Step 7: Run the final whole-branch gate**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts
git status --short
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

Expected: focused tests pass, the worktree is clean, and port 3200 has no listener.
