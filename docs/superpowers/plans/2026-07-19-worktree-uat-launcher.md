# Worktree-aware UAT Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one `npm run uat` command that explicitly selects `main` or any Coco English worktree and serves it on the permanent phone-UAT port 3200.

**Architecture:** Keep the launcher outside the Next.js application as two small Node.js ESM files. A pure library parses and labels Git worktrees and constructs the development invocation; a thin CLI owns terminal prompts, read-only preflight checks, and child-process lifecycle. Vitest imports the exported `.mjs` functions with an intentional TypeScript suppression, so no runtime dependency or transpiler is added.

**Tech Stack:** Node.js built-ins, Git porcelain output, npm scripts, Vitest, TypeScript test files.

## Global Constraints

- `npm run dev` remains unchanged and continues to serve the repository-root checkout, normally `main`, on port 3000.
- `npm run uat` always serves the explicitly selected checkout on port 3200.
- ngrok remains a separate user-managed process pointed at port 3200; the launcher never starts, stops, configures, or authenticates ngrok.
- Discover worktrees from `git worktree list --porcelain`; do not assume they live under `.claude/worktrees`.
- Print the selected branch, absolute checkout path, commit, and `http://localhost:3200` before launch.
- Never create, remove, switch, merge, or modify Git worktrees or branches.
- Never kill an existing process, clear `.next`, install dependencies, or inspect/copy/print/symlink secret contents.
- An occupied UAT port or active Next.js development lock is a blocking error; a missing `.env.local` is a warning only.
- Preserve all unrelated working-tree changes.

---

### Task 1: Worktree discovery and explicit selection

**Files:**
- Create: `scripts/uat-worktree-lib.mjs`
- Create: `tests/scripts/uat-worktree-lib.test.ts`
- Modify: `TASK.md`

**Interfaces:**
- Produces: `UAT_PORT`, `parseWorktreePorcelain(source)`, `sortWorktrees(records, repoRoot)`, `formatWorktreeLabel(record, repoRoot)`, `parseSelection(input, count)`, and `buildDevInvocation(checkoutPath)`.
- Consumes: only Node.js `path`; no Git mutation, filesystem write, or process control.

- [ ] **Step 1: Replace the inherited task brief with this checkout's active task**

Use `apply_patch` to replace `TASK.md` with this exact content; the pagination
task remains owned by its separate worktree and is not archived from this branch:

```markdown
# Worktree-aware UAT launcher

**Status:** Implementation approved

## Goal

Add a reusable `npm run uat` command that lets the user select `main` or any Coco English worktree and serves it on port 3200 for a persistent ngrok phone-testing workflow.

## Scope

- Discover checkouts through Git worktree porcelain output.
- Require an explicit numbered selection.
- Print branch, path, commit, and UAT URL before launch.
- Refuse an occupied port or active Next.js development lock.
- Warn, without reading contents, when `.env.local` is absent.

## Non-goals

- Managing ngrok, Git branches, worktrees, caches, dependencies, secrets, or unrelated processes.
- Changing `npm run dev` or application behavior.

## Done Checks

- [ ] Pure discovery and selection tests pass.
- [ ] Runtime preflight and CLI tests pass.
- [ ] `npm run uat` can serve a selected worktree and `main` on port 3200.
- [ ] Typecheck, lint, and proportionate project tests pass.

## Current Position

Executing Task 1 of `docs/superpowers/plans/2026-07-19-worktree-uat-launcher.md`.
```

- [ ] **Step 2: Write the failing discovery and selection tests**

Create `tests/scripts/uat-worktree-lib.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// @ts-ignore -- the runtime launcher is intentionally dependency-free ESM.
import {
  UAT_PORT,
  buildDevInvocation,
  formatWorktreeLabel,
  parseSelection,
  parseWorktreePorcelain,
  sortWorktrees,
} from "../../scripts/uat-worktree-lib.mjs";

const repoRoot = "/projects/coco-english";
const porcelain = `worktree /projects/coco-english
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /projects/coco-english/.claude/worktrees/dialogue-pagination
HEAD 2222222222222222222222222222222222222222
branch refs/heads/worktree-dialogue-pagination
locked active session

