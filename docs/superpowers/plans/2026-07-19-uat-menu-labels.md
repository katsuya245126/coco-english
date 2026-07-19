# Human-readable UAT Menu Labels and Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run uat` show purpose-first checkout labels and a final Exit choice that returns successfully without running preflight or starting a server.

**Architecture:** Keep Git porcelain parsing and checkout launch behavior unchanged, but sort the actual `main` branch first even when invoked from a linked feature worktree. Add pure label selection and duplicate-disambiguation functions to the existing library, then inject read-only `TASK.md` and Git-subject metadata readers into the runtime menu flow.

**Tech Stack:** Node.js ESM, Git worktree porcelain output, Vitest, TypeScript checking, ESLint.

## Global Constraints

- The record whose branch is `main` always displays as `Main` and sorts first; when no `main` record exists, the launcher root remains the first fallback.
- Resolve other labels in this order: first `TASK.md` H1, latest commit subject, cleaned branch name, detached worktree directory name.
- Branch cleanup removes `worktree-` and `claude/`, converts hyphens and underscores to spaces, removes only a trailing hyphenated hexadecimal identifier of at least six characters, collapses whitespace, and capitalizes the first character.
- Latest-commit labels remove a leading conventional-commit type and optional scope (`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, or `test`), then trim and capitalize the first character.
- Compare duplicate labels case-insensitively and append the worktree directory name in brackets only to duplicates; the real `main` record always remains exactly `Main`.
- Print branch, absolute path, commit, and `http://localhost:3200` after checkout selection exactly as before.
- Print Exit last. Exit prints `Exited. No server was started.`, returns 0, and invokes no preflight or launch dependency.
- Invalid input remains exit code 1 and never launches.
- Read only the first single-line H1 from root `TASK.md`; never read environment-file contents or secrets.
- Do not add dependencies, rename or remove worktrees, change ngrok, change port 3200, or change application behavior.
- Preserve the unrelated dynamic-dialogue `TASK.md` from `main` when this task is archived.

---

### Task 1: Pure purpose-label resolution

**Files:**
- Modify: `scripts/uat-worktree-lib.mjs:35-49`
- Modify: `tests/scripts/uat-worktree-lib.test.ts:6-75`

**Interfaces:**
- Consumes: parsed records shaped as `{ path, head, branch, detached, locked }` from `parseWorktreePorcelain(source)`.
- Produces: `extractTaskTitle(source): string | null`.
- Produces: `cleanCommitSubject(value): string | null`.
- Produces: `cleanWorktreeName(value): string | null`.
- Produces: `formatWorktreeLabel(record, metadata?): string`, where metadata is `{ taskTitle?: string | null, commitSubject?: string | null }`.
- Produces: `disambiguateWorktreeLabels(entries): Array<{ record, label }>`, where entries already contain one record and resolved label.
- Changes: `sortWorktrees(records, repoRoot)` prefers `record.branch === "main"`, then `record.path === repoRoot`, then path order.

- [ ] **Step 1: Replace the old path-label assertions with failing purpose-label tests**

Add these imports to the existing namespace destructure in `tests/scripts/uat-worktree-lib.test.ts`:

```ts
const {
  UAT_PORT,
  buildDevInvocation,
  cleanCommitSubject,
  cleanWorktreeName,
  disambiguateWorktreeLabels,
  extractTaskTitle,
  formatWorktreeLabel,
  parseSelection,
  parseWorktreePorcelain,
  sortWorktrees,
} = uatWorktreeLib;
```

Replace the existing label test with explicit priority and fallback tests:

```ts
it("uses Main for the main branch and prefers task purpose over commit and branch metadata", () => {
  const [main, named] = parseWorktreePorcelain(porcelain);
  expect(formatWorktreeLabel(main)).toBe("Main");
  expect(
    formatWorktreeLabel(named, {
      taskTitle: "Dynamic dialogue pagination and open follow-ups",
      commitSubject: "fix: reject multi-question follow-ups",
    }),
  ).toBe("Dynamic dialogue pagination and open follow-ups");
});

it("sorts main first even when the launcher root is another worktree", () => {
  const records = parseWorktreePorcelain(porcelain);
  expect(
    sortWorktrees(records, "/tmp/external-coco-worktree").map(
      (record: { branch: string | null }) => record.branch,
    ),
  ).toEqual(["main", "worktree-dialogue-pagination", null]);
});

it("extracts only the first Markdown H1", () => {
  expect(extractTaskTitle("intro\n# First purpose\n## Detail\n# Later purpose\n")).toBe(
    "First purpose",
  );
  expect(extractTaskTitle("## Detail only\n")).toBeNull();
});

it("falls back through cleaned commit subject, cleaned branch, and detached directory", () => {
  const [, named, detached] = parseWorktreePorcelain(porcelain);
  expect(formatWorktreeLabel(named, { commitSubject: "perf: pin functions to Seoul" })).toBe(
    "Pin functions to Seoul",
  );
  expect(formatWorktreeLabel(named)).toBe("Dialogue pagination");
  expect(formatWorktreeLabel(detached)).toBe("External coco worktree");
});

it("cleans conventional commit types and optional scopes", () => {
  expect(cleanCommitSubject("fix(11): restore hints and clear Coco face")).toBe(
    "Restore hints and clear Coco face",
  );
  expect(cleanCommitSubject("A plain purpose")).toBe("A plain purpose");
  expect(cleanCommitSubject("fix:   ")).toBeNull();
});

it("cleans only known prefixes, separators, whitespace, and generated hex suffixes", () => {
  expect(cleanWorktreeName("worktree-dynamic_dialogue-pagination")).toBe(
    "Dynamic dialogue pagination",
  );
  expect(cleanWorktreeName("claude/clever-northcutt-200ab2")).toBe("Clever northcutt");
  expect(cleanWorktreeName("feature-v2")).toBe("Feature v2");
  expect(cleanWorktreeName("---")).toBeNull();
});

it("adds directory disambiguators only to case-insensitive duplicate labels", () => {
  const records = parseWorktreePorcelain(porcelain);
  const labeled = disambiguateWorktreeLabels([
    { record: records[0], label: "Main" },
    { record: records[1], label: "Same purpose" },
    { record: records[2], label: "same PURPOSE" },
  ]);
  expect(labeled.map(({ label }: { label: string }) => label)).toEqual([
    "Main",
    "Same purpose [dialogue-pagination]",
    "same PURPOSE [external-coco-worktree]",
  ]);
});

it("keeps the real Main label unsuffixed when another worktree resolves to Main", () => {
  const [main, named] = parseWorktreePorcelain(porcelain);
  expect(
    disambiguateWorktreeLabels([
      { record: main, label: "Main" },
      { record: named, label: "main" },
    ]).map(({ label }: { label: string }) => label),
  ).toEqual(["Main", "main [dialogue-pagination]"]);
});
```

- [ ] **Step 2: Run the library tests and verify RED**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts
```

Expected: FAIL because `cleanWorktreeName`, `disambiguateWorktreeLabels`, and `extractTaskTitle` are not exported and the old `formatWorktreeLabel` still exposes branch/path details.

- [ ] **Step 3: Implement main-first sorting and the pure label functions**

Replace `sortWorktrees` with:

```js
export function sortWorktrees(records, repoRoot) {
  return [...records].sort((left, right) => {
    if (left.branch === "main") return -1;
    if (right.branch === "main") return 1;
    if (left.path === repoRoot) return -1;
    if (right.path === repoRoot) return 1;
    return left.path.localeCompare(right.path);
  });
}
```

Replace the old `formatWorktreeLabel` block in `scripts/uat-worktree-lib.mjs` with:

```js
export function extractTaskTitle(source) {
  const match = source.match(/^#\s+(.+?)\s*$/mu);
  return match?.[1]?.trim() || null;
}

export function cleanWorktreeName(value) {
  const cleaned = value
    .replace(/^claude\//u, "")
    .replace(/^worktree-/u, "")
    .replace(/-[0-9a-f]{6,}$/iu, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return null;
  return `${cleaned[0].toUpperCase()}${cleaned.slice(1)}`;
}

export function cleanCommitSubject(value) {
  const cleaned = value
    .replace(
      /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([^)]*\))?!?:\s*/iu,
      "",
    )
    .trim();
  if (!cleaned) return null;
  return `${cleaned[0].toUpperCase()}${cleaned.slice(1)}`;
}

export function formatWorktreeLabel(record, metadata = {}) {
  if (record.branch === "main") return "Main";
  const taskTitle = metadata.taskTitle?.trim();
  if (taskTitle) return taskTitle;
  const commitSubject = metadata.commitSubject?.trim();
  if (commitSubject) {
    const cleanedSubject = cleanCommitSubject(commitSubject);
    if (cleanedSubject) return cleanedSubject;
  }
  return cleanWorktreeName(record.branch ?? path.basename(record.path)) ?? "Detached checkout";
}

export function disambiguateWorktreeLabels(entries) {
  const counts = new Map();
  for (const { label } of entries) {
    const key = label.toLocaleLowerCase("en-US");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map(({ record, label }) => {
    const key = label.toLocaleLowerCase("en-US");
    if (counts.get(key) === 1 || record.branch === "main") return { record, label };
    return { record, label: `${label} [${path.basename(record.path)}]` };
  });
}
```

- [ ] **Step 4: Run the library tests and verify GREEN**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts
```

Expected: PASS with all library tests green.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/uat-worktree-lib.mjs tests/scripts/uat-worktree-lib.test.ts
git commit -m "feat(dev): resolve readable UAT labels"
```

---

### Task 2: Runtime metadata and Exit flow

**Files:**
- Modify: `scripts/uat-worktree.mjs:1-14,86-145`
- Modify: `tests/scripts/uat-worktree-runtime.test.ts:1-165`

**Interfaces:**
- Consumes: `extractTaskTitle`, `formatWorktreeLabel`, and `disambiguateWorktreeLabels` from Task 1.
- Produces: `readTaskTitle(checkoutPath, read?): string | null`.
- Produces: `readCommitSubject(checkoutPath, run?): string | null`.
- Extends `runUatLauncher(deps)` with `deps.worktreeMetadata(checkoutPath): { taskTitle, commitSubject }`.
- Preserves all existing preflight and `buildDevInvocation(checkoutPath)` behavior.

- [ ] **Step 1: Add failing runtime metadata and Exit tests**

Use this runtime import destructure, then add the tests below to `tests/scripts/uat-worktree-runtime.test.ts`:

```ts
const {
  checkPortAvailable,
  evaluatePreflight,
  findNextDevLockHolders,
  readCommitSubject,
  readTaskTitle,
  runUatLauncher,
} = uatWorktreeRuntime;
```

```ts
it("reads task purpose and commit subject with null fallbacks", () => {
  const read = vi.fn(() => "# Purpose from task\n");
  expect(readTaskTitle("/tmp/feature", read)).toBe("Purpose from task");
  expect(read).toHaveBeenCalledWith("/tmp/feature/TASK.md", "utf8");
  expect(readTaskTitle("/tmp/feature", () => { throw new Error("missing"); })).toBeNull();

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

Add an Exit test with spies for every operation that must be skipped:

```ts
it("prints Exit last and exits successfully without preflight or launch", async () => {
  const output: string[] = [];
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
    worktreeMetadata: () => ({}),
    prompt: async () => "2",
    write: (line: string) => output.push(line),
    portAvailable,
    lockHolderPids,
    checkoutExists,
    dependenciesInstalled,
    envFileExists,
    launch,
  });

  expect(result).toBe(0);
  expect(output).toEqual([
    "Select the checkout to serve for phone UAT:",
    "1. Main",
    "2. Exit",
    "Exited. No server was started.",
  ]);
  expect(portAvailable).not.toHaveBeenCalled();
  expect(lockHolderPids).not.toHaveBeenCalled();
  expect(checkoutExists).not.toHaveBeenCalled();
  expect(dependenciesInstalled).not.toHaveBeenCalled();
  expect(envFileExists).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});
```

Update the existing successful-selection fixture with:

```ts
worktreeMetadata: (checkoutPath: string) =>
  checkoutPath === "/tmp/feature"
    ? { taskTitle: "Readable feature purpose", commitSubject: "ignored fallback" }
    : {},
```

After the successful call, add these assertions before the existing provenance assertions:

```ts
const branchLine = output.indexOf("Branch: codex/feature");
const menuOutput = output.slice(0, branchLine).join("\n");
expect(menuOutput).toContain("1. Main");
expect(menuOutput).toContain("2. Readable feature purpose");
expect(menuOutput).toContain("3. Exit");
expect(menuOutput).not.toContain("/tmp/feature");
```

Add this dependency to the invalid-selection fixture:

```ts
worktreeMetadata: () => ({}),
```

- [ ] **Step 2: Run the runtime tests and verify RED**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-runtime.test.ts
```

Expected: FAIL because the metadata readers and Exit flow do not exist and the menu still prints technical labels.

- [ ] **Step 3: Implement read-only metadata readers**

Change the filesystem import and library imports in `scripts/uat-worktree.mjs`:

```js
import { existsSync, readFileSync } from "node:fs";
```

```js
import {
  UAT_PORT,
  buildDevInvocation,
  disambiguateWorktreeLabels,
  extractTaskTitle,
  formatWorktreeLabel,
  parseSelection,
  parseWorktreePorcelain,
  sortWorktrees,
} from "./uat-worktree-lib.mjs";
```

Add these runtime helpers after `findNextDevLockHolders`:

```js
export function readTaskTitle(checkoutPath, read = readFileSync) {
  try {
    return extractTaskTitle(read(path.join(checkoutPath, "TASK.md"), "utf8"));
  } catch {
    return null;
  }
}

export function readCommitSubject(checkoutPath, run = execFileSync) {
  try {
    return (
      run("git", ["-C", checkoutPath, "log", "-1", "--format=%s"], { encoding: "utf8" })
        .trim() || null
    );
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement purpose labels and Exit before preflight**

Replace the menu/selection prefix of `runUatLauncher` through `const selected` with:

```js
  const records = sortWorktrees(
    parseWorktreePorcelain(deps.gitWorktreeOutput),
    deps.repoRoot,
  );
  const labeledRecords = disambiguateWorktreeLabels(
    records.map((record) => ({
      record,
      label: formatWorktreeLabel(
        record,
        deps.worktreeMetadata(record.path),
      ),
    })),
  );
  deps.write("Select the checkout to serve for phone UAT:");
  labeledRecords.forEach(({ label }, index) => {
    deps.write(`${index + 1}. ${label}`);
  });
  const exitIndex = labeledRecords.length;
  deps.write(`${exitIndex + 1}. Exit`);
  const selection = parseSelection(
    await deps.prompt("Selection: "),
    labeledRecords.length + 1,
  );
  if (selection === null) {
    deps.write("Invalid selection. No server was started.");
    return 1;
  }
  if (selection === exitIndex) {
    deps.write("Exited. No server was started.");
    return 0;
  }
  const selected = labeledRecords[selection].record;
```

Add this dependency in `main()` before `prompt`:

```js
      worktreeMetadata: (checkoutPath) => ({
        taskTitle: readTaskTitle(checkoutPath),
        commitSubject: readCommitSubject(checkoutPath),
      }),
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts
```

Expected: PASS with all launcher tests green.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/uat-worktree.mjs tests/scripts/uat-worktree-runtime.test.ts
git commit -m "feat(dev): add readable UAT menu and exit"
```

---

### Task 3: Whole-feature verification and task closeout

**Files:**
- Create: `docs/tasks/archive/2026-07-19-uat-menu-labels.md`
- Modify: `docs/superpowers/specs/2026-07-19-uat-menu-labels-design.md:3`
- Restore before commit: `TASK.md` from `main`

**Interfaces:**
- Consumes: completed behavior from Tasks 1 and 2.
- Produces: reproducible verification evidence and a final branch tree whose root `TASK.md` matches `main`.

- [ ] **Step 1: Run focused and project verification**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts
npm test -- --run
npm run typecheck
npm run lint
```

Expected: focused and full tests pass, typecheck exits 0, and lint has zero errors. The known unused `label` warning in `scripts/check-student-feedback-states.mjs` may remain.

- [ ] **Step 2: Smoke-test Exit through the real entrypoint**

Run:

```bash
expect -c 'spawn npm run uat; expect -re {([0-9]+)\. Exit}; set exit_number $expect_out(1,string); expect "Selection:"; send "$exit_number\r"; expect "Exited. No server was started."; expect eof'
```

Expected: the menu shows purpose labels, Exit is last, the confirmation prints, the command exits 0, and port 3200 remains free.

- [ ] **Step 3: Smoke-test a real checkout selection**

Run:

```bash
expect -c 'set timeout 60; spawn npm run uat; expect "Selection:"; send "1\r"; expect -re "Ready in|Ready"; set status [exec curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3200]; puts "HTTP_STATUS=$status"; send "\003"; expect eof'
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

Expected: the selected record is `Branch: main`, `HTTP_STATUS=200` prints, the server exits after Ctrl-C, and the final `lsof` command prints no listener.

- [ ] **Step 4: Record exact evidence and restore the inherited task brief**

Create `docs/tasks/archive/2026-07-19-uat-menu-labels.md` with this content:

```markdown
# Human-readable UAT menu labels and Exit

**Status:** Complete

## Goal

Make `npm run uat` identify worktrees by purpose and provide a successful Exit option that never starts preflight or a server.

## Delivered

- Main sorts first and displays as `Main`, including when invoked from a linked worktree.
- Other labels prefer root `TASK.md` H1, latest commit subject, cleaned branch, then detached directory name.
- Case-insensitive duplicate labels receive directory-name disambiguators.
- Exit prints last, returns 0, and skips all preflight and launch work.
- Checkout selection still prints branch, path, commit, and the fixed port-3200 URL.

## Verification results (2026-07-19)

- Focused launcher tests: 2 files passed, 23 tests passed.
- Full suite: 84 files passed, 745 tests passed, 4 skipped.
- Typecheck: passed.
- Lint: zero errors; the pre-existing unused `label` warning remains.
- Interactive Exit: confirmation printed, exit code 0, and no server started.
- Interactive Main selection: returned HTTP 200 on port 3200 and stopped cleanly.
- Port 3200 was free after verification.

## Current position

Implemented, verified, and ready for integration.
```

Change the design spec status line exactly to:

```markdown
**Status:** Implemented and verified
```

Restore the unrelated main task without copying or editing it manually:

```bash
git restore --source=main -- TASK.md
```

Confirm `git diff main...HEAD -- TASK.md` and `git diff -- TASK.md` are both empty before committing.

- [ ] **Step 5: Commit verification records**

```bash
git add TASK.md docs/tasks/archive/2026-07-19-uat-menu-labels.md docs/superpowers/specs/2026-07-19-uat-menu-labels-design.md
git commit -m "docs: record UAT menu verification"
```

- [ ] **Step 6: Review the final branch diff**

Run:

```bash
git diff --check main...HEAD
git status --short --branch
git diff --stat main...HEAD
```

Expected: clean worktree; only the approved scripts, launcher tests, design, plan, and archive differ from `main`; root `TASK.md` is unchanged.
