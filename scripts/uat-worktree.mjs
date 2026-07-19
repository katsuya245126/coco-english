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
    server.listen({ port, host: "127.0.0.1", exclusive: true });
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