worktree /tmp/external-coco-worktree
HEAD 3333333333333333333333333333333333333333
detached
`;

describe("UAT worktree discovery", () => {
  it("parses branch, detached, and locked porcelain records", () => {
    expect(parseWorktreePorcelain(porcelain)).toEqual([
      {
        path: "/projects/coco-english",
        head: "1111111111111111111111111111111111111111",
        branch: "main",
        detached: false,
        locked: null,
      },
      {
        path: "/projects/coco-english/.claude/worktrees/dialogue-pagination",
        head: "2222222222222222222222222222222222222222",
        branch: "worktree-dialogue-pagination",
        detached: false,
        locked: "active session",
      },
      {
        path: "/tmp/external-coco-worktree",
        head: "3333333333333333333333333333333333333333",
        branch: null,
        detached: true,
        locked: null,
      },
    ]);
  });

  it("keeps the repository root first and sorts the rest deterministically", () => {
    const records = parseWorktreePorcelain(porcelain).reverse();
    expect(sortWorktrees(records, repoRoot).map((record: { path: string }) => record.path)).toEqual([
      repoRoot,
      "/projects/coco-english/.claude/worktrees/dialogue-pagination",
      "/tmp/external-coco-worktree",
    ]);
  });

  it("labels main, named worktrees, and detached external paths clearly", () => {
    const [main, named, detached] = parseWorktreePorcelain(porcelain);
    expect(formatWorktreeLabel(main, repoRoot)).toBe("main — repository root");
    expect(formatWorktreeLabel(named, repoRoot)).toBe(
      "worktree-dialogue-pagination — .claude/worktrees/dialogue-pagination",
    );
    expect(formatWorktreeLabel(detached, repoRoot)).toBe(
      "(detached) — /tmp/external-coco-worktree",
    );
  });
});

describe("UAT selection", () => {
  it("accepts one-based integer selections only", () => {
    expect(parseSelection(" 2 ", 3)).toBe(1);
    expect(parseSelection("", 3)).toBeNull();
    expect(parseSelection("0", 3)).toBeNull();
    expect(parseSelection("4", 3)).toBeNull();
    expect(parseSelection("1.5", 3)).toBeNull();
  });

  it("constructs the fixed-port npm invocation without a prefix path", () => {
    expect(UAT_PORT).toBe(3200);
    expect(buildDevInvocation("/tmp/external-coco-worktree")).toEqual({
      command: "npm",
      args: ["run", "dev", "--", "-p", "3200"],
      cwd: "/tmp/external-coco-worktree",
    });
  });
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts
```

Expected: FAIL because `scripts/uat-worktree-lib.mjs` does not exist.

- [ ] **Step 4: Implement the pure discovery and selection library**

Create `scripts/uat-worktree-lib.mjs`:

```javascript
import path from "node:path";

export const UAT_PORT = 3200;

export function parseWorktreePorcelain(source) {
  return source
    .trim()
    .split(/\n\s*\n/u)
    .filter(Boolean)
    .map((block) => {
      const record = {
        path: "",
        head: "",
        branch: null,
        detached: false,
        locked: null,
      };

      for (const line of block.split("\n")) {
        if (line.startsWith("worktree ")) record.path = line.slice(9);
        else if (line.startsWith("HEAD ")) record.head = line.slice(5);
        else if (line.startsWith("branch refs/heads/")) record.branch = line.slice(18);
        else if (line === "detached") record.detached = true;
        else if (line === "locked") record.locked = "locked";
        else if (line.startsWith("locked ")) record.locked = line.slice(7);
      }

      if (!record.path || !record.head) {
        throw new Error("Git returned an incomplete worktree record.");
      }
      return record;
    });
}

export function sortWorktrees(records, repoRoot) {
  return [...records].sort((left, right) => {
    if (left.path === repoRoot) return -1;
    if (right.path === repoRoot) return 1;
    return left.path.localeCompare(right.path);
  });
}

export function formatWorktreeLabel(record, repoRoot) {
  const branch = record.branch ?? "(detached)";
  if (record.path === repoRoot) return `${branch} — repository root`;
  const relativePath = path.relative(repoRoot, record.path);
  const displayPath = relativePath.startsWith("..") ? record.path : relativePath;
  return `${branch} — ${displayPath}`;
}

export function parseSelection(input, count) {
  const value = input.trim();
  if (!/^\d+$/u.test(value)) return null;
  const oneBased = Number(value);
  if (oneBased < 1 || oneBased > count) return null;
  return oneBased - 1;
}

export function buildDevInvocation(checkoutPath) {
  return {
    command: "npm",
    args: ["run", "dev", "--", "-p", String(UAT_PORT)],
    cwd: checkoutPath,
  };
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts
```

