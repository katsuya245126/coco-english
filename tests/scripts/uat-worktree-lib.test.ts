import { describe, expect, it } from "vitest";

// @ts-expect-error -- the runtime launcher is intentionally dependency-free ESM.
import * as uatWorktreeLib from "../../scripts/uat-worktree-lib.mjs";

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

  it("sorts main first even when the launcher root is another worktree", () => {
    const records = parseWorktreePorcelain(porcelain);
    expect(
      sortWorktrees(records, "/tmp/external-coco-worktree").map(
        (record: { branch: string | null }) => record.branch,
      ),
    ).toEqual(["main", "worktree-dialogue-pagination", null]);
  });

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
