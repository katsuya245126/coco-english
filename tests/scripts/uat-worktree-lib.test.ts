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