Expected: 1 file PASS, 5 tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add TASK.md scripts/uat-worktree-lib.mjs tests/scripts/uat-worktree-lib.test.ts
git commit -m "feat(dev): discover UAT worktrees"
```

---

### Task 2: Safe interactive launcher and npm command

**Files:**
- Create: `scripts/uat-worktree.mjs`
- Create: `tests/scripts/uat-worktree-runtime.test.ts`
- Modify: `package.json`
- Modify: `TASK.md`
- Create on completion: `docs/tasks/archive/2026-07-19-worktree-uat-launcher.md`

**Interfaces:**
- Consumes: Task 1's `UAT_PORT`, discovery/label/selection helpers, and `buildDevInvocation()`.
- Produces: `npm run uat`, plus exported `checkPortAvailable(port)`, `findNextDevLockHolders(checkoutPath, run)`, `evaluatePreflight(input)`, and `runUatLauncher(deps)` for focused tests.

- [ ] **Step 1: Write failing runtime/preflight tests**

Create `tests/scripts/uat-worktree-runtime.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";

// @ts-ignore -- the runtime launcher is intentionally dependency-free ESM.
import {
  checkPortAvailable,
  evaluatePreflight,
  findNextDevLockHolders,
  runUatLauncher,
} from "../../scripts/uat-worktree.mjs";

