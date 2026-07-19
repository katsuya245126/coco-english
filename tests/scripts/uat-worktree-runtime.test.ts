import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// @ts-expect-error -- the runtime launcher is intentionally dependency-free ESM.
import * as uatWorktreeRuntime from "../../scripts/uat-worktree.mjs";

const {
  checkPortAvailable,
  evaluatePreflight,
  findNextDevLockHolders,
  runUatLauncher,
} = uatWorktreeRuntime;

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

  it("detects a genuinely occupied local port (127.0.0.1-bound occupant)", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    expect(await checkPortAvailable(address.port)).toBe(false);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("detects a dual-stack (no-host) occupant, matching a default `next dev -p` bind", async () => {
    const server = createServer();
    // No host argument: Node binds dual-stack (all interfaces), the default
    // `next dev -p <port>` shape with no `-H` flag.
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    expect(await checkPortAvailable(address.port)).toBe(false);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("reports a genuinely free port as available", async () => {
    // Reserve an ephemeral port, then release it immediately so it is very
    // likely free for the immediately-following check.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    const { port } = address;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
    expect(await checkPortAvailable(port)).toBe(true);
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
  it("keeps the prompt open long enough to process a selection", () => {
    const result = spawnSync(process.execPath, ["scripts/uat-worktree.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: "999\n",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Invalid selection. No server was started.");
  });

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