describe("UAT runtime preflight", () => {
  it("blocks missing checkout setup, an occupied port, and an active lock but only warns for missing env", () => {
    expect(
      evaluatePreflight({
        checkoutExists: false,
        dependenciesInstalled: false,
        portAvailable: false,
        lockHolderPids: ["123"],
        envFileExists: false,
      }),
    ).toEqual({
      ok: false,
      errors: [
        "The selected checkout no longer exists. Refresh the worktree list and try again.",
        "The selected checkout is missing node_modules. Install dependencies there first.",
        "Port 3200 is already in use. Stop that server before starting UAT.",
        "The selected checkout already has a Next.js dev server (PID 123). Stop it first.",
      ],
      warnings: ["No .env.local was found in the selected checkout."],
    });
  });

  it("detects a genuinely occupied local port", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    expect(await checkPortAvailable(address.port)).toBe(false);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("uses lsof only to inspect the selected checkout's held dev lock", () => {
    const run = vi.fn(() => ({ status: 0, stdout: "123\n456\n" }));
    expect(findNextDevLockHolders("/tmp/coco", run)).toEqual(["123", "456"]);
    expect(run).toHaveBeenCalledWith(
      "lsof",
      ["-t", "/tmp/coco/.next/dev/lock"],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });
});

describe("runUatLauncher", () => {
  it("lists worktrees, requires selection, prints provenance, and launches only npm dev", async () => {
    const output: string[] = [];
    const launch = vi.fn(async () => 0);
    const result = await runUatLauncher({
      repoRoot: "/projects/coco-english",
      gitWorktreeOutput: `worktree /projects/coco-english
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /tmp/feature
HEAD 2222222222222222222222222222222222222222
branch refs/heads/codex/feature
`,
      prompt: async () => "2",
      write: (line: string) => output.push(line),
      portAvailable: async () => true,
      lockHolderPids: async () => [],
      envFileExists: () => true,
      checkoutExists: () => true,
      dependenciesInstalled: () => true,
      launch,
    });

    expect(result).toBe(0);
    expect(output.join("\n")).toContain("codex/feature");
    expect(output.join("\n")).toContain("/tmp/feature");
    expect(output.join("\n")).toContain("2222222");
    expect(output.join("\n")).toContain("http://localhost:3200");
    expect(launch).toHaveBeenCalledWith({
      command: "npm",
      args: ["run", "dev", "--", "-p", "3200"],
      cwd: "/tmp/feature",
    });
  });

  it("does not launch after an invalid selection", async () => {
    const launch = vi.fn(async () => 0);
    const result = await runUatLauncher({
      repoRoot: "/projects/coco-english",
      gitWorktreeOutput: `worktree /projects/coco-english
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main
`,
      prompt: async () => "9",
      write: () => undefined,
      portAvailable: async () => true,
      lockHolderPids: async () => [],
      envFileExists: () => true,
      checkoutExists: () => true,
      dependenciesInstalled: () => true,
      launch,
    });

    expect(result).toBe(1);
    expect(launch).not.toHaveBeenCalled();
  });

  it("registers only the intended npm entrypoint and contains no cleanup commands", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const source = readFileSync("scripts/uat-worktree.mjs", "utf8");
    expect(packageJson.scripts?.uat).toBe("node scripts/uat-worktree.mjs");
    expect(source).toContain('["-C", repoRoot, "worktree", "list", "--porcelain"]');
    expect(source).not.toMatch(/worktree[\s\S]*(remove|prune)|rm -rf|process\.kill/u);
  });
});
```

- [ ] **Step 2: Run the runtime tests and verify RED**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-runtime.test.ts
```

Expected: FAIL because `scripts/uat-worktree.mjs` does not exist.

- [ ] **Step 3: Implement the runtime and interactive CLI**

Create `scripts/uat-worktree.mjs` with these exported behaviors:

```javascript
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import {
  UAT_PORT,
  buildDevInvocation,
  formatWorktreeLabel,
  parseSelection,
  parseWorktreePorcelain,
  sortWorktrees,
} from "./uat-worktree-lib.mjs";

export function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen({ port, exclusive: true });
  });
}

export function findNextDevLockHolders(checkoutPath, run = spawnSync) {
  const result = run("lsof", ["-t", path.join(checkoutPath, ".next/dev/lock")], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("lsof is required to check for an active Next.js development lock.");
  }
  if (result.status !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}

export function evaluatePreflight({
  checkoutExists,
  dependenciesInstalled,
  portAvailable,
  lockHolderPids,
  envFileExists,
}) {
  const errors = [];
  const warnings = [];
  if (!checkoutExists) {
    errors.push("The selected checkout no longer exists. Refresh the worktree list and try again.");
  }
  if (!dependenciesInstalled) {
    errors.push("The selected checkout is missing node_modules. Install dependencies there first.");
  }
  if (!portAvailable) {
    errors.push("Port 3200 is already in use. Stop that server before starting UAT.");
  }
  if (lockHolderPids.length > 0) {
    errors.push(
      `The selected checkout already has a Next.js dev server (PID ${lockHolderPids.join(", ")}). Stop it first.`,
    );
  }
  if (!envFileExists) warnings.push("No .env.local was found in the selected checkout.");
  return { ok: errors.length === 0, errors, warnings };
}

function launchDevServer(invocation) {
  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      stdio: "inherit",
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

export async function runUatLauncher(deps) {
  const records = sortWorktrees(
    parseWorktreePorcelain(deps.gitWorktreeOutput),
    deps.repoRoot,
  );
  deps.write("Select the checkout to serve for phone UAT:");
  records.forEach((record, index) => {
    deps.write(`${index + 1}. ${formatWorktreeLabel(record, deps.repoRoot)}`);
  });
  const selection = parseSelection(await deps.prompt("Selection: "), records.length);
  if (selection === null) {
    deps.write("Invalid selection. No server was started.");
    return 1;
  }
  const selected = records[selection];
  const [portAvailable, lockHolderPids] = await Promise.all([
    deps.portAvailable(),
    deps.lockHolderPids(selected.path),
  ]);
  const preflight = evaluatePreflight({
    checkoutExists: deps.checkoutExists(selected.path),
    dependenciesInstalled: deps.dependenciesInstalled(selected.path),
    portAvailable,
    lockHolderPids,
    envFileExists: deps.envFileExists(selected.path),
  });
  preflight.warnings.forEach(deps.write);
  if (!preflight.ok) {
    preflight.errors.forEach(deps.write);
    return 1;
  }
  deps.write(`Branch: ${selected.branch ?? "(detached)"}`);
  deps.write(`Checkout: ${selected.path}`);
  deps.write(`Commit: ${selected.head.slice(0, 7)}`);
  deps.write(`UAT URL: http://localhost:${UAT_PORT}`);
  return deps.launch(buildDevInvocation(selected.path));
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const gitWorktreeOutput = execFileSync(
    "git",
    ["-C", repoRoot, "worktree", "list", "--porcelain"],
    { encoding: "utf8" },
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return runUatLauncher({
      repoRoot,
      gitWorktreeOutput,
      prompt: (question) => rl.question(question),
      write: (line) => process.stdout.write(`${line}\n`),
      portAvailable: () => checkPortAvailable(UAT_PORT),
      lockHolderPids: async (checkoutPath) => findNextDevLockHolders(checkoutPath),
      envFileExists: (checkoutPath) => existsSync(path.join(checkoutPath, ".env.local")),
      checkoutExists: (checkoutPath) => existsSync(checkoutPath),
      dependenciesInstalled: (checkoutPath) =>
        existsSync(path.join(checkoutPath, "node_modules/.bin/next")),
      launch: launchDevServer,
    });
  } finally {
    rl.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
```

- [ ] **Step 4: Add the stable npm entrypoint**

Add this key to `package.json`'s `scripts` object without changing `dev`:

```json
"uat": "node scripts/uat-worktree.mjs"
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts
```

Expected: 2 files PASS, 11 tests PASS.

- [ ] **Step 6: Run proportionate project verification**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --run
```

Expected: typecheck PASS; lint 0 errors with only previously recorded warnings; full test suite PASS with the repository's existing skips unchanged.

- [ ] **Step 7: Perform the local launcher smoke check**

With port 3000 already stopped, run:

```bash
npm run uat
```

Verify both selections in separate runs:

1. Select `main`; confirm the printed checkout is the repository root and `http://localhost:3200` loads.
2. Stop the server with Ctrl-C, rerun `npm run uat`, select a linked worktree, and confirm the printed branch/path/commit match that worktree and `http://localhost:3200` loads it.
3. If ngrok is already running against port 3200, refresh its existing HTTPS URL and confirm it follows the second selection without restarting ngrok.

Stop the UAT server before continuing.

- [ ] **Step 8: Complete and archive the task brief**

Use `apply_patch` to update `TASK.md`, mark all Done Checks complete, and add the
exact verification commands/results observed in Steps 5-7. Then use
`apply_patch` to create
`docs/tasks/archive/2026-07-19-worktree-uat-launcher.md` with that exact updated
content and delete root `TASK.md`.

Set `**Status:** Complete` and `## Current Position` to `Implemented, verified, and ready for integration.`

- [ ] **Step 9: Commit Task 2**

```bash
git add package.json scripts/uat-worktree.mjs tests/scripts/uat-worktree-runtime.test.ts TASK.md docs/tasks/archive/2026-07-19-worktree-uat-launcher.md
git commit -m "feat(dev): add worktree UAT launcher"
```

Because `TASK.md` is moved, stage only the existing deletion and the exact archive path; do not stage unrelated files.
